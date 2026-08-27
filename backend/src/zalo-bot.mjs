import { analyzeTicket, formatAgentReply } from "./ai-agent.mjs";
import { parseModelJson } from "./ai-json.mjs";
import { requestAiProviderDecision } from "./ai-router.mjs";
import { config } from "./config.mjs";
import { messageRequestsHumanHandoff } from "./handoff.mjs";
import { readDb, updateDb } from "./store.mjs";
import { id, normalizeText, nowIso, safeEqual } from "./utils.mjs";

const BOT_INBOX_PENDING = "zalo_bot_inbox_pending";
const BOT_INBOX_PROCESSING = "zalo_bot_inbox_processing";
const BOT_INBOX_COMPLETED = "zalo_bot_inbox_completed";
const BOT_INBOX_FAILED = "zalo_bot_inbox_failed";
const BOT_SESSION = "zalo_bot_session";
const BOT_INBOX_ACTIONS = new Set([
  BOT_INBOX_PENDING,
  BOT_INBOX_PROCESSING,
  BOT_INBOX_COMPLETED,
  BOT_INBOX_FAILED,
]);
const ACTIVE_TICKET_STATUSES = new Set(["open", "waiting_user", "in_progress"]);
const BOT_CATEGORIES = ["network", "printer", "windows", "office", "account", "software", "hardware", "other"];
const BOT_PRIORITIES = ["low", "normal", "high", "urgent"];
const BOT_RISKS = ["low", "medium", "high"];
const MAX_SESSION_MESSAGES = 12;
const MAX_INBOX_RECOVERY = 100;

const BOT_DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: { type: "string", enum: BOT_CATEGORIES },
    priority: { type: "string", enum: BOT_PRIORITIES },
    risk: { type: "string", enum: BOT_RISKS },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    summary: { type: "string", minLength: 4, maxLength: 300 },
    reply: { type: "string", minLength: 4, maxLength: 1200 },
    steps: { type: "array", items: { type: "string", minLength: 2, maxLength: 400 }, maxItems: 5 },
    needsHuman: { type: "boolean" },
    reason: { type: "string", minLength: 2, maxLength: 400 },
  },
  required: ["category", "priority", "risk", "confidence", "summary", "reply", "steps", "needsHuman", "reason"],
};

const FORBIDDEN_GUIDANCE = [
  /gửi\s+(mật khẩu|password|otp|mã xác minh)/iu,
  /cung cấp\s+(mật khẩu|password|otp|mã xác minh)/iu,
  /tắt\s+(antivirus|windows defender|firewall)/iu,
  /dùng\s+(crack|key lạ|kms)/iu,
  /format\s+(ổ|disk|máy)/iu,
  /xóa\s+(toàn bộ|hết)\s+(dữ liệu|ổ|file)/iu,
];

let processingQueue = Promise.resolve();
let webhookRegistration = {
  automatic: config.zaloBotAutoRegisterWebhook,
  endpoint: config.zaloBotWebhookUrl || null,
  attemptedAt: null,
  ok: null,
  httpStatus: null,
  apiStatusCode: null,
  error: null,
};

function compact(value, limit = 2000) {
  return String(value || "").trim().replace(/\u0000/g, "").slice(0, limit);
}

function botUserKey(externalUserId) {
  return `bot:${compact(externalUserId, 180)}`;
}

function publicError(error) {
  return compact(error?.message || error || "Unknown Zalo Bot error", 600)
    .split(config.zaloBotToken || "__no_token__").join("<REDACTED>")
    .split(config.zaloBotWebhookSecret || "__no_secret__").join("<REDACTED>");
}

function addAudit(db, entry) {
  db.auditLog.push(entry);
  if (db.auditLog.length > 5000) db.auditLog.splice(0, db.auditLog.length - 5000);
  return entry;
}

