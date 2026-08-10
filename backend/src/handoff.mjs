const HANDOFF_REASON_LIMIT = 100;
const ACTOR_ID_LIMIT = 64;
const ACTOR_NAME_LIMIT = 200;

function compact(value, limit) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function normalizeIntentText(value) {
  return compact(value, 2000)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d");
}

export function analysisRequiresHumanHandoff(analysis) {
  if (!analysis || typeof analysis !== "object") return false;
  return analysis.escalated === true
    || analysis.outcome === "escalate"
    || analysis.canAutoHandle === false;
}

export function hasStaffJoinedConversation(messages = []) {
  return Array.isArray(messages) && messages.some((message) => message?.role === "technician");
}

export function isHumanHandoffLocked(ticket, messages = []) {
  if (!ticket || typeof ticket !== "object") return false;
  return ticket.aiHandoffLocked === true
    || analysisRequiresHumanHandoff(ticket.aiAnalysis)
    || Boolean(ticket.assignedTo)
    || hasStaffJoinedConversation(messages);
}

export function shouldAgentParticipate(ticket, messages = []) {
  return !isHumanHandoffLocked(ticket, messages);
}

export function messageRequestsHumanHandoff(message) {
  const text = normalizeIntentText(message);
  if (!text) return false;
  return [
    /\b(khong|chua) (xu ly|khac phuc|lam) duoc\b/,
    /\bvan (khong|chua) (duoc|het loi|xu ly duoc|khac phuc duoc)\b/,
    /\bda thu.{0,120}\bnhung (van )?(khong|chua) (duoc|thanh cong|het loi)\b/,
    /\b(khong|chua) thanh cong\b/,
    /\b(chuyen|gui) (han )?(cho |sang )?(helpdesk|ky thuat vien|nhan vien ky thuat)\b/,
    /\b(can|nho) (helpdesk|ky thuat vien|nhan vien ky thuat) (ho tro|kiem tra|xu ly)\b/,
  ].some((pattern) => pattern.test(text));
}

export function lockHumanHandoff(ticket, {
  at = new Date().toISOString(),
  reason = "human_handoff",
  actorId = "system",
  actorName = "Hệ thống HelpDesk",
} = {}) {
  if (!ticket || typeof ticket !== "object") throw new TypeError("ticket is required");
  if (ticket.aiHandoffLocked === true) return false;

  ticket.aiHandoffLocked = true;
  ticket.aiHandoffAt = at;
  ticket.aiHandoffReason = compact(reason, HANDOFF_REASON_LIMIT) || "human_handoff";
  ticket.aiHandoffBy = compact(actorId, ACTOR_ID_LIMIT) || "system";
  ticket.aiHandoffByName = compact(actorName, ACTOR_NAME_LIMIT) || "Hệ thống HelpDesk";
  return true;
}

export function publicHumanHandoff(ticket, messages = []) {
  const locked = isHumanHandoffLocked(ticket, messages);
  return {
    locked,
    aiParticipationAllowed: !locked,
    at: ticket?.aiHandoffAt || null,
    reason: ticket?.aiHandoffReason || (analysisRequiresHumanHandoff(ticket?.aiAnalysis) ? ticket?.aiAnalysis?.escalationCode || "ai_escalation" : null),
    by: ticket?.aiHandoffBy || null,
    byName: ticket?.aiHandoffByName || null,
  };
}

export function statusAfterHumanReply(status) {
  return status === "waiting_user" ? "in_progress" : status;
}

export function statusAfterUserHandoff(status) {
  return status === "waiting_user" ? "open" : status;
}
