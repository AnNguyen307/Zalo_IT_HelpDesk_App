import crypto from "node:crypto";
import { removeAttachmentFileStrict } from "./attachments.mjs";
import { config } from "./config.mjs";
import { readDb, updateDb } from "./store.mjs";
import { id, nowIso, safeEqual } from "./utils.mjs";

export const ZALO_REVOKE_CONSENT_EVENT = "user.revoke.consent";
export const PRIVACY_GC_PENDING = "privacy_attachment_gc_pending";
export const PRIVACY_ERASURE_COMPLETED = "privacy_user_data_erased";

function signatureValue(value) {
  return value !== null && typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function generateZaloWebhookSignature(data, apiKey) {
  const content = Object.keys(data || {})
    .sort()
    .map((key) => signatureValue(data[key]))
    .join("");
  return crypto.createHash("sha256").update(`${content}${apiKey}`).digest("hex");
}

export function verifyZaloWebhookSignature(data, providedSignature, apiKey = config.zaloOpenApiKey) {
  const provided = String(providedSignature || "").trim().toLowerCase();
  if (!provided || !apiKey) return false;
  return safeEqual(provided, generateZaloWebhookSignature(data, apiKey));
}

function referencesErasedRecord(entry, userIds, ticketIds, attachmentIds) {
  if (userIds.has(entry.actor) || userIds.has(entry.entityId)) return true;
  if (ticketIds.has(entry.entityId) || attachmentIds.has(entry.entityId)) return true;
  const detail = entry.detail || {};
  return userIds.has(detail.userId)
    || userIds.has(detail.actorId)
    || ticketIds.has(detail.ticketId)
    || attachmentIds.has(detail.attachmentId);
}

export function eraseZaloUserDataSnapshot(db, zaloUserId, { at = nowIso(), requestId = id("erase") } = {}) {
  const users = db.users.filter((item) => String(item.zaloUserId || "") === String(zaloUserId));
  const userIds = new Set(users.map((item) => item.id));
  const ticketIds = new Set(db.tickets.filter((item) => userIds.has(item.userId)).map((item) => item.id));
  const attachments = db.attachments.filter((item) => ticketIds.has(item.ticketId) || userIds.has(item.uploaderId));
  const attachmentIds = new Set(attachments.map((item) => item.id));

  const counts = {
    users: users.length,
    invites: db.userInvites.filter((item) => userIds.has(item.usedByUserId)).length,
    sessions: db.userRefreshSessions.filter((item) => userIds.has(item.userId)).length,
    tickets: ticketIds.size,
    messages: db.messages.filter((item) => ticketIds.has(item.ticketId) || userIds.has(item.authorId)).length,
    attachments: attachments.length,
    notifications: db.notifications.filter((item) => ticketIds.has(item.ticketId) || userIds.has(item.userId)).length,
    history: db.ticketHistory.filter((item) => ticketIds.has(item.ticketId) || userIds.has(item.actorId)).length,
    copilotRuns: db.aiCopilotRuns.filter((item) => ticketIds.has(item.ticketId)).length,
  };

  if (!userIds.size) return { requestId, found: false, counts, attachments: [] };

  db.users = db.users.filter((item) => !userIds.has(item.id));
  db.userInvites = db.userInvites.filter((item) => !userIds.has(item.usedByUserId));
  db.userRefreshSessions = db.userRefreshSessions.filter((item) => !userIds.has(item.userId));
  db.tickets = db.tickets.filter((item) => !ticketIds.has(item.id));
  db.messages = db.messages.filter((item) => !ticketIds.has(item.ticketId) && !userIds.has(item.authorId));
  db.attachments = db.attachments.filter((item) => !attachmentIds.has(item.id));
  db.notifications = db.notifications.filter((item) => !ticketIds.has(item.ticketId) && !userIds.has(item.userId));
  db.ticketHistory = db.ticketHistory.filter((item) => !ticketIds.has(item.ticketId) && !userIds.has(item.actorId));
  db.aiCopilotRuns = db.aiCopilotRuns.filter((item) => !ticketIds.has(item.ticketId));
  db.auditLog = db.auditLog.filter((entry) => !referencesErasedRecord(entry, userIds, ticketIds, attachmentIds));

  db.auditLog.push({
    id: requestId,
    actor: "zalo-webhook",
    action: attachments.length ? PRIVACY_GC_PENDING : PRIVACY_ERASURE_COMPLETED,
    entityType: "privacy_request",
    entityId: requestId,
    detail: attachments.length
      ? {
          requestedAt: at,
          counts,
          attachments: attachments.map((item) => ({
            id: item.id,
            storagePath: item.storagePath,
            size: Number(item.size || 0),
          })),
        }
      : { requestedAt: at, completedAt: at, counts },
    createdAt: at,
  });

  if (db.auditLog.length > 5000) db.auditLog.splice(0, db.auditLog.length - 5000);
  return { requestId, found: true, counts, attachments };
}

export async function processZaloPrivacyCleanups() {
  const pending = (await readDb()).auditLog
    .filter((entry) => entry.action === PRIVACY_GC_PENDING)
    .map((entry) => ({
      id: entry.id,
      attachments: Array.isArray(entry.detail?.attachments) ? structuredClone(entry.detail.attachments) : [],
    }));
  const result = { completed: 0, failed: [] };

  for (const cleanup of pending) {
    try {
      for (const attachment of cleanup.attachments) await removeAttachmentFileStrict(attachment);
      await updateDb((db) => {
        const entry = db.auditLog.find((item) => item.id === cleanup.id && item.action === PRIVACY_GC_PENDING);
        if (!entry) return;
        entry.action = PRIVACY_ERASURE_COMPLETED;
        entry.detail = {
          requestedAt: entry.detail?.requestedAt || entry.createdAt,
          completedAt: nowIso(),
          counts: entry.detail?.counts || {},
        };
      });
      result.completed += 1;
    } catch (error) {
      result.failed.push({ cleanupId: cleanup.id, error: String(error?.message || error) });
    }
  }
  return result;
}

function validateEvent(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw Object.assign(new Error("Webhook payload must be a JSON object"), { status: 400, code: "ZALO_WEBHOOK_INVALID" });
  }
  if (String(data.appId || "") !== config.zaloMiniAppId) {
    throw Object.assign(new Error("Webhook Mini App ID is not accepted"), { status: 403, code: "ZALO_WEBHOOK_APP_MISMATCH" });
  }
  if (!String(data.userId || "").trim()) {
    throw Object.assign(new Error("Webhook userId is required"), { status: 400, code: "ZALO_WEBHOOK_INVALID" });
  }
}

