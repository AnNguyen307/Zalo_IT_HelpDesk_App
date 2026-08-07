import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { config } from "./config.mjs";
import { analyzeTicket, formatAgentReply, getAgentStatus } from "./ai-agent.mjs";
import { loginAdmin, loginStaff, loginWithZalo, requireAuth, sessionUser } from "./auth.mjs";
import { canPreviewAttachment, publicAttachment, readAttachmentFile, removeAttachmentFile, saveAttachment } from "./attachments.mjs";
import { isMultipartRequest, readMultipartAttachments } from "./multipart.mjs";
import { corsHeaders, notFound, routeMatch, serveStatic } from "./http.mjs";
import { appError, publicHttpError } from "./errors.mjs";
import { analysisRequiresHumanHandoff, isHumanHandoffLocked, lockHumanHandoff, publicHumanHandoff, statusAfterHumanReply } from "./handoff.mjs";
import { KB_SEED } from "./kb.mjs";
import { buildOperationsReport, matchesSmartQueue, smartQueueCounts, ticketsCsv } from "./operations.mjs";
import { buildPlaybookIndex, getPlaybookStatus, loadPlaybook, queuePlaybookReindex, searchPlaybook } from "./playbook.mjs";
import { publicNotification, pushNotification } from "./notifications.mjs";
import {
  createPlaybookDraft,
  createPlaybookVersion,
  draftPayloadFromTicket,
  getPlaybookGovernanceStatus,
  getPlaybookProcedure,
  listPlaybookProcedures,
  publishPlaybookVersion,
  rejectPlaybookVersion,
  rollbackPlaybookVersion,
  seedManagedPlaybookFromFile,
  setProcedureLifecycle,
  submitPlaybookVersion,
  updatePlaybookDraft,
} from "./playbook-governance.mjs";
import { createSla, ensureSla, markFirstResponse, pauseSla, publicSla, recalculateSla, syncSlaForStatus } from "./sla.mjs";
import { createStaffAccountRecord, ensureUniqueStaffUsername, hashStaffPassword, normalizeStaffActive, normalizeUsername, publicStaffAccount, STAFF_ROLES, validateStaffAccountTransition } from "./staff-accounts.mjs";
import { audit, closeStore, getStoreStatus, initializeStore, pushHistory, readDb, seedKnowledgeBase, updateDb } from "./store.mjs";
import { plainSystemText } from "./system-text.mjs";
import { DEFAULT_TICKET_PRIORITY, priorityFromAgentAnalysis } from "./ticket-priority.mjs";
import { id, json, nowIso, readJson, slug, text as sendText } from "./utils.mjs";

await initializeStore();
await seedKnowledgeBase(KB_SEED);

