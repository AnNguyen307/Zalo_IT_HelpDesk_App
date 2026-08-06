import { config } from "./config.mjs";

const DEFAULTS = {
  low: { firstResponseMinutes: 480, resolutionMinutes: 4320 },
  normal: { firstResponseMinutes: 240, resolutionMinutes: 1440 },
  high: { firstResponseMinutes: 120, resolutionMinutes: 480 },
  urgent: { firstResponseMinutes: 30, resolutionMinutes: 240 },
};

function envPolicy(priority) {
  const key = priority.toUpperCase();
  return {
    firstResponseMinutes: config.sla?.[priority]?.firstResponseMinutes
      ?? DEFAULTS[priority]?.firstResponseMinutes
      ?? DEFAULTS.normal.firstResponseMinutes,
    resolutionMinutes: config.sla?.[priority]?.resolutionMinutes
      ?? DEFAULTS[priority]?.resolutionMinutes
      ?? DEFAULTS.normal.resolutionMinutes,
  };
}

function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function createSla(priority, createdAt) {
  const policy = envPolicy(priority);
  return {
    startedAt: createdAt,
    priority,
    firstResponseMinutes: policy.firstResponseMinutes,
    resolutionMinutes: policy.resolutionMinutes,
    firstResponseDueAt: addMinutes(createdAt, policy.firstResponseMinutes),
    resolutionDueAt: addMinutes(createdAt, policy.resolutionMinutes),
    firstRespondedAt: null,
    firstResponseBreachedAt: null,
    resolutionBreachedAt: null,
    lastReminderAt: null,
  };
}

export function recalculateSla(ticket, priority = ticket.priority) {
  const current = ticket.sla || createSla(priority, ticket.createdAt);
  const next = createSla(priority, current.startedAt || ticket.createdAt);
  next.firstRespondedAt = current.firstRespondedAt || null;
  next.firstResponseBreachedAt = current.firstResponseBreachedAt || null;
  next.resolutionBreachedAt = current.resolutionBreachedAt || null;
  next.lastReminderAt = current.lastReminderAt || null;
  ticket.sla = next;
  return ticket.sla;
}

export function ensureSla(ticket) {
  if (!ticket.sla) ticket.sla = createSla(ticket.priority || "normal", ticket.createdAt);
  return ticket.sla;
}

export function markFirstResponse(ticket, at = new Date().toISOString()) {
  const sla = ensureSla(ticket);
  if (!sla.firstRespondedAt) sla.firstRespondedAt = at;
  return sla;
}

export function publicSla(ticket, now = Date.now()) {
  const sla = ensureSla(ticket);
  const active = !["resolved", "closed"].includes(ticket.status);
  const firstResponseOverdue = !sla.firstRespondedAt && now > new Date(sla.firstResponseDueAt).getTime();
  const resolutionOverdue = active && now > new Date(sla.resolutionDueAt).getTime();
  return {
    ...sla,
    firstResponseOverdue,
    resolutionOverdue,
    overdue: firstResponseOverdue || resolutionOverdue,
  };
}

export function slaLabel(priority) {
  const policy = envPolicy(priority);
  return `${policy.firstResponseMinutes} phút phản hồi đầu tiên / ${policy.resolutionMinutes} phút xử lý`;
}