export async function handleZaloWebhookEvent(data, providedSignature) {
  if (!config.zaloOpenApiKey) {
    throw Object.assign(new Error("Zalo webhook is awaiting API Key configuration"), { status: 503, code: "ZALO_WEBHOOK_NOT_CONFIGURED" });
  }
  if (!verifyZaloWebhookSignature(data, providedSignature)) {
    throw Object.assign(new Error("Zalo webhook signature is invalid"), { status: 401, code: "ZALO_WEBHOOK_SIGNATURE_INVALID" });
  }
  validateEvent(data);

  if (data.event !== ZALO_REVOKE_CONSENT_EVENT) {
    return { accepted: false, ignored: true, event: String(data.event || "") };
  }

  const erased = await updateDb((db) => eraseZaloUserDataSnapshot(db, data.userId));
  const cleanup = await processZaloPrivacyCleanups();
  if (cleanup.failed.length) {
    console.warn(`[PRIVACY] Attachment deletion will be retried; request=${erased.requestId}; failures=${cleanup.failed.length}`);
  }
  return {
    accepted: true,
    event: ZALO_REVOKE_CONSENT_EVENT,
    erased: erased.found,
    requestId: erased.requestId,
    cleanupPending: cleanup.failed.length,
  };
}

export function zaloWebhookStatus() {
  return {
    endpoint: "/api/webhooks/zalo",
    configured: Boolean(config.zaloOpenApiKey && config.zaloMiniAppId),
    miniAppIdConfigured: Boolean(config.zaloMiniAppId),
  };
}