const STATUSES = ["open", "waiting_user", "in_progress", "resolved", "closed"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const STAFF_WRITE_ROLES = ["admin", "technician"];

function securityHeaders(cors = {}) {
  return {
    ...cors,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}

function publicTicket(ticket, db = null) {
  return {
    id: ticket.id,
    code: ticket.code,
    userId: ticket.userId,
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    risk: ticket.risk,
    status: ticket.status,
    location: ticket.location,
    device: ticket.device,
    assignedTo: ticket.assignedTo,
    assignedToId: ticket.assignedToId || "",
    aiAnalysis: ticket.aiAnalysis,
    humanHandoff: publicHumanHandoff(ticket),
    resolution: ticket.resolution,
    satisfaction: ticket.satisfaction || null,
    reopenCount: ticket.reopenCount || 0,
    lastReopenedAt: ticket.lastReopenedAt || null,
    sla: publicSla(ticket),
    attachmentCount: db ? db.attachments.filter((item) => item.ticketId === ticket.id).length : undefined,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt,
  };
}

function ticketCode() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `HD-${date}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function canAccessTicket(session, ticket) {
  return ["admin", "technician", "viewer"].includes(session.role) || ticket.userId === session.sub;
}

function requireWritableStaffSession(session) {
  if (!STAFF_WRITE_ROLES.includes(session.role)) throw Object.assign(new Error("Vai trò Viewer chỉ được xem dữ liệu"), { status: 403 });
  return session;
}

function validateTicketInput(body) {
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  if (title.length < 4 || title.length > 160) throw Object.assign(new Error("Tiêu đề phải có 4–160 ký tự"), { status: 400 });
  if (description.length < 10 || description.length > 5000) throw Object.assign(new Error("Mô tả phải có 10–5000 ký tự"), { status: 400 });
  return {
    title,
    description,
    location: String(body.location || "").trim().slice(0, 160),
    device: String(body.device || "").trim().slice(0, 160),
  };
}

async function getTicketBundle(ticketId) {
  const db = await readDb();
  const ticket = db.tickets.find((item) => item.id === ticketId);
  if (!ticket) throw Object.assign(new Error("Không tìm thấy ticket"), { status: 404 });
  ensureSla(ticket);
  const user = db.users.find((item) => item.id === ticket.userId) || null;
  const messages = db.messages
    .filter((item) => item.ticketId === ticket.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((message) => message.role === "system" ? { ...message, body: plainSystemText(message.body, "Cập nhật từ hệ thống.") } : message);
  const attachments = db.attachments.filter((item) => item.ticketId === ticket.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(publicAttachment);
  const history = db.ticketHistory.filter((item) => item.ticketId === ticket.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { db, ticket, user, messages, attachments, history };
}

function addSystemMessage(db, ticketId, body, createdAt = nowIso()) {
  const message = {
    id: id("msg"),
    ticketId,
    authorId: "system",
    authorName: "Hệ thống HelpDesk",
    role: "system",
    body: plainSystemText(body, "Cập nhật từ hệ thống."),
    createdAt,
  };
  db.messages.push(message);
  return message;
}

function notifyRequester(db, ticket, type, title, body) {
  return pushNotification(db, { userId: ticket.userId, ticketId: ticket.id, type, title, body });
}

function recordStatusChange(db, ticket, from, to, actorId, actorName, note = "") {
  if (from === to) return null;
  return pushHistory(db, { ticketId: ticket.id, actorId, actorName, type: "status", from, to, note });
}

function agentDisplayName(analysis) {
  if (analysis?.source?.startsWith("ollama") && analysis?.canAutoHandle) return "AI HelpDesk Agent";
  if (analysis?.canAutoHandle) return "HelpDesk Playbook";
  return "HelpDesk Escalation";
}

async function createTicket(session, body) {
  const input = validateTicketInput(body);
  const db = await readDb();
  const createdAt = nowIso();
  const userMessage = {
    id: id("msg"), ticketId: "pending", authorId: session.sub,
    authorName: session.name || "Người dùng", role: "user",
    body: `${input.title}

${input.description}`, createdAt,
  };
  const analysis = await analyzeTicket(input, db.knowledgeBase, {
    latestUserMessage: input.description,
    messages: [userMessage],
    attachments: [],
  });
  const priority = priorityFromAgentAnalysis(analysis);
  const status = analysis.canAutoHandle ? "waiting_user" : "open";
  const ticket = {
    id: id("tkt"),
    code: ticketCode(),
    userId: session.sub,
    ...input,
    category: analysis.category,
    priority,
    risk: analysis.risk,
    status,
    assignedTo: "",
    assignedToId: "",
    aiAnalysis: analysis,
    aiHandoffLocked: false,
    aiHandoffAt: null,
    aiHandoffReason: "",
    aiHandoffBy: "",
    aiHandoffByName: "",
    resolution: "",
    satisfaction: null,
    reopenCount: 0,
    lastReopenedAt: null,
    sla: createSla(priority, createdAt),
    createdAt,
    updatedAt: createdAt,
    resolvedAt: null,
  };
  if (analysisRequiresHumanHandoff(analysis)) {
    lockHumanHandoff(ticket, {
      at: createdAt,
      reason: analysis.escalationCode || "ai_escalation",
      actorId: "ai-agent",
      actorName: agentDisplayName(analysis),
    });
  }
  if (ticket.status === "waiting_user") pauseSla(ticket, createdAt, "waiting_user", { id: "ai-agent", name: agentDisplayName(analysis) });
  userMessage.ticketId = ticket.id;
  const agentMessage = {
    id: id("msg"), ticketId: ticket.id, authorId: "ai-agent",
    authorName: agentDisplayName(analysis), role: "assistant",
    body: formatAgentReply(analysis), createdAt: nowIso(),
  };
  await updateDb((target) => {
    target.tickets.push(ticket);
    target.messages.push(userMessage, agentMessage);
    pushHistory(target, {
      ticketId: ticket.id, actorId: session.sub, actorName: session.name || "Người dùng",
      type: "created", from: null, to: status,
      note: analysis.priorityDetermined
        ? `Ticket mặc định ${DEFAULT_TICKET_PRIORITY}; AI Agent xác định ưu tiên ${ticket.priority}; agent=${analysis.source}`
        : `Ticket mặc định ${DEFAULT_TICKET_PRIORITY}; AI Agent chưa xác định chắc chắn nên giữ ${DEFAULT_TICKET_PRIORITY}; agent=${analysis.source}`,
    });
    if (ticket.aiHandoffLocked) {
      pushHistory(target, {
        ticketId: ticket.id,
        actorId: "ai-agent",
        actorName: agentDisplayName(analysis),
        type: "ai_handoff",
        from: "ai_active",
        to: "human_only",
        note: `AI đã bàn giao và rời hội thoại: ${ticket.aiHandoffReason}`,
      });
    }
  });
  await audit(session.sub, "create", "ticket", ticket.id, { code: ticket.code, source: analysis.source, model: analysis.model || null });
  return { ticket, messages: [userMessage, agentMessage] };
}

async function appendMessage(session, ticketId, body, options = {}) {
  if (session.role === "viewer") throw Object.assign(new Error("Vai trò Viewer không được gửi phản hồi"), { status: 403 });
  const attachments = Array.isArray(options.attachments) ? options.attachments : [];
  const text = String(body.message || "").trim();
  if ((!text && !attachments.length) || text.length > 5000) {
    throw Object.assign(new Error("Phản hồi phải có nội dung hoặc file đính kèm"), { status: 400 });
  }
  const bundle = await getTicketBundle(ticketId);
  if (!canAccessTicket(session, bundle.ticket)) throw Object.assign(new Error("Bạn không có quyền truy cập ticket này"), { status: 403 });
  if (["resolved", "closed"].includes(bundle.ticket.status)) {
    throw Object.assign(new Error("Ticket đã kết thúc; hãy mở lại ticket trước khi phản hồi"), { status: 409 });
  }

  const createdAt = nowIso();
  const attachmentNames = attachments.map((item) => item.fileName).join(", ");
  const message = {
    id: options.messageId || id("msg"), ticketId, authorId: session.sub,
    authorName: session.name || "Người dùng",
    role: ["admin", "technician"].includes(session.role) ? "technician" : "user",
    body: text || `Đã gửi ${attachments.length} file đính kèm.`, createdAt,
  };

  if (["admin", "technician"].includes(session.role)) {
    const result = await updateDb((db) => {
      db.messages.push(message);
      if (attachments.length) db.attachments.push(...attachments);
      const ticket = db.tickets.find((item) => item.id === ticketId);
      const oldStatus = ticket.status;
      const newlyLocked = lockHumanHandoff(ticket, {
        at: createdAt,
        reason: "staff_joined_conversation",
        actorId: session.sub,
        actorName: session.name,
      });
      if (["open", "waiting_user"].includes(ticket.status)) ticket.status = "in_progress";
      markFirstResponse(ticket, createdAt);
      syncSlaForStatus(ticket, oldStatus, createdAt, { id: session.sub, name: session.name });
      ticket.updatedAt = createdAt;
      recordStatusChange(db, ticket, oldStatus, ticket.status, session.sub, session.name, "Kỹ thuật viên đã phản hồi");
      if (newlyLocked) pushHistory(db, { ticketId, actorId: session.sub, actorName: session.name, type: "ai_handoff", from: "ai_active", to: "human_only", note: "Kỹ thuật viên đã tham gia; AI bị khóa vĩnh viễn khỏi hội thoại ticket này" });
      pushHistory(db, { ticketId, actorId: session.sub, actorName: session.name, type: "message", note: attachments.length ? `Kỹ thuật viên gửi phản hồi kèm ${attachments.length} file` : "Kỹ thuật viên gửi phản hồi mới" });
      if (attachments.length) pushHistory(db, { ticketId, actorId: session.sub, actorName: session.name, type: "attachment", note: attachmentNames });
      notifyRequester(db, ticket, "reply", `Có phản hồi mới cho ${ticket.code}`, (text || `Đã gửi ${attachments.length} file: ${attachmentNames}`).slice(0, 240));
      return ticket;
    });
    return { messages: [message], attachments: attachments.map(publicAttachment), humanHandoff: publicHumanHandoff(result) };
  }

  const persistHumanOnlyReply = async (reason = "existing_human_handoff") => {
    const updatedTicket = await updateDb((db) => {
      db.messages.push(message);
      if (attachments.length) db.attachments.push(...attachments);
      const ticket = db.tickets.find((item) => item.id === ticketId);
      const oldStatus = ticket.status;
      const newlyLocked = lockHumanHandoff(ticket, {
        at: ticket.aiHandoffAt || createdAt,
        reason: ticket.aiHandoffReason || reason,
        actorId: ticket.aiHandoffBy || "system",
        actorName: ticket.aiHandoffByName || "Hệ thống HelpDesk",
      });
      ticket.status = statusAfterHumanReply(ticket.status);
      syncSlaForStatus(ticket, oldStatus, createdAt, { id: session.sub, name: session.name });
      ticket.updatedAt = createdAt;
      recordStatusChange(db, ticket, oldStatus, ticket.status, session.sub, session.name, "Người dùng đã phản hồi cho kỹ thuật viên; AI không tham gia");
      if (newlyLocked) pushHistory(db, { ticketId, actorId: "system", actorName: "Hệ thống HelpDesk", type: "ai_handoff", from: "ai_active", to: "human_only", note: "Khóa AI được khôi phục từ trạng thái bàn giao hiện có" });
      pushHistory(db, { ticketId, actorId: session.sub, actorName: session.name, type: "message", note: attachments.length ? `Người dùng gửi phản hồi kèm ${attachments.length} file; chỉ chuyển cho kỹ thuật viên` : "Người dùng gửi phản hồi; chỉ chuyển cho kỹ thuật viên" });
      if (attachments.length) pushHistory(db, { ticketId, actorId: session.sub, actorName: session.name, type: "attachment", note: attachmentNames });
      return ticket;
    });
    return { messages: [message], attachments: attachments.map(publicAttachment), analysis: null, humanHandoff: publicHumanHandoff(updatedTicket) };
  };

  // First guard: once the AI has handed off, user replies go directly to staff.
  if (isHumanHandoffLocked(bundle.ticket, bundle.messages)) {
    return persistHumanOnlyReply();
  }

  const latestUserMessage = text || `[Người dùng gửi ${attachments.length} file đính kèm: ${attachmentNames}]`;
  const combined = {
    title: bundle.ticket.title,
    description: `${bundle.ticket.description}\n\nPhản hồi mới của người dùng: ${latestUserMessage}`,
    location: bundle.ticket.location,
  };
  const analysis = await analyzeTicket(combined, bundle.db.knowledgeBase, {
    latestUserMessage,
    messages: [...bundle.messages, message],
    attachments: [...bundle.attachments, ...attachments.map(publicAttachment)],
  });
  const agentMessage = {
    id: id("msg"), ticketId, authorId: "ai-agent",
    authorName: agentDisplayName(analysis), role: "assistant",
    body: formatAgentReply(analysis), createdAt: nowIso(),
  };

  // Second guard is evaluated inside the serialized write. It prevents a race where
  // staff joins while Ollama is still analyzing the user's reply.
  const persisted = await updateDb((db) => {
    const ticket = db.tickets.find((item) => item.id === ticketId);
    const currentMessages = db.messages.filter((item) => item.ticketId === ticketId);
    const handoffAlreadyLocked = isHumanHandoffLocked(ticket, currentMessages);

    db.messages.push(message);
    if (attachments.length) db.attachments.push(...attachments);

    if (handoffAlreadyLocked) {
      const oldStatus = ticket.status;
      lockHumanHandoff(ticket, {
        at: ticket.aiHandoffAt || createdAt,
        reason: ticket.aiHandoffReason || "staff_joined_during_analysis",
        actorId: ticket.aiHandoffBy || "system",
        actorName: ticket.aiHandoffByName || "Hệ thống HelpDesk",
      });
      ticket.status = statusAfterHumanReply(ticket.status);
      syncSlaForStatus(ticket, oldStatus, createdAt, { id: session.sub, name: session.name });
      ticket.updatedAt = createdAt;
      recordStatusChange(db, ticket, oldStatus, ticket.status, session.sub, session.name, "Người dùng đã phản hồi cho kỹ thuật viên; kết quả AI bị hủy");
      pushHistory(db, { ticketId, actorId: session.sub, actorName: session.name, type: "message", note: "Người dùng gửi phản hồi; kết quả AI bị hủy vì ticket đã bàn giao" });
      if (attachments.length) pushHistory(db, { ticketId, actorId: session.sub, actorName: session.name, type: "attachment", note: attachmentNames });
      return { ticket, agentAccepted: false };
    }

    db.messages.push(agentMessage);
    const oldStatus = ticket.status;
    const oldPriority = ticket.priority;
    const nextPriority = priorityFromAgentAnalysis(analysis);
    ticket.aiAnalysis = analysis;
    ticket.category = analysis.category;
    ticket.priority = nextPriority;
    ticket.risk = analysis.risk;
    ticket.status = analysis.canAutoHandle ? "waiting_user" : "open";
    if (analysisRequiresHumanHandoff(analysis)) {
      const newlyLocked = lockHumanHandoff(ticket, {
        at: agentMessage.createdAt,
        reason: analysis.escalationCode || "ai_escalation",
        actorId: "ai-agent",
        actorName: agentDisplayName(analysis),
      });
      if (newlyLocked) pushHistory(db, { ticketId, actorId: "ai-agent", actorName: agentDisplayName(analysis), type: "ai_handoff", from: "ai_active", to: "human_only", note: `AI đã bàn giao và rời hội thoại: ${ticket.aiHandoffReason}` });
    }
    recalculateSla(ticket, nextPriority);
    syncSlaForStatus(ticket, oldStatus, nowIso(), { id: "ai-agent", name: agentDisplayName(analysis) });
    ticket.updatedAt = nowIso();
    recordStatusChange(db, ticket, oldStatus, ticket.status, session.sub, session.name, "Phân loại lại sau phản hồi người dùng");
    if (oldPriority !== nextPriority) {
      pushHistory(db, {
        ticketId,
        actorId: "ai-agent",
        actorName: agentDisplayName(analysis),
        type: "priority",
        from: oldPriority,
        to: nextPriority,
        note: analysis.priorityDetermined
          ? "AI Agent đã xác định lại mức ưu tiên"
          : "AI Agent chưa xác định chắc chắn; trả về mức Bình thường",
      });
    }
    pushHistory(db, { ticketId, actorId: session.sub, actorName: session.name, type: "message", note: attachments.length ? `Người dùng gửi phản hồi kèm ${attachments.length} file` : "Người dùng gửi phản hồi mới" });
    if (attachments.length) pushHistory(db, { ticketId, actorId: session.sub, actorName: session.name, type: "attachment", note: attachmentNames });
    return { ticket, agentAccepted: true };
  });

  if (!persisted.agentAccepted) {
    return { messages: [message], attachments: attachments.map(publicAttachment), analysis: null, humanHandoff: publicHumanHandoff(persisted.ticket) };
  }
  return { messages: [message, agentMessage], attachments: attachments.map(publicAttachment), analysis, humanHandoff: publicHumanHandoff(persisted.ticket) };
}

async function processOverdueTickets() {
  const now = Date.now();
  await updateDb((db) => {
    for (const ticket of db.tickets) {
      if (["resolved", "closed"].includes(ticket.status)) continue;
      const sla = ensureSla(ticket);
      if (sla.pausedAt) continue;
      const markWarning = (phase, ratio) => {
        const prefix = phase === "firstResponse" ? "firstResponse" : "resolution";
        const threshold = new Date(sla[`${prefix}Warn${ratio}At`]).getTime();
        const flag = `${prefix}Warned${ratio}At`;
        if ((phase !== "firstResponse" || !sla.firstRespondedAt) && !sla[flag] && now >= threshold) {
          const at = nowIso();
          sla[flag] = at;
          pushHistory(db, { ticketId: ticket.id, actorId: "system", actorName: "SLA Monitor", type: "sla_warning", note: `${phase === "firstResponse" ? "Phản hồi đầu tiên" : "Xử lý"} đã dùng ${ratio}% SLA` });
          ticket.updatedAt = at;
        }
      };
      markWarning("firstResponse", 70);
      markWarning("firstResponse", 90);
      markWarning("resolution", 70);
      markWarning("resolution", 90);
      const firstDue = new Date(sla.firstResponseDueAt).getTime();
      const resolutionDue = new Date(sla.resolutionDueAt).getTime();
      if (!sla.firstRespondedAt && !sla.firstResponseBreachedAt && now > firstDue) {
        const at = nowIso();
        sla.firstResponseBreachedAt = at;
        sla.lastReminderAt = at;
        addSystemMessage(db, ticket.id, "Ticket đã quá thời hạn phản hồi đầu tiên theo SLA. HelpDesk đã được nhắc tự động.", at);
        pushHistory(db, { ticketId: ticket.id, actorId: "system", actorName: "SLA Monitor", type: "sla_overdue", note: "Quá hạn phản hồi đầu tiên" });
        notifyRequester(db, ticket, "sla_overdue", `${ticket.code} đã quá hạn phản hồi`, "Hệ thống đã tự động nhắc HelpDesk phản hồi ticket của bạn.");
        ticket.updatedAt = at;
      }
      if (!sla.resolutionBreachedAt && now > resolutionDue) {
        const at = nowIso();
        sla.resolutionBreachedAt = at;
        sla.escalatedAt = at;
        sla.lastReminderAt = at;
        addSystemMessage(db, ticket.id, "Ticket đã quá thời hạn xử lý theo SLA. HelpDesk đã được nhắc tự động.", at);
        pushHistory(db, { ticketId: ticket.id, actorId: "system", actorName: "SLA Monitor", type: "sla_overdue", note: "Quá hạn xử lý" });
        notifyRequester(db, ticket, "sla_overdue", `${ticket.code} đã quá hạn xử lý`, "Hệ thống đã ghi nhận quá hạn và nhắc HelpDesk tiếp tục xử lý.");
        ticket.updatedAt = at;
      }
    }
  });
}

async function handleApi(req, res, url, headers) {
  const { pathname, searchParams } = url;

  if (req.method === "GET" && pathname === "/health") {
    const [agent, playbook, database, playbookGovernance] = await Promise.all([getAgentStatus(), getPlaybookStatus(), getStoreStatus(), getPlaybookGovernanceStatus()]);
    return json(res, 200, {
      ok: true,
      service: "zalo-helpdesk-zero-cost",
      version: "5.7.3",
      time: nowIso(),
      features: ["staff-accounts", "role-based-access", "business-hours-sla", "sla-pause-resume", "smart-queues", "operations-reporting", "csv-export", "playbook-lifecycle", "draft-review-publish", "automatic-reindex", "technician-proposals", "sql-server", "database-migration", "ai-agent", "strict-escalation", "enterprise-playbook-rag", "semantic-search", "conversation-memory", "knowledge-guardrails", "responsive-typography", "secure-attachment-preview", "reply-attachments", "streaming-multipart-upload", "30mb-attachment-limit", "human-handoff-conversation-lock", "ai-race-condition-guard", "ui-refresh", "attachments", "sla", "overdue-reminders", "notifications", "history", "reopen", "satisfaction"],
      agent: { ...agent, paidApiRequired: false },
      playbook,
      playbookGovernance,
      database,
    }, headers);
  }

  if (req.method === "POST" && pathname === "/api/auth/zalo") {
    return json(res, 200, await loginWithZalo(await readJson(req)), headers);
  }

  if (req.method === "POST" && pathname === "/api/auth/admin") {
    const body = await readJson(req);
    return json(res, 200, await loginAdmin(body.password), headers);
  }

  if (req.method === "POST" && pathname === "/api/auth/staff") {
    const body = await readJson(req);
    return json(res, 200, await loginStaff(body), headers);
  }

  if (req.method === "GET" && pathname === "/api/me") {
    const session = await requireAuth(req);
    const user = await sessionUser(session);
    if (!user) throw Object.assign(new Error("User session is no longer valid"), { status: 401 });
    return json(res, 200, { user, settings: { notificationPollSeconds: config.notificationPollSeconds } }, headers);
  }

  if (req.method === "GET" && pathname === "/api/notifications") {
    const session = await requireAuth(req);
    const db = await readDb();
    const notifications = db.notifications
      .filter((item) => item.userId === session.sub)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100)
      .map(publicNotification);
    return json(res, 200, { notifications, unreadCount: notifications.filter((item) => !item.readAt).length }, headers);
  }

  let params = routeMatch(pathname, "/api/notifications/:notificationId/read");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req);
    const notification = await updateDb((db) => {
      const item = db.notifications.find((candidate) => candidate.id === params.notificationId && candidate.userId === session.sub);
      if (!item) throw Object.assign(new Error("Không tìm thấy thông báo"), { status: 404 });
      item.readAt = item.readAt || nowIso();
      return item;
    });
    return json(res, 200, { notification: publicNotification(notification) }, headers);
  }

  if (req.method === "POST" && pathname === "/api/notifications/read-all") {
    const session = await requireAuth(req);
    await updateDb((db) => {
      const at = nowIso();
      for (const item of db.notifications) if (item.userId === session.sub && !item.readAt) item.readAt = at;
    });
    return json(res, 200, { ok: true }, headers);
  }

  if (req.method === "GET" && pathname === "/api/tickets") {
    const session = await requireAuth(req);
    const db = await readDb();
    const staffSession = ["admin", "technician", "viewer"].includes(session.role);
    const available = staffSession ? db.tickets : db.tickets.filter((item) => item.userId === session.sub);
    const queueCounts = staffSession ? smartQueueCounts(available, session, db.messages) : undefined;
    let tickets = available;
    const queue = searchParams.get("queue") || "all";
    if (staffSession) tickets = tickets.filter((ticket) => matchesSmartQueue(ticket, queue, session, db.messages));
    const status = searchParams.get("status");
    if (status) tickets = tickets.filter((item) => item.status === status);
    tickets = tickets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return json(res, 200, { tickets: tickets.map((ticket) => publicTicket(ticket, db)), queue, queueCounts }, headers);
  }

  if (req.method === "POST" && pathname === "/api/tickets") {
    const session = await requireAuth(req);
    if (session.role === "viewer") requireWritableStaffSession(session);
    const result = await createTicket(session, await readJson(req));
    return json(res, 201, { ticket: publicTicket(result.ticket), messages: result.messages }, headers);
  }

  params = routeMatch(pathname, "/api/tickets/:ticketId");
  if (req.method === "GET" && params) {
    const session = await requireAuth(req);
    const bundle = await getTicketBundle(params.ticketId);
    if (!canAccessTicket(session, bundle.ticket)) throw Object.assign(new Error("Bạn không có quyền truy cập ticket này"), { status: 403 });
    return json(res, 200, {
      ticket: publicTicket(bundle.ticket, bundle.db), messages: bundle.messages,
      attachments: bundle.attachments, history: bundle.history, requester: bundle.user,
    }, headers);
  }

  params = routeMatch(pathname, "/api/tickets/:ticketId/replies");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req);
    if (session.role === "viewer") requireWritableStaffSession(session);
    const bundle = await getTicketBundle(params.ticketId);
    if (!canAccessTicket(session, bundle.ticket)) throw Object.assign(new Error("Bạn không có quyền truy cập ticket này"), { status: 403 });
    const messageId = id("msg");
    const remainingTicketFiles = Math.max(0, config.maxAttachmentsPerTicket - bundle.attachments.length);
    const maxFiles = Math.min(config.maxAttachmentsPerReply, remainingTicketFiles);
    let body;
    let saved = [];

    try {
      if (isMultipartRequest(req)) {
        const parsed = await readMultipartAttachments(req, {
          ticketId: params.ticketId,
          messageId,
          uploaderId: session.sub,
          uploaderName: session.name,
          maxFiles,
          maxFileBytes: config.maxAttachmentBytes,
          maxTotalBytes: config.maxReplyUploadBytes,
        });
        body = { message: parsed.fields.message || "" };
        saved = parsed.attachments;
      } else {
        // Compatibility for the previous v5.5 client. Large uploads must use multipart.
        body = await readJson(req, config.maxLegacyJsonUploadBytes);
        const files = Array.isArray(body.attachments) ? body.attachments : [];
        if (files.length > maxFiles) {
          throw Object.assign(new Error(`Mỗi phản hồi chỉ được tối đa ${maxFiles} file`), { status: 409 });
        }
        for (const file of files) {
          saved.push(await saveAttachment({
            ticketId: params.ticketId,
            messageId,
            uploaderId: session.sub,
            uploaderName: session.name,
            fileName: file.fileName,
            mimeType: file.mimeType,
            dataBase64: file.dataBase64,
          }));
        }
      }

      const result = await appendMessage(session, params.ticketId, body, { messageId, attachments: saved });
      for (const attachment of saved) {
        await audit(session.sub, "upload", "attachment", attachment.id, { ticketId: params.ticketId, messageId, fileName: attachment.fileName, size: attachment.size });
      }
      return json(res, 201, result, headers);
    } catch (error) {
      await Promise.all(saved.map((item) => removeAttachmentFile(item)));
      throw error;
    }
  }

  params = routeMatch(pathname, "/api/tickets/:ticketId/messages");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req);
    if (session.role === "viewer") requireWritableStaffSession(session);
    return json(res, 201, await appendMessage(session, params.ticketId, await readJson(req)), headers);
  }

  params = routeMatch(pathname, "/api/tickets/:ticketId/attachments");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req);
    if (session.role === "viewer") requireWritableStaffSession(session);
    const bundle = await getTicketBundle(params.ticketId);
    if (!canAccessTicket(session, bundle.ticket)) throw Object.assign(new Error("Bạn không có quyền truy cập ticket này"), { status: 403 });
    if (bundle.attachments.length >= config.maxAttachmentsPerTicket) {
      throw Object.assign(new Error(`Mỗi ticket chỉ được tối đa ${config.maxAttachmentsPerTicket} file`), { status: 409 });
    }
    let attachment;
    if (isMultipartRequest(req)) {
      const parsed = await readMultipartAttachments(req, {
        ticketId: params.ticketId,
        messageId: null,
        uploaderId: session.sub,
        uploaderName: session.name,
        maxFiles: 1,
        maxFileBytes: config.maxAttachmentBytes,
        maxTotalBytes: config.maxAttachmentBytes,
        acceptedFields: [],
        acceptedFileFields: ["file", "attachments"],
      });
      attachment = parsed.attachments[0];
      if (!attachment) throw Object.assign(new Error("Chưa chọn file để tải lên"), { status: 400 });
    } else {
      const body = await readJson(req, config.maxLegacyJsonUploadBytes);
      attachment = await saveAttachment({
        ticketId: params.ticketId,
        messageId: null,
        uploaderId: session.sub,
        uploaderName: session.name,
        fileName: body.fileName,
        mimeType: body.mimeType,
        dataBase64: body.dataBase64,
      });
    }
    await updateDb((db) => {
      db.attachments.push(attachment);
      const ticket = db.tickets.find((item) => item.id === params.ticketId);
      ticket.updatedAt = nowIso();
      addSystemMessage(db, ticket.id, `${session.name || "Người dùng"} đã đính kèm file: ${attachment.fileName}`);
      pushHistory(db, { ticketId: ticket.id, actorId: session.sub, actorName: session.name, type: "attachment", note: attachment.fileName });
      if (["admin", "technician"].includes(session.role)) notifyRequester(db, ticket, "attachment", `Có file mới trong ${ticket.code}`, attachment.fileName);
    });
    await audit(session.sub, "upload", "attachment", attachment.id, { ticketId: params.ticketId, fileName: attachment.fileName, size: attachment.size });
    return json(res, 201, { attachment: publicAttachment(attachment) }, headers);
  }

  params = routeMatch(pathname, "/api/attachments/:attachmentId");
  if (req.method === "GET" && params) {
    const session = await requireAuth(req);
    const db = await readDb();
    const attachment = db.attachments.find((item) => item.id === params.attachmentId);
    if (!attachment) throw Object.assign(new Error("Không tìm thấy file"), { status: 404 });
    const ticket = db.tickets.find((item) => item.id === attachment.ticketId);
    if (!ticket || !canAccessTicket(session, ticket)) throw Object.assign(new Error("Bạn không có quyền tải file này"), { status: 403 });
    const preview = searchParams.get("preview") === "1";
    if (preview && !canPreviewAttachment(attachment)) {
      throw Object.assign(new Error("Định dạng này không hỗ trợ xem trước an toàn"), { status: 415 });
    }
    const data = await readAttachmentFile(attachment);
    const fallback = path.basename(attachment.fileName || "attachment").replace(/[\r\n"]/g, "_");
    res.writeHead(200, {
      ...headers,
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Length": data.length,
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(attachment.fileName || fallback)}`,
      "Cache-Control": preview ? "private, no-store" : "private, max-age=60",
      ...(preview ? { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'" } : {}),
    });
    return res.end(data);
  }

  params = routeMatch(pathname, "/api/tickets/:ticketId/read-notifications");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req);
    if (session.role === "viewer") requireWritableStaffSession(session);
    const bundle = await getTicketBundle(params.ticketId);
    if (!canAccessTicket(session, bundle.ticket)) throw Object.assign(new Error("Bạn không có quyền truy cập ticket này"), { status: 403 });
    await updateDb((db) => {
      const at = nowIso();
      for (const item of db.notifications) if (item.userId === session.sub && item.ticketId === params.ticketId && !item.readAt) item.readAt = at;
    });
    return json(res, 200, { ok: true }, headers);
  }

  params = routeMatch(pathname, "/api/tickets/:ticketId/confirm-resolved");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req);
    if (session.role === "viewer") requireWritableStaffSession(session);
    const bundle = await getTicketBundle(params.ticketId);
    if (!canAccessTicket(session, bundle.ticket)) throw Object.assign(new Error("Bạn không có quyền truy cập ticket này"), { status: 403 });
    const body = await readJson(req);
    const resolution = String(body.resolution || "Người dùng xác nhận sự cố đã được xử lý").trim().slice(0, 1000);
    const updated = await updateDb((db) => {
      const ticket = db.tickets.find((item) => item.id === params.ticketId);
      const oldStatus = ticket.status;
      ticket.status = "resolved";
      ticket.resolution = resolution;
      ticket.resolvedAt = nowIso();
      ticket.updatedAt = ticket.resolvedAt;
      addSystemMessage(db, ticket.id, `Ticket đã được xác nhận xử lý: ${resolution}`);
      recordStatusChange(db, ticket, oldStatus, "resolved", session.sub, session.name, resolution);
      return ticket;
    });
    await audit(session.sub, "resolve", "ticket", params.ticketId, { resolution });
    return json(res, 200, { ticket: publicTicket(updated) }, headers);
  }

  params = routeMatch(pathname, "/api/tickets/:ticketId/reopen");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req);
    if (session.role === "viewer") requireWritableStaffSession(session);
    const bundle = await getTicketBundle(params.ticketId);
    if (!canAccessTicket(session, bundle.ticket)) throw Object.assign(new Error("Bạn không có quyền truy cập ticket này"), { status: 403 });
    if (!["resolved", "closed"].includes(bundle.ticket.status)) throw Object.assign(new Error("Chỉ ticket đã xử lý hoặc đã đóng mới có thể mở lại"), { status: 409 });
    const resolvedTime = bundle.ticket.resolvedAt ? new Date(bundle.ticket.resolvedAt).getTime() : Date.now();
    if (Date.now() - resolvedTime > config.reopenWindowDays * 86_400_000 && !["admin", "technician"].includes(session.role)) {
      throw Object.assign(new Error(`Ticket chỉ được mở lại trong ${config.reopenWindowDays} ngày`), { status: 409 });
    }
    const body = await readJson(req);
    const reason = String(body.reason || "Sự cố tái diễn").trim().slice(0, 1000);
    const updated = await updateDb((db) => {
      const ticket = db.tickets.find((item) => item.id === params.ticketId);
      const oldStatus = ticket.status;
      const at = nowIso();
      ticket.status = "open";
      ticket.resolvedAt = null;
      ticket.reopenCount = (ticket.reopenCount || 0) + 1;
      ticket.lastReopenedAt = at;
      ticket.sla = createSla(ticket.priority, at);
      ticket.updatedAt = at;
      addSystemMessage(db, ticket.id, `Ticket đã được mở lại: ${reason}`, at);
      recordStatusChange(db, ticket, oldStatus, "open", session.sub, session.name, reason);
      pushHistory(db, { ticketId: ticket.id, actorId: session.sub, actorName: session.name, type: "reopen", note: reason });
      if (!["admin", "technician"].includes(session.role)) pushNotification(db, { userId: "admin", ticketId: ticket.id, type: "reopen", title: `${ticket.code} được mở lại`, body: reason });
      return ticket;
    });
    await audit(session.sub, "reopen", "ticket", params.ticketId, { reason });
    return json(res, 200, { ticket: publicTicket(updated) }, headers);
  }

  params = routeMatch(pathname, "/api/tickets/:ticketId/rating");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req);
    const bundle = await getTicketBundle(params.ticketId);
    if (["admin", "technician"].includes(session.role) || bundle.ticket.userId !== session.sub) throw Object.assign(new Error("Chỉ người tạo ticket được đánh giá"), { status: 403 });
    if (!["resolved", "closed"].includes(bundle.ticket.status)) throw Object.assign(new Error("Chỉ đánh giá sau khi ticket đã xử lý"), { status: 409 });
    const body = await readJson(req);
    const score = Number(body.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) throw Object.assign(new Error("Điểm đánh giá phải từ 1 đến 5"), { status: 400 });
    const satisfaction = await updateDb((db) => {
      const ticket = db.tickets.find((item) => item.id === params.ticketId);
      ticket.satisfaction = { score, comment: String(body.comment || "").trim().slice(0, 1000), ratedAt: nowIso(), ratedBy: session.sub };
      ticket.updatedAt = nowIso();
      pushHistory(db, { ticketId: ticket.id, actorId: session.sub, actorName: session.name, type: "rating", note: `${score}/5 - ${ticket.satisfaction.comment}` });
      return ticket.satisfaction;
    });
    await audit(session.sub, "rate", "ticket", params.ticketId, satisfaction);
    return json(res, 200, { satisfaction }, headers);
  }

  if (req.method === "GET" && pathname === "/api/admin/agent/status") {
    await requireAuth(req, { staff: true });
    return json(res, 200, { agent: await getAgentStatus({ force: searchParams.get("force") === "1" }) }, headers);
  }

  if (req.method === "GET" && pathname === "/api/admin/playbook/status") {
    await requireAuth(req, { staff: true });
    return json(res, 200, { playbook: await getPlaybookStatus({ force: searchParams.get("force") === "1" }) }, headers);
  }

  if (req.method === "GET" && pathname === "/api/admin/playbook/entries") {
    await requireAuth(req, { staff: true });
    const audience = searchParams.get("audience") || "all";
    const category = searchParams.get("category") || "";
    const playbook = await loadPlaybook();
    const entries = playbook.entries
      .filter((entry) => audience === "all" || entry.audience === audience || entry.audience === "both")
      .filter((entry) => !category || entry.category === category)
      .map((entry) => ({
        id: entry.id, title: entry.title, category: entry.category, audience: entry.audience,
        risk: entry.risk, priority: entry.priority, autoEligible: entry.autoEligible,
        version: entry.version, sourceType: entry.sourceType, summary: entry.summary,
        steps: entry.steps, requiredQuestions: entry.requiredQuestions, forbiddenSteps: entry.forbiddenSteps,
        sourceRefs: entry.sourceRefs,
      }));
    return json(res, 200, { entries, metadata: playbook.metadata }, headers);
  }

  if (req.method === "GET" && pathname === "/api/admin/playbook/search") {
    await requireAuth(req, { staff: true });
    const query = String(searchParams.get("q") || "").trim().slice(0, 3000);
    if (query.length < 2) throw Object.assign(new Error("Nhập nội dung cần tra Playbook"), { status: 400 });
    const audience = searchParams.get("audience") || "technician";
    const entries = await searchPlaybook(query, { audience, limit: 10, minScore: 0.05 });
    return json(res, 200, {
      entries: entries.map((entry) => ({
        id: entry.id, title: entry.title, category: entry.category, audience: entry.audience,
        risk: entry.risk, version: entry.version, sourceType: entry.sourceType, summary: entry.summary,
        steps: entry.steps, forbiddenSteps: entry.forbiddenSteps, score: entry.score,
        lexicalScore: entry.lexicalScore, semanticScore: entry.semanticScore, semanticUsed: entry.semanticUsed,
        sourceRefs: entry.sourceRefs,
      })),
    }, headers);
  }

  if (req.method === "POST" && pathname === "/api/admin/playbook/reindex") {
    const session = await requireAuth(req, { roles: STAFF_WRITE_ROLES });
    const index = await buildPlaybookIndex({ force: true });
    const playbook = await getPlaybookStatus({ force: true });
    await audit(session.sub, "reindex", "playbook", config.playbookEmbedModel, { entries: index.records.length });
    return json(res, 200, { ok: true, index: { model: index.model, entries: index.records.length, generatedAt: index.generatedAt }, playbook }, headers);
  }

  if (req.method === "POST" && pathname === "/api/admin/agent/test") {
    const session = await requireAuth(req, { roles: STAFF_WRITE_ROLES });
    const body = await readJson(req);
    const prompt = String(body.prompt || "").trim().slice(0, 3000);
    if (prompt.length < 4) throw Object.assign(new Error("Nhập tình huống kiểm thử AI Agent"), { status: 400 });
    const db = await readDb();
    const synthetic = {
      title: "Kiểm thử AI Agent",
      description: prompt,
      location: "Admin Console",
      device: "Test",
      status: "open",
    };
    const analysis = await analyzeTicket(synthetic, db.knowledgeBase, {
      latestUserMessage: prompt,
      messages: [{ role: "user", authorName: session.name, body: prompt }],
      attachments: [],
    });
    await audit(session.sub, "test", "aiAgent", config.ollamaModel, { source: analysis.source, latencyMs: analysis.latencyMs });
    return json(res, 200, { analysis, reply: formatAgentReply(analysis) }, headers);
  }

  if (req.method === "GET" && pathname === "/api/admin/staff") {
    await requireAuth(req, { admin: true });
    const db = await readDb();
    const accounts = db.staffAccounts.map(publicStaffAccount).sort((a, b) => a.displayName.localeCompare(b.displayName, "vi"));
    return json(res, 200, { accounts, legacyLoginEnabled: config.legacyStaffLoginEnabled }, headers);
  }

  if (req.method === "GET" && pathname === "/api/staff/directory") {
    const session = await requireAuth(req, { staff: true });
    const db = await readDb();
    const accounts = db.staffAccounts
      .filter((item) => item.active !== false && ["admin", "technician"].includes(item.role))
      .map(publicStaffAccount)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "vi"));
    if (STAFF_WRITE_ROLES.includes(session.role) && !accounts.some((item) => item.id === session.sub)) {
      accounts.unshift({ id: session.sub, username: "legacy", displayName: session.name, role: session.role, active: true, legacy: true });
    }
    return json(res, 200, { accounts }, headers);
  }

  if (req.method === "POST" && pathname === "/api/admin/staff") {
    const session = await requireAuth(req, { admin: true });
    const body = await readJson(req);
    const account = await createStaffAccountRecord(body, session.sub);
    await updateDb((db) => {
      ensureUniqueStaffUsername(db.staffAccounts, account.username);
      db.staffAccounts.push(account);
    });
    await audit(session.sub, "create", "staffAccount", account.id, { username: account.username, role: account.role });
    return json(res, 201, { account: publicStaffAccount(account) }, headers);
  }

  params = routeMatch(pathname, "/api/admin/staff/:staffId");
  if (req.method === "PATCH" && params) {
    const session = await requireAuth(req, { admin: true });
    const body = await readJson(req);
    const passwordHash = body.password ? await hashStaffPassword(body.password) : null;
    const updated = await updateDb((db) => {
      const account = db.staffAccounts.find((item) => item.id === params.staffId);
      if (!account) throw appError("Không tìm thấy tài khoản nhân sự", { status: 404, code: "STAFF_ACCOUNT_NOT_FOUND" });
      const nextRole = body.role === undefined ? account.role : body.role;
      const nextActive = normalizeStaffActive(body.active, account.active !== false);
      if (!STAFF_ROLES.includes(nextRole)) throw appError("Vai trò nhân sự không hợp lệ", { code: "STAFF_ROLE_INVALID", field: "role" });
      validateStaffAccountTransition(db.staffAccounts, account, { actorId: session.sub, nextRole, nextActive });
      if (body.username !== undefined) {
        const username = normalizeUsername(body.username);
        if (username.length < 3) throw appError("Tên đăng nhập phải có ít nhất 3 ký tự", { code: "STAFF_USERNAME_LENGTH", field: "username" });
        ensureUniqueStaffUsername(db.staffAccounts, username, account.id);
        account.username = username;
      }
      if (body.displayName !== undefined) {
        const displayName = String(body.displayName || "").trim().slice(0, 120);
        if (displayName.length < 2) throw appError("Tên hiển thị phải có ít nhất 2 ký tự", { code: "STAFF_DISPLAY_NAME_LENGTH", field: "displayName" });
        account.displayName = displayName;
      }
      const sessionChanged = account.role !== nextRole || (account.active !== false) !== nextActive || Boolean(passwordHash);
      account.role = nextRole;
      account.active = nextActive;
      if (passwordHash) account.passwordHash = passwordHash;
      if (sessionChanged) account.sessionVersion = Number(account.sessionVersion || 1) + 1;
      account.updatedAt = nowIso();
      return account;
    });
    await audit(session.sub, "update", "staffAccount", updated.id, { username: updated.username, role: updated.role, active: updated.active, passwordReset: Boolean(passwordHash) });
    return json(res, 200, { account: publicStaffAccount(updated) }, headers);
  }

  if (req.method === "GET" && pathname === "/api/admin/operations") {
    await requireAuth(req, { staff: true });
    const db = await readDb();
    const days = Math.min(365, Math.max(7, Number(searchParams.get("days") || 30)));
    return json(res, 200, { report: buildOperationsReport(db, { days }) }, headers);
  }

  if (req.method === "GET" && pathname === "/api/admin/reports/tickets.csv") {
    await requireAuth(req, { staff: true });
    const db = await readDb();
    const days = Math.min(3650, Math.max(1, Number(searchParams.get("days") || 30)));
    const from = Date.now() - days * 86_400_000;
    const tickets = db.tickets.filter((ticket) => new Date(ticket.createdAt).getTime() >= from);
    return sendText(res, 200, ticketsCsv(db, tickets), "text/csv; charset=utf-8", { ...headers, "Content-Disposition": `attachment; filename="helpdesk-report-${new Date().toISOString().slice(0, 10)}.csv"` });
  }

  if (req.method === "GET" && pathname === "/api/admin/stats") {
    const session = await requireAuth(req, { staff: true });
    const db = await readDb();
    const byStatus = Object.fromEntries(STATUSES.map((status) => [status, db.tickets.filter((ticket) => ticket.status === status).length]));
    const byCategory = {};
    for (const ticket of db.tickets) byCategory[ticket.category] = (byCategory[ticket.category] || 0) + 1;
    const autoHandled = db.tickets.filter((ticket) => ticket.aiAnalysis?.canAutoHandle).length;
    const overdue = db.tickets.filter((ticket) => publicSla(ticket).overdue).length;
    const scores = db.tickets.map((ticket) => ticket.satisfaction?.score).filter(Number.isFinite);
    const averageSatisfaction = scores.length ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2)) : null;
    return json(res, 200, { total: db.tickets.length, byStatus, byCategory, autoHandled, overdue, averageSatisfaction, ratedTickets: scores.length, users: db.users.length, queueCounts: smartQueueCounts(db.tickets, session, db.messages), operations: buildOperationsReport(db, { days: 30 }).summary }, headers);
  }

  params = routeMatch(pathname, "/api/admin/tickets/:ticketId");
  if (req.method === "PATCH" && params) {
    const session = await requireAuth(req, { roles: STAFF_WRITE_ROLES });
    const body = await readJson(req);
    const updated = await updateDb((db) => {
      const ticket = db.tickets.find((item) => item.id === params.ticketId);
      if (!ticket) throw Object.assign(new Error("Không tìm thấy ticket"), { status: 404 });
      ensureSla(ticket);
      const at = nowIso();
      const oldStatus = ticket.status;
      const oldPriority = ticket.priority;
      const oldAssignee = ticket.assignedTo || "";
      const oldAssigneeId = ticket.assignedToId || "";
      if (body.status && STATUSES.includes(body.status)) ticket.status = body.status;
      if (body.priority && PRIORITIES.includes(body.priority)) ticket.priority = body.priority;
      if (body.assignedToId !== undefined) {
        const assignedToId = String(body.assignedToId || "").trim();
        if (!assignedToId) {
          ticket.assignedToId = "";
          ticket.assignedTo = "";
        } else {
          const account = db.staffAccounts.find((item) => item.id === assignedToId && item.active !== false && ["admin", "technician"].includes(item.role));
          if (!account && assignedToId !== session.sub) throw Object.assign(new Error("Người phụ trách không còn hoạt động hoặc không có quyền xử lý"), { status: 400 });
          ticket.assignedToId = account?.id || session.sub;
          ticket.assignedTo = account?.displayName || session.name;
        }
      } else if (body.assignedTo !== undefined) {
        ticket.assignedTo = String(body.assignedTo).trim().slice(0, 120);
        ticket.assignedToId = "";
      }
      if (body.resolution !== undefined) ticket.resolution = String(body.resolution).trim().slice(0, 1000);
      const humanTakeoverRequested = Boolean(ticket.assignedTo) || ticket.status === "in_progress";
      if (humanTakeoverRequested) {
        const newlyLocked = lockHumanHandoff(ticket, {
          at,
          reason: Boolean(ticket.assignedTo) ? "assigned_to_staff" : "staff_in_progress",
          actorId: session.sub,
          actorName: session.name,
        });
        if (newlyLocked) pushHistory(db, { ticketId: ticket.id, actorId: session.sub, actorName: session.name, type: "ai_handoff", from: "ai_active", to: "human_only", note: "Ticket đã được kỹ thuật viên tiếp nhận; AI bị khóa khỏi hội thoại" });
      }
      if (oldPriority !== ticket.priority) {
        recalculateSla(ticket, ticket.priority, at);
        pushHistory(db, { ticketId: ticket.id, actorId: session.sub, actorName: session.name, type: "priority", from: oldPriority, to: ticket.priority });
      }
      if (oldAssignee !== ticket.assignedTo || oldAssigneeId !== ticket.assignedToId) pushHistory(db, { ticketId: ticket.id, actorId: session.sub, actorName: session.name, type: "assignment", from: oldAssignee, to: ticket.assignedTo });
      if (oldStatus !== ticket.status) {
        recordStatusChange(db, ticket, oldStatus, ticket.status, session.sub, session.name, body.resolution || "");
        notifyRequester(db, ticket, "status", `${ticket.code}: trạng thái đã thay đổi`, `${oldStatus} → ${ticket.status}`);
      }
      if (["in_progress", "resolved", "closed"].includes(ticket.status)) markFirstResponse(ticket);
      syncSlaForStatus(ticket, oldStatus, at, { id: session.sub, name: session.name });
      if (["resolved", "closed"].includes(ticket.status) && !ticket.resolvedAt) ticket.resolvedAt = at;
      if (!["resolved", "closed"].includes(ticket.status)) ticket.resolvedAt = null;
      ticket.updatedAt = at;
      return ticket;
    });
    await audit(session.sub, "update", "ticket", params.ticketId, body);
    return json(res, 200, { ticket: publicTicket(updated) }, headers);
  }

  if (req.method === "GET" && pathname === "/api/staff/playbook/governance/status") {
    await requireAuth(req, { staff: true });
    return json(res, 200, { governance: await getPlaybookGovernanceStatus() }, headers);
  }

  if (req.method === "GET" && pathname === "/api/staff/playbook/procedures") {
    await requireAuth(req, { staff: true });
    const procedures = await listPlaybookProcedures({
      query: searchParams.get("q") || "",
      status: searchParams.get("status") || "",
      lifecycle: searchParams.get("lifecycle") || "",
      limit: searchParams.get("limit") || 300,
    });
    return json(res, 200, { procedures }, headers);
  }

  if (req.method === "POST" && pathname === "/api/staff/playbook/drafts") {
    const session = await requireAuth(req, { roles: STAFF_WRITE_ROLES });
    const procedure = await createPlaybookDraft(session, await readJson(req));
    await audit(session.sub, "draft_create", "playbook", procedure.id, { code: procedure.code });
    return json(res, 201, { procedure }, headers);
  }

  params = routeMatch(pathname, "/api/staff/playbook/drafts/from-ticket/:ticketId");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req, { roles: STAFF_WRITE_ROLES });
    const bundle = await getTicketBundle(params.ticketId);
    const payload = draftPayloadFromTicket(bundle.ticket, bundle.messages);
    payload.code = `${payload.code}-${Date.now().toString(36).toUpperCase()}`;
    const procedure = await createPlaybookDraft(session, payload);
    await audit(session.sub, "draft_from_ticket", "playbook", procedure.id, { ticketId: params.ticketId, code: procedure.code });
    return json(res, 201, { procedure }, headers);
  }

  params = routeMatch(pathname, "/api/staff/playbook/procedures/:procedureId/versions");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req, { roles: STAFF_WRITE_ROLES });
    const procedure = await createPlaybookVersion(session, params.procedureId, await readJson(req));
    await audit(session.sub, "version_create", "playbook", params.procedureId, {});
    return json(res, 201, { procedure }, headers);
  }

  params = routeMatch(pathname, "/api/staff/playbook/procedures/:procedureId");
  if (req.method === "GET" && params) {
    await requireAuth(req, { staff: true });
    return json(res, 200, { procedure: await getPlaybookProcedure(params.procedureId) }, headers);
  }

  params = routeMatch(pathname, "/api/staff/playbook/versions/:versionId");
  if (req.method === "PATCH" && params) {
    const session = await requireAuth(req, { roles: STAFF_WRITE_ROLES });
    const procedure = await updatePlaybookDraft(session, params.versionId, await readJson(req));
    await audit(session.sub, "draft_update", "playbookVersion", params.versionId, {});
    return json(res, 200, { procedure }, headers);
  }

  params = routeMatch(pathname, "/api/staff/playbook/versions/:versionId/submit");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req, { roles: STAFF_WRITE_ROLES });
    const procedure = await submitPlaybookVersion(session, params.versionId);
    await audit(session.sub, "submit", "playbookVersion", params.versionId, {});
    return json(res, 200, { procedure }, headers);
  }

  params = routeMatch(pathname, "/api/admin/playbook/versions/:versionId/publish");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req, { admin: true });
    const body = await readJson(req);
    const procedure = await publishPlaybookVersion(session, params.versionId, { reviewNote: body.reviewNote || "" });
    await audit(session.sub, "publish", "playbookVersion", params.versionId, { procedureId: procedure.id });
    if (config.playbookAutoReindexOnPublish) queuePlaybookReindex({ requestedBy: session.name });
    return json(res, 200, { procedure, indexQueued: config.playbookAutoReindexOnPublish }, headers);
  }

  params = routeMatch(pathname, "/api/admin/playbook/versions/:versionId/reject");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req, { admin: true });
    const body = await readJson(req);
    const procedure = await rejectPlaybookVersion(session, params.versionId, { reviewNote: body.reviewNote || "" });
    await audit(session.sub, "reject", "playbookVersion", params.versionId, { reviewNote: body.reviewNote || "" });
    return json(res, 200, { procedure }, headers);
  }

  params = routeMatch(pathname, "/api/admin/playbook/versions/:versionId/rollback");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req, { admin: true });
    const body = await readJson(req);
    const procedure = await rollbackPlaybookVersion(session, params.versionId, { reviewNote: body.reviewNote || "Rollback theo yêu cầu quản trị" });
    await audit(session.sub, "rollback", "playbookVersion", params.versionId, { procedureId: procedure.id });
    if (config.playbookAutoReindexOnPublish) queuePlaybookReindex({ requestedBy: session.name });
    return json(res, 200, { procedure, indexQueued: config.playbookAutoReindexOnPublish }, headers);
  }

  params = routeMatch(pathname, "/api/admin/playbook/procedures/:procedureId/lifecycle");
  if (req.method === "POST" && params) {
    const session = await requireAuth(req, { admin: true });
    const body = await readJson(req);
    const procedure = await setProcedureLifecycle(session, params.procedureId, body.status, body.note || "");
    await audit(session.sub, "lifecycle", "playbook", params.procedureId, { status: body.status, note: body.note || "" });
    if (config.playbookAutoReindexOnPublish) queuePlaybookReindex({ requestedBy: session.name });
    return json(res, 200, { procedure, indexQueued: config.playbookAutoReindexOnPublish }, headers);
  }

  if (req.method === "POST" && pathname === "/api/admin/playbook/governance/seed") {
    const session = await requireAuth(req, { admin: true });
    const result = await seedManagedPlaybookFromFile(session);
    await audit(session.sub, "seed", "playbook", "baseline", result);
    if (config.playbookAutoReindexOnPublish) queuePlaybookReindex({ requestedBy: session.name });
    return json(res, 200, { result, indexQueued: config.playbookAutoReindexOnPublish }, headers);
  }

  if (req.method === "GET" && pathname === "/api/admin/knowledge-base") {
    await requireAuth(req, { staff: true });
    const db = await readDb();
    return json(res, 200, { entries: db.knowledgeBase.sort((a, b) => a.title.localeCompare(b.title)) }, headers);
  }

  if (req.method === "POST" && pathname === "/api/admin/knowledge-base") {
    const session = await requireAuth(req, { admin: true });
    const body = await readJson(req);
    if (!String(body.title || "").trim() || !Array.isArray(body.steps) || !body.steps.length) {
      throw Object.assign(new Error("KB cần tiêu đề và ít nhất một bước xử lý"), { status: 400 });
    }
    const entry = {
      id: id("kb"), slug: slug(body.slug || body.title),
      title: String(body.title).trim().slice(0, 180), category: String(body.category || "other").slice(0, 40),
      keywords: Array.isArray(body.keywords) ? body.keywords.map(String).slice(0, 30) : [],
      risk: ["low", "medium", "high"].includes(body.risk) ? body.risk : "low",
      autoEligible: Boolean(body.autoEligible), summary: String(body.summary || "").trim().slice(0, 1000),
      steps: body.steps.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20),
      active: body.active !== false, createdAt: nowIso(), updatedAt: nowIso(),
    };
    await updateDb((db) => db.knowledgeBase.push(entry));
    await audit(session.sub, "create", "knowledgeBase", entry.id, { title: entry.title });
    return json(res, 201, { entry }, headers);
  }

  params = routeMatch(pathname, "/api/admin/knowledge-base/:entryId");
  if (req.method === "PATCH" && params) {
    const session = await requireAuth(req, { admin: true });
    const body = await readJson(req);
    const entry = await updateDb((db) => {
      const item = db.knowledgeBase.find((candidate) => candidate.id === params.entryId);
      if (!item) throw Object.assign(new Error("Không tìm thấy KB"), { status: 404 });
      for (const key of ["title", "category", "summary", "risk"]) if (body[key] !== undefined) item[key] = String(body[key]).trim();
      if (body.keywords !== undefined) item.keywords = Array.isArray(body.keywords) ? body.keywords.map(String) : item.keywords;
      if (body.steps !== undefined) item.steps = Array.isArray(body.steps) ? body.steps.map(String).filter(Boolean) : item.steps;
      if (body.autoEligible !== undefined) item.autoEligible = Boolean(body.autoEligible);
      if (body.active !== undefined) item.active = Boolean(body.active);
      item.updatedAt = nowIso();
      return item;
    });
    await audit(session.sub, "update", "knowledgeBase", entry.id, body);
    return json(res, 200, { entry }, headers);
  }

  return notFound(res, headers);
}