function sessionEntry(db, chatId) {
  return db.auditLog.find((entry) => (
    entry.action === BOT_SESSION
    && entry.entityType === "zalo_bot_chat"
    && String(entry.entityId) === String(chatId)
  ));
}

function sessionDetail(entry) {
  const detail = entry?.detail && typeof entry.detail === "object" ? entry.detail : {};
  return {
    externalUserId: compact(detail.externalUserId, 180),
    displayName: compact(detail.displayName, 200) || "Người dùng Zalo",
    attempts: Math.max(0, Number(detail.attempts || 0)),
    openTicketId: compact(detail.openTicketId, 80),
    openTicketCode: compact(detail.openTicketCode, 80),
    messages: Array.isArray(detail.messages)
      ? detail.messages.slice(-MAX_SESSION_MESSAGES).map((message) => ({
          role: message?.role === "assistant" ? "assistant" : "user",
          body: compact(message?.body, 2000),
          createdAt: compact(message?.createdAt, 40) || nowIso(),
        }))
      : [],
    lastActivityAt: compact(detail.lastActivityAt, 40) || null,
  };
}

function writeSession(db, event, mutate) {
  let entry = sessionEntry(db, event.chatId);
  if (!entry) {
    entry = addAudit(db, {
      id: id("zbot_session"),
      actor: "zalo-bot",
      action: BOT_SESSION,
      entityType: "zalo_bot_chat",
      entityId: event.chatId,
      detail: {
        externalUserId: event.externalUserId,
        displayName: event.displayName,
        attempts: 0,
        openTicketId: "",
        openTicketCode: "",
        messages: [],
        lastActivityAt: event.receivedAt,
      },
      createdAt: event.receivedAt,
    });
  }
  const next = sessionDetail(entry);
  next.externalUserId = event.externalUserId || next.externalUserId;
  next.displayName = event.displayName || next.displayName;
  mutate(next);
  next.messages = next.messages.slice(-MAX_SESSION_MESSAGES);
  next.lastActivityAt = nowIso();
  entry.detail = next;
  return next;
}

function appendSessionMessage(session, role, body, createdAt = nowIso()) {
  const text = compact(body, 2000);
  if (!text) return;
  session.messages.push({ role: role === "assistant" ? "assistant" : "user", body: text, createdAt });
  session.messages = session.messages.slice(-MAX_SESSION_MESSAGES);
}

function normalizeMessageText(message) {
  if (typeof message?.text === "string") return compact(message.text, 5000);
  if (typeof message?.text?.text === "string") return compact(message.text.text, 5000);
  if (typeof message?.content?.text === "string") return compact(message.content.text, 5000);
  return "";
}

export function normalizeZaloBotEvent(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw Object.assign(new Error("Zalo Bot webhook payload must be a JSON object"), { status: 400, code: "ZALO_BOT_PAYLOAD_INVALID" });
  }
  const envelope = payload.result && typeof payload.result === "object"
    ? payload.result
    : payload.data && typeof payload.data === "object"
      ? payload.data
      : payload;
  const message = envelope.message && typeof envelope.message === "object" ? envelope.message : payload.message || {};
  const from = message.from && typeof message.from === "object" ? message.from : envelope.from || {};
  const chat = message.chat && typeof message.chat === "object" ? message.chat : envelope.chat || {};
  const eventName = compact(payload.event_name || payload.eventName || payload.event || envelope.event_name || envelope.event, 100);
  const externalMessageId = compact(message.message_id || message.messageId || envelope.message_id || envelope.messageId, 180);
  const externalUserId = compact(from.id || from.user_id || envelope.user_id || envelope.userId, 180);
  const chatId = compact(chat.id || chat.chat_id || envelope.chat_id || envelope.chatId, 180);
  const chatType = compact(chat.chat_type || chat.type || envelope.chat_type || "PRIVATE", 30).toUpperCase();
  const displayName = compact(from.display_name || from.displayName || envelope.display_name || "Người dùng Zalo", 200);
  const fromIsBot = from.is_bot === true || from.isBot === true;
  const text = normalizeMessageText(message);

  if (!eventName || !externalMessageId || !externalUserId || !chatId) {
    throw Object.assign(new Error("Zalo Bot webhook is missing message, user, or chat identity"), { status: 400, code: "ZALO_BOT_EVENT_INVALID" });
  }
  return {
    eventName,
    externalMessageId,
    externalUserId,
    displayName,
    chatId,
    chatType,
    fromIsBot,
    text,
    receivedAt: nowIso(),
  };
}

