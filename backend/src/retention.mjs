import { appError } from "./errors.mjs";
import { id, nowIso } from "./utils.mjs";

export const TERMINAL_TICKET_STATUSES = Object.freeze(["resolved", "closed"]);
export const RETENTION_GC_PENDING = "retention_attachment_gc_pending";
export const RETENTION_EVICTED = "retention_ticket_evicted";

function finiteBytes(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function terminalTime(ticket) {
  return String(ticket.resolvedAt || ticket.updatedAt || ticket.createdAt || "");
}

function compareTerminalTickets(a, b) {
  return terminalTime(a).localeCompare(terminalTime(b))
    || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
    || String(a.id || "").localeCompare(String(b.id || ""));
}

function ticketCapacityError(maxTickets) {
  return appError(
    `Hệ thống đã đạt giới hạn ${maxTickets} yêu cầu và chưa có yêu cầu đã xử lý/đã đóng để giải phóng. Vui lòng thử lại sau.`,
    { status: 409, code: "TICKET_CAPACITY_REACHED" },
  );
}

function attachmentBudgetError(maxBytes) {
  const maxMb = Math.round(maxBytes / 1024 / 1024);
  return appError(
    `Tổng dung lượng ảnh/file của mỗi yêu cầu được phép tối đa ${maxMb} MB.`,
    { status: 413, code: "TICKET_ATTACHMENT_BUDGET_EXCEEDED" },
  );
}

export function ticketAttachmentBytes(db, ticketId) {
  return (db.attachments || [])
    .filter((item) => item.ticketId === ticketId)
    .reduce((total, item) => total + finiteBytes(item.size), 0);
}

export function remainingTicketAttachmentBytes(db, ticketId, maxBytes) {
  return Math.max(0, maxBytes - ticketAttachmentBytes(db, ticketId));
}

export function assertTicketAttachmentBudget(db, ticketId, incoming = [], maxBytes) {
  const incomingBytes = incoming.reduce((total, item) => total + finiteBytes(item.size), 0);
  const totalBytes = ticketAttachmentBytes(db, ticketId) + incomingBytes;
  if (totalBytes > maxBytes) {
    throw attachmentBudgetError(maxBytes);
  }
  return { incomingBytes, totalBytes };
}

export function assertTicketSlotAvailable(db, maxTickets) {
  if ((db.tickets || []).length < maxTickets) return;
  if ((db.tickets || []).some((ticket) => TERMINAL_TICKET_STATUSES.includes(ticket.status))) return;
  throw ticketCapacityError(maxTickets);
}

function isRelatedAudit(entry, ticketId, attachmentIds) {
  if (entry.entityType === "ticket" && entry.entityId === ticketId) return true;
  if (entry.entityType === "attachment" && attachmentIds.has(entry.entityId)) return true;
  return entry.detail?.ticketId === ticketId;
}

function evictTicket(db, ticket, at) {
  const ticketId = ticket.id;
  const attachments = db.attachments.filter((item) => item.ticketId === ticketId);
  const attachmentIds = new Set(attachments.map((item) => item.id));

  db.tickets = db.tickets.filter((item) => item.id !== ticketId);
  db.messages = db.messages.filter((item) => item.ticketId !== ticketId);
  db.attachments = db.attachments.filter((item) => item.ticketId !== ticketId);
  db.notifications = db.notifications.filter((item) => item.ticketId !== ticketId);
  db.ticketHistory = db.ticketHistory.filter((item) => item.ticketId !== ticketId);
  db.aiCopilotRuns = db.aiCopilotRuns.filter((item) => item.ticketId !== ticketId);
  db.auditLog = db.auditLog.filter((item) => !isRelatedAudit(item, ticketId, attachmentIds));

  const bytesToRelease = attachments.reduce((total, item) => total + finiteBytes(item.size), 0);
  const cleanupId = id("gc");
  db.auditLog.push({
    id: cleanupId,
    actor: "system-retention",
    action: attachments.length ? RETENTION_GC_PENDING : RETENTION_EVICTED,
    entityType: "ticket_retention",
    entityId: ticketId,
    detail: {
      ticketCode: ticket.code || "",
      ticketStatus: ticket.status,
      filesDeleted: 0,
      bytesReleased: attachments.length ? 0 : bytesToRelease,
      requestedAt: at,
      ...(attachments.length
        ? {
            attachments: attachments.map((item) => ({
              id: item.id,
              storagePath: item.storagePath,
              size: finiteBytes(item.size),
            })),
          }
        : { completedAt: at }),
    },
    createdAt: at,
  });

  return {
    ticketId,
    ticketCode: ticket.code || "",
    cleanupId,
    attachmentCount: attachments.length,
    bytesToRelease,
  };
}

export function reserveTicketSlot(db, { maxTickets, at = nowIso() }) {
  const requiredSlots = Math.max(0, (db.tickets || []).length - maxTickets + 1);
  if (!requiredSlots) return { evicted: [] };

  const candidates = (db.tickets || [])
    .filter((ticket) => TERMINAL_TICKET_STATUSES.includes(ticket.status))
    .sort(compareTerminalTickets);
  if (candidates.length < requiredSlots) throw ticketCapacityError(maxTickets);

  return {
    evicted: candidates.slice(0, requiredSlots).map((ticket) => evictTicket(db, ticket, at)),
  };
}

export function pendingRetentionCleanups(db) {
  return (db.auditLog || [])
    .filter((entry) => entry.action === RETENTION_GC_PENDING)
    .map((entry) => ({
      id: entry.id,
      ticketId: entry.entityId,
      attachments: Array.isArray(entry.detail?.attachments) ? structuredClone(entry.detail.attachments) : [],
    }));
}

export function completeRetentionCleanup(db, cleanupId, at = nowIso()) {
  const entry = db.auditLog.find((item) => item.id === cleanupId && item.action === RETENTION_GC_PENDING);
  if (!entry) return false;
  const attachments = Array.isArray(entry.detail?.attachments) ? entry.detail.attachments : [];
  entry.action = RETENTION_EVICTED;
  entry.detail = {
    ticketCode: entry.detail?.ticketCode || "",
    ticketStatus: entry.detail?.ticketStatus || "",
    filesDeleted: attachments.length,
    bytesReleased: attachments.reduce((total, item) => total + finiteBytes(item.size), 0),
    requestedAt: entry.detail?.requestedAt || entry.createdAt,
    completedAt: at,
  };
  return true;
}

export async function processRetentionCleanups({ readDb, updateDb, removeAttachment }) {
  const pending = pendingRetentionCleanups(await readDb());
  const result = { completed: 0, failed: [] };
  for (const cleanup of pending) {
    try {
      for (const attachment of cleanup.attachments) await removeAttachment(attachment);
      await updateDb((db) => completeRetentionCleanup(db, cleanup.id));
      result.completed += 1;
    } catch (error) {
      result.failed.push({ cleanupId: cleanup.id, error: String(error?.message || error) });
    }
  }
  return result;
}