const server = http.createServer(async (req, res) => {
  console.log(`[HTTP] ${req.method} ${req.url} | origin=${req.headers.origin || "-"} | authorization=${req.headers.authorization ? "YES" : "NO"}`);
  const cors = corsHeaders(req);
  const headers = securityHeaders(cors);
  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    return res.end();
  }
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/") || url.pathname === "/health") return await handleApi(req, res, url, headers);
    if (url.pathname === "/") { res.writeHead(302, { ...headers, Location: "/admin" }); return res.end(); }
    if (await serveStatic(res, url.pathname, headers)) return;
    return notFound(res, headers);
  } catch (error) {
    console.error(error);
    const { status, payload } = publicHttpError(error, { pathname: String(req.url || "/").split("?", 1)[0] });
    return json(res, status, payload, headers);
  }
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Zalo HelpDesk Zero-Cost listening on http://0.0.0.0:${config.port}`);
  console.log(`Admin dashboard: http://localhost:${config.port}/admin`);
  if (config.zaloAuthMode === "development") console.warn("WARNING: ZALO_AUTH_MODE=development must not be used in production.");
  if (config.appSecret === "dev-only-secret-change-me") console.warn("WARNING: Change APP_SECRET before production.");
  console.log(`Database: ${config.dbProvider}${config.dbProvider === "sqlserver" ? ` (${config.sqlServerDatabase})` : ` (${config.dataFile})`}`);
  console.log(`Agent mode: ${config.agentMode}${config.agentMode === "ollama" ? ` (${config.ollamaModel})` : ""}; no paid AI API is used.`);
  getAgentStatus({ force: true }).then((status) => {
    if (status.ready) console.log(`AI Agent ready: ${status.provider}${status.model ? ` / ${status.model}` : ""}`);
    else console.warn(`AI Agent not ready: ${status.error || "unknown error"}. Playbook/rules fallback remains active.`);
  }).catch((error) => console.warn(`AI Agent status check failed: ${error.message}`));
  getPlaybookStatus({ force: true }).then((status) => {
    if (status.ready) console.log(`Enterprise Playbook ready: ${status.totalEntries} entries; semantic=${status.semanticEnabled}; indexCurrent=${status.indexCurrent}`);
    else console.warn(`Enterprise Playbook not ready: ${status.error || "unknown error"}`);
  }).catch((error) => console.warn(`Playbook status check failed: ${error.message}`));
  getPlaybookGovernanceStatus().then((status) => {
    if (status.ready) console.log(`Playbook Governance ready: ${status.counts?.published || 0} published; ${status.counts?.submitted || 0} awaiting review`);
    else console.warn(`Playbook Governance not ready: ${status.error || "install SQL migration 004"}`);
  }).catch((error) => console.warn(`Playbook Governance status check failed: ${error.message}`));
  console.log(`SLA monitor runs every ${config.overdueCheckSeconds} seconds.`);
});

setInterval(() => processOverdueTickets().catch((error) => console.error("SLA monitor error:", error)), Math.max(10, config.overdueCheckSeconds) * 1000).unref();
processOverdueTickets().catch((error) => console.error("Initial SLA monitor error:", error));


async function shutdown(signal) {
  console.log(`Received ${signal}; closing database connections...`);
  try { await closeStore(); } finally { process.exit(0); }
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