export function verifyZaloBotWebhookSecret(providedSecret, expectedSecret = config.zaloBotWebhookSecret) {
  return Boolean(expectedSecret && providedSecret && safeEqual(providedSecret, expectedSecret));
}

function safeRegistrationError(error, secrets = []) {
  let message = compact(error?.message || error || "Unknown Zalo Bot webhook registration error", 600);
  for (const secret of secrets.filter(Boolean)) message = message.split(secret).join("<REDACTED>");
  return message;
}

export async function registerZaloBotWebhook({
  fetchImpl = fetch,
  enabled = config.zaloBotEnabled,
  automatic = config.zaloBotAutoRegisterWebhook,
  token = config.zaloBotToken,
  secret = config.zaloBotWebhookSecret,
  webhookUrl = config.zaloBotWebhookUrl,
  apiBaseUrl = config.zaloBotApiBaseUrl,
  timeoutMs = config.zaloBotTimeoutMs,
} = {}) {
  const attemptedAt = nowIso();
  const endpoint = compact(webhookUrl, 2048);
  webhookRegistration = {
    automatic: Boolean(automatic),
    endpoint: endpoint || null,
    attemptedAt,
    ok: false,
    httpStatus: null,
    apiStatusCode: null,
    error: null,
  };
  if (!enabled || !automatic) {
    webhookRegistration.error = "Automatic webhook registration is disabled";
    return structuredClone(webhookRegistration);
  }
  if (!token || !secret || !endpoint) {
    const error = new Error("Zalo Bot webhook registration is missing token, secret, or public webhook URL");
    webhookRegistration.error = error.message;
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const base = String(apiBaseUrl || "").replace(/\/$/, "");
    const response = await fetchImpl(`${base}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: endpoint, secret_token: secret }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    const apiStatusCode = Number.isFinite(Number(payload?.status_code)) ? Number(payload.status_code) : null;
    const apiAccepted = payload?.ok !== false && (apiStatusCode === null || apiStatusCode === 200);
    webhookRegistration.httpStatus = response.status;
    webhookRegistration.apiStatusCode = apiStatusCode;
    if (!response.ok || !apiAccepted) {
      const detail = compact(payload?.message || payload?.description || "Zalo Bot API rejected setWebhook", 300);
      throw new Error(`Zalo Bot setWebhook failed (HTTP ${response.status}${apiStatusCode === null ? "" : `, API ${apiStatusCode}`}): ${detail}`);
    }
    webhookRegistration.ok = true;
    return structuredClone(webhookRegistration);
  } catch (error) {
    const safeMessage = safeRegistrationError(error, [token, secret]);
    webhookRegistration.ok = false;
    webhookRegistration.error = safeMessage;
    throw new Error(safeMessage, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

function ensureConfigured() {
  if (!config.zaloBotEnabled || !config.zaloBotToken || !config.zaloBotWebhookSecret) {
    throw Object.assign(new Error("Zalo Bot is not enabled or fully configured"), { status: 503, code: "ZALO_BOT_NOT_CONFIGURED" });
  }
}

function ticketRequested(text) {
  const normalized = normalizeText(text);
  return /\b(tao|mo|gui) ticket\b/.test(normalized)
    || /\b(gap|chuyen cho|nho) (it|helpdesk|ky thuat vien)\b/.test(normalized);
}

function issueResolved(text) {
  const normalized = normalizeText(text);
  return [
    /\b(da|het) (duoc|loi|roi)\b/,
    /\bkhac phuc duoc\b/,
    /\bda xu ly xong\b/,
    /\bthanh cong roi\b/,
  ].some((pattern) => pattern.test(normalized));
}

function helpRequested(text) {
  const normalized = normalizeText(text);
  return !normalized
    || /^(xin chao|chao|hello|hi|help|tro giup|bat dau)$/.test(normalized);
}

function sensitiveOrUnsafe(value) {
  const combined = Array.isArray(value) ? value.join("\n") : String(value || "");
  return FORBIDDEN_GUIDANCE.some((pattern) => pattern.test(combined));
}

function validateBotDecision(content, telemetry) {
  const parsed = parseModelJson(content);
  if (!parsed || typeof parsed !== "object") {
    const error = new Error("Zalo Bot AI response is not valid JSON");
    error.reasonCode = "invalid_json";
    throw error;
  }
  const steps = Array.isArray(parsed.steps) ? parsed.steps.map((step) => compact(step, 400)).filter(Boolean).slice(0, 5) : [];
  const reply = compact(parsed.reply, 1200);
  const result = {
    category: BOT_CATEGORIES.includes(parsed.category) ? parsed.category : "other",
    priority: BOT_PRIORITIES.includes(parsed.priority) ? parsed.priority : "normal",
    risk: BOT_RISKS.includes(parsed.risk) ? parsed.risk : "medium",
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0))),
    summary: compact(parsed.summary, 300),
    reply,
    steps,
    needsHuman: parsed.needsHuman === true,
    reason: compact(parsed.reason, 400),
    providerTelemetry: telemetry,
  };
  if (!result.summary || !result.reply || !result.reason || sensitiveOrUnsafe([result.reply, ...result.steps])) {
    const error = new Error("Zalo Bot AI response is incomplete or unsafe");
    error.reasonCode = "unsafe_output";
    throw error;
  }
  return result;
}

async function analyzeGenerativeFallback(input, session) {
  const result = await requestAiProviderDecision({
    system: [
      "Bạn là Zalo Chat Bot hỗ trợ IT trong môi trường pilot dùng dữ liệu mock.",
      "Khi không có Playbook phù hợp, bạn được phép suy luận để đưa ra hướng xử lý IT thông dụng, ngắn gọn và có thể hoàn tác.",
      "Không yêu cầu mật khẩu, OTP, khóa bí mật; không hướng dẫn tắt bảo mật, format/xóa dữ liệu, dùng crack hoặc thao tác quản trị nguy hiểm.",
      "Đặt needsHuman=true nếu cần quyền quản trị, can thiệp vật lý, có nguy cơ mất dữ liệu/bảo mật, hoặc không đủ chắc chắn.",
      "Chỉ trả JSON theo schema.",
    ].join("\n"),
    payload: {
      issue: input,
      recentConversation: session.messages.slice(-8),
      policy: {
        mockData: true,
        playbookMatched: false,
        minimumConfidence: config.zaloBotGenerativeMinConfidence,
      },
    },
    schema: BOT_DECISION_SCHEMA,
    validate: validateBotDecision,
  });
  return result.validated;
}

export async function analyzeZaloBotIssue(input, session, db) {
  const ticketInput = {
    title: compact(input.title, 160),
    description: compact(input.description, 5000),
    location: "",
    device: "",
  };
  const strict = await analyzeTicket(ticketInput, db.knowledgeBase, {
    latestUserMessage: ticketInput.description,
    messages: session.messages,
    attachments: [],
    trigger: "zalo_bot_message",
  });

  if (strict.canAutoHandle) return { ...strict, botMode: "playbook", needsHuman: false };
  const hasPlaybook = Array.isArray(strict.playbookIds) && strict.playbookIds.length > 0;
  if (!config.zaloBotGenerativeFallback || hasPlaybook || strict.risk === "high" || strict.escalationCode === "policy_blocked") {
    return { ...strict, botMode: "handoff", needsHuman: true };
  }

  try {
    const generated = await analyzeGenerativeFallback(ticketInput, session);
    const needsHuman = generated.needsHuman
      || generated.risk === "high"
      || generated.confidence < config.zaloBotGenerativeMinConfidence;
    return {
      ...generated,
      source: `${generated.providerTelemetry?.provider || "ai-router-v2"}+zalo-bot-generative`,
      model: generated.providerTelemetry?.model || null,
      generatedAt: nowIso(),
      outcome: needsHuman ? "escalate" : "guide_user",
      canAutoHandle: !needsHuman,
      escalated: needsHuman,
      escalationCode: needsHuman ? "zalo_bot_generative_handoff" : null,
      botMode: needsHuman ? "handoff" : "generative",
    };
  } catch (error) {
    return {
      ...strict,
      source: "zalo-bot-generative-unavailable",
      botMode: "handoff",
      needsHuman: true,
      reason: `Generative fallback unavailable: ${publicError(error)}`,
      escalationCode: "zalo_bot_ai_unavailable",
    };
  }
}

function guidanceText(analysis) {
  if (analysis.botMode === "playbook") return compact(formatAgentReply(analysis), 2000);
  const steps = analysis.steps?.length
    ? `\n\n${analysis.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`
    : "";
  return compact([
    "Gợi ý AI thử nghiệm (chưa có trong Playbook):",
    analysis.reply,
    steps,
    "\nSau khi thử, hãy trả lời “Đã được” hoặc “Vẫn chưa được”. Nếu chưa xử lý được, tôi sẽ tự tạo ticket cho HelpDesk.",
  ].join("\n"), 2000);
}

function ticketTitle(analysis, text) {
  const candidate = compact(analysis?.summary || text, 160).replace(/\s+/g, " ");
  return candidate.length >= 4 ? candidate : "Yêu cầu hỗ trợ từ Zalo Bot";
}

function transcriptDescription(session, currentText, analysis) {
  const lines = [...session.messages, { role: "user", body: currentText }]
    .slice(-MAX_SESSION_MESSAGES)
    .map((message) => `${message.role === "assistant" ? "Bot" : "Người dùng"}: ${compact(message.body, 800)}`);
  return compact([
    "Nguồn: Zalo Chat Bot",
    `Người dùng: ${session.displayName || "Người dùng Zalo"}`,
    `Lý do chuyển: ${compact(analysis?.reason || "Bot không thể xử lý vấn đề", 400)}`,
    "",
    "Lịch sử tư vấn:",
    ...lines,
  ].join("\n"), 5000);
}

async function ensureBotUser(event) {
  return updateDb((db) => {
    const zaloUserId = botUserKey(event.externalUserId);
    let user = db.users.find((item) => item.zaloUserId === zaloUserId);
    if (!user) {
      const createdAt = nowIso();
      user = {
        id: id("usr"),
        zaloUserId,
        name: event.displayName || "Người dùng Zalo",
        avatar: "",
        phone: "",
        department: "Zalo Bot",
        role: "user",
        createdAt,
        updatedAt: createdAt,
      };
      db.users.push(user);
    } else if (event.displayName && user.name !== event.displayName) {
      user.name = event.displayName;
      user.updatedAt = nowIso();
    }
    return structuredClone(user);
  });
}

async function sendZaloBotMessage(chatId, message, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.zaloBotTimeoutMs);
  try {
    const base = config.zaloBotApiBaseUrl.replace(/\/$/, "");
    const response = await fetchImpl(`${base}/bot${config.zaloBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: compact(message, 2000) }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) {
      const error = new Error(`Zalo Bot sendMessage failed with HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function saveSession(event, mutate) {
  return updateDb((db) => structuredClone(writeSession(db, event, mutate)));
}

async function activeSessionTicket(session) {
  if (!session.openTicketId) return null;
  const db = await readDb();
  const ticket = db.tickets.find((item) => item.id === session.openTicketId);
  return ticket && ACTIVE_TICKET_STATUSES.has(ticket.status) ? ticket : null;
}

async function createEscalation(event, user, session, analysis, callbacks) {
  const currentText = event.text || "Nội dung Zalo Bot không hỗ trợ";
  const result = await callbacks.createTicket(
    { sub: user.id, name: user.name, role: "user" },
    {
      title: ticketTitle(analysis, currentText),
      description: transcriptDescription(session, currentText, analysis),
      location: "",
      device: "",
    },
    {
      forceHumanHandoff: true,
      source: "zalo_bot",
      escalationCode: analysis?.escalationCode || "zalo_bot_self_service_failed",
    },
  );
  const ticket = result.ticket;
  const reply = `Tôi chưa thể xử lý hoàn toàn vấn đề này. Ticket ${ticket.code} đã được tạo và chuyển đến HelpDesk. Bạn có thể tiếp tục nhắn tại đây để bổ sung thông tin.`;
  await saveSession(event, (next) => {
    appendSessionMessage(next, "user", currentText, event.receivedAt);
    appendSessionMessage(next, "assistant", reply);
    next.openTicketId = ticket.id;
    next.openTicketCode = ticket.code;
    next.attempts = 0;
  });
  await sendZaloBotMessage(event.chatId, reply, callbacks.fetchImpl);
  return { responseType: "ticket_created", ticketId: ticket.id, ticketCode: ticket.code };
}

async function processTextMessage(event, callbacks) {
  if (event.eventName !== "message.text.received" || event.fromIsBot) {
    return { responseType: "ignored_unsupported_event" };
  }
  if (event.chatType !== "PRIVATE") return { responseType: "ignored_group_chat" };
  if (!event.text) {
    await sendZaloBotMessage(event.chatId, "Bot IT HelpDesk v5.18.2 hiện nhận mô tả bằng văn bản. Vui lòng gửi nội dung lỗi để tôi hỗ trợ.", callbacks.fetchImpl);
    return { responseType: "unsupported_message" };
  }

  const user = await ensureBotUser(event);
  let db = await readDb();
  let session = sessionDetail(sessionEntry(db, event.chatId));
  if (!session.externalUserId) {
    session = await saveSession(event, () => undefined);
  }

  const openTicket = await activeSessionTicket(session);
  if (openTicket) {
    await callbacks.appendMessage({ sub: user.id, name: user.name, role: "user" }, openTicket.id, { message: event.text });
    const reply = `Đã bổ sung nội dung vào ticket ${openTicket.code}. HelpDesk sẽ tiếp tục xử lý trên cùng ticket này.`;
    await saveSession(event, (next) => {
      appendSessionMessage(next, "user", event.text, event.receivedAt);
      appendSessionMessage(next, "assistant", reply);
    });
    await sendZaloBotMessage(event.chatId, reply, callbacks.fetchImpl);
    return { responseType: "ticket_updated", ticketId: openTicket.id, ticketCode: openTicket.code };
  }

  if (session.openTicketId) {
    session = await saveSession(event, (next) => {
      next.openTicketId = "";
      next.openTicketCode = "";
      next.attempts = 0;
      next.messages = [];
    });
  }

  if (helpRequested(event.text)) {
    const reply = "Hãy mô tả vấn đề IT bạn đang gặp. Tôi sẽ thử hướng dẫn trước; nếu không xử lý được, tôi sẽ tự tạo ticket và chuyển HelpDesk. Bạn cũng có thể nhắn “Tạo ticket” bất cứ lúc nào.";
    await saveSession(event, (next) => appendSessionMessage(next, "assistant", reply));
    await sendZaloBotMessage(event.chatId, reply, callbacks.fetchImpl);
    return { responseType: "help" };
  }

  if (issueResolved(event.text)) {
    const reply = "Tốt rồi, tôi đã ghi nhận vấn đề được xử lý mà không cần tạo ticket. Nếu gặp sự cố khác, bạn chỉ cần gửi mô tả mới.";
    await saveSession(event, (next) => {
      appendSessionMessage(next, "user", event.text, event.receivedAt);
      appendSessionMessage(next, "assistant", reply);
      next.attempts = 0;
      next.messages = [];
    });
    await sendZaloBotMessage(event.chatId, reply, callbacks.fetchImpl);
    return { responseType: "self_service_resolved" };
  }

  const priorIssueText = session.messages.filter((message) => message.role === "user").map((message) => message.body).join("\n");
  const manualTicket = ticketRequested(event.text) || messageRequestsHumanHandoff(event.text);
  if (manualTicket && compact(priorIssueText, 5000).length < 10 && event.text.length < 10) {
    const reply = "Vui lòng mô tả ngắn vấn đề trước. Ngay khi có nội dung, tôi sẽ tạo ticket cho HelpDesk.";
    await saveSession(event, (next) => appendSessionMessage(next, "assistant", reply));
    await sendZaloBotMessage(event.chatId, reply, callbacks.fetchImpl);
    return { responseType: "need_issue_description" };
  }

  if (manualTicket || session.attempts >= config.zaloBotMaxSelfServiceAttempts) {
    const issue = compact(priorIssueText || event.text, 5000);
    return createEscalation(event, user, session, {
      summary: issue,
      reason: manualTicket ? "Người dùng yêu cầu chuyển HelpDesk" : "Đã đạt giới hạn tự xử lý của Zalo Bot",
      escalationCode: manualTicket ? "zalo_bot_manual_ticket" : "zalo_bot_attempt_limit",
    }, callbacks);
  }

  db = await readDb();
  const combinedDescription = compact([priorIssueText, event.text].filter(Boolean).join("\n"), 5000);
  const analysis = await analyzeZaloBotIssue({ title: event.text, description: combinedDescription }, session, db);
  if (!analysis.canAutoHandle) return createEscalation(event, user, session, analysis, callbacks);

  const reply = guidanceText(analysis);
  await saveSession(event, (next) => {
    appendSessionMessage(next, "user", event.text, event.receivedAt);
    appendSessionMessage(next, "assistant", reply);
    next.attempts += 1;
  });
  await sendZaloBotMessage(event.chatId, reply, callbacks.fetchImpl);
  return { responseType: analysis.botMode === "playbook" ? "playbook_guidance" : "generative_guidance" };
}

async function markInbox(inboxId, action, detail = {}) {
  return updateDb((db) => {
    const entry = db.auditLog.find((item) => item.id === inboxId && BOT_INBOX_ACTIONS.has(item.action));
    if (!entry) return null;
    entry.action = action;
    entry.detail = { ...(entry.detail || {}), ...detail, updatedAt: nowIso() };
    return structuredClone(entry);
  });
}

async function processInbox(inboxId, callbacks) {
  const claimed = await markInbox(inboxId, BOT_INBOX_PROCESSING, { processingStartedAt: nowIso() });
  if (!claimed) return null;
  const event = claimed.detail?.event;
  if (!event) throw new Error("Zalo Bot inbox event is missing");
  const result = await processTextMessage(event, callbacks);
  await markInbox(inboxId, BOT_INBOX_COMPLETED, { completedAt: nowIso(), result, lastError: null });
  return result;
}

function scheduleInbox(inboxId, callbacks) {
  const task = processingQueue.then(() => processInbox(inboxId, callbacks));
  const guarded = task.catch(async (error) => {
    await markInbox(inboxId, BOT_INBOX_FAILED, { failedAt: nowIso(), lastError: publicError(error) }).catch(() => undefined);
    console.error(`[ZALO BOT] Inbox ${inboxId} failed: ${publicError(error)}`);
    return null;
  });
  processingQueue = guarded;
  return guarded;
}

export async function enqueueZaloBotWebhook(payload, providedSecret, callbacks = {}) {
  ensureConfigured();
  if (!verifyZaloBotWebhookSecret(providedSecret)) {
    throw Object.assign(new Error("Zalo Bot webhook secret is invalid"), { status: 401, code: "ZALO_BOT_SECRET_INVALID" });
  }
  const verificationEnvelope = payload?.result && typeof payload.result === "object"
    ? payload.result
    : payload?.data && typeof payload.data === "object"
      ? payload.data
      : payload;
  if (!verificationEnvelope?.event_name && !verificationEnvelope?.eventName && !verificationEnvelope?.event) {
    return { accepted: true, queued: false, duplicate: false, verification: true };
  }
  const event = normalizeZaloBotEvent(payload);
  const accepted = await updateDb((db) => {
    const existing = db.auditLog.find((entry) => (
      BOT_INBOX_ACTIONS.has(entry.action)
      && entry.entityType === "zalo_bot_message"
      && String(entry.entityId) === event.externalMessageId
    ));
    if (existing) {
      if (existing.action === BOT_INBOX_FAILED) {
        existing.action = BOT_INBOX_PENDING;
        existing.detail = { ...(existing.detail || {}), event, retryRequestedAt: nowIso(), lastError: null };
        return { inboxId: existing.id, duplicate: false, retry: true };
      }
      return { inboxId: existing.id, duplicate: true, retry: false };
    }
    const entry = addAudit(db, {
      id: id("zbot_inbox"),
      actor: "zalo-bot",
      action: BOT_INBOX_PENDING,
      entityType: "zalo_bot_message",
      entityId: event.externalMessageId,
      detail: { event, acceptedAt: nowIso() },
      createdAt: nowIso(),
    });
    return { inboxId: entry.id, duplicate: false, retry: false };
  });
  if (!accepted.duplicate) scheduleInbox(accepted.inboxId, callbacks);
  return { accepted: true, queued: !accepted.duplicate, duplicate: accepted.duplicate, inboxId: accepted.inboxId };
}

export async function recoverZaloBotQueue(callbacks = {}) {
  if (!config.zaloBotEnabled || !config.zaloBotToken || !config.zaloBotWebhookSecret) return { recovered: 0 };
  const db = await readDb();
  const pending = db.auditLog
    .filter((entry) => [BOT_INBOX_PENDING, BOT_INBOX_PROCESSING, BOT_INBOX_FAILED].includes(entry.action))
    .slice(0, MAX_INBOX_RECOVERY);
  for (const entry of pending) scheduleInbox(entry.id, callbacks);
  return { recovered: pending.length };
}

export async function flushZaloBotQueueForTest() {
  await processingQueue;
}

export function zaloBotStatus() {
  return {
    endpoint: "/api/webhooks/zalo-bot",
    enabled: config.zaloBotEnabled,
    configured: Boolean(config.zaloBotEnabled && config.zaloBotToken && config.zaloBotWebhookSecret),
    generativeFallback: config.zaloBotGenerativeFallback,
    manualTicket: true,
    autoCreateOnFailure: true,
    autoCreateOnNoPlaybook: false,
    maxSelfServiceAttempts: config.zaloBotMaxSelfServiceAttempts,
    webhookRegistration: structuredClone(webhookRegistration),
    supportedEvents: ["message.text.received"],
    supportedChatTypes: ["PRIVATE"],
  };
}

export const ZALO_BOT_AUDIT_ACTIONS = Object.freeze({
  inboxPending: BOT_INBOX_PENDING,
  inboxProcessing: BOT_INBOX_PROCESSING,
  inboxCompleted: BOT_INBOX_COMPLETED,
  inboxFailed: BOT_INBOX_FAILED,
  session: BOT_SESSION,
});
