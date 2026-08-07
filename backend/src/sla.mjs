import { config } from "./config.mjs";

const DEFAULTS = {
  low: { firstResponseMinutes: 480, resolutionMinutes: 4320 },
  normal: { firstResponseMinutes: 240, resolutionMinutes: 1440 },
  high: { firstResponseMinutes: 120, resolutionMinutes: 480 },
  urgent: { firstResponseMinutes: 30, resolutionMinutes: 240 },
};

const formatterCache = new Map();

function envPolicy(priority) {
  return {
    firstResponseMinutes: config.sla?.[priority]?.firstResponseMinutes ?? DEFAULTS[priority]?.firstResponseMinutes ?? DEFAULTS.normal.firstResponseMinutes,
    resolutionMinutes: config.sla?.[priority]?.resolutionMinutes ?? DEFAULTS[priority]?.resolutionMinutes ?? DEFAULTS.normal.resolutionMinutes,
  };
}

export function businessCalendar() {
  const configuredStart = config.slaBusiness?.startMinute ?? 8 * 60;
  const configuredEnd = config.slaBusiness?.endMinute ?? 17 * 60 + 30;
  const validWindow = configuredEnd > configuredStart;
  return {
    timeZone: config.slaBusiness?.timeZone || "Asia/Ho_Chi_Minh",
    workDays: config.slaBusiness?.workDays || [1, 2, 3, 4, 5],
    startMinute: validWindow ? configuredStart : 8 * 60,
    endMinute: validWindow ? configuredEnd : 17 * 60 + 30,
    holidays: config.slaBusiness?.holidays || [],
  };
}

function formatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat("en-CA", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }));
  }
  return formatterCache.get(timeZone);
}

function localParts(value, calendar = businessCalendar()) {
  const parts = Object.fromEntries(formatter(calendar.timeZone).formatToParts(new Date(value)).map((item) => [item.type, item.value]));
  const weekDay = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  return {
    weekDay,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function isBusinessMinute(value, calendar = businessCalendar()) {
  const local = localParts(value, calendar);
  return calendar.workDays.includes(local.weekDay)
    && !calendar.holidays.includes(local.date)
    && local.minute >= calendar.startMinute
    && local.minute < calendar.endMinute;
}

export function addBusinessMinutes(value, minutes, calendar = businessCalendar()) {
  let cursor = new Date(value).getTime();
  let remaining = Math.max(0, Math.ceil(Number(minutes) || 0));
  let guard = 0;
  while (remaining > 0) {
    const local = localParts(cursor, calendar);
    const workingDay = calendar.workDays.includes(local.weekDay) && !calendar.holidays.includes(local.date);
    if (workingDay && local.minute >= calendar.startMinute && local.minute < calendar.endMinute) {
      const take = Math.min(remaining, calendar.endMinute - local.minute);
      cursor += take * 60_000;
      remaining -= take;
    } else if (workingDay && local.minute < calendar.startMinute) {
      cursor += Math.max(1, calendar.startMinute - local.minute) * 60_000;
    } else {
      cursor += 60 * 60_000;
    }
    guard += 1;
    if (guard > 100_000) throw new Error("SLA business calendar exceeded safety limit");
  }
  return new Date(cursor).toISOString();
}

export function businessMinutesBetween(start, end, calendar = businessCalendar()) {
  let cursor = new Date(start).getTime();
  const until = new Date(end).getTime();
  if (!Number.isFinite(cursor) || !Number.isFinite(until) || until <= cursor) return 0;
  let minutes = 0;
  let guard = 0;
  while (cursor < until) {
    const local = localParts(cursor, calendar);
    const workingDay = calendar.workDays.includes(local.weekDay) && !calendar.holidays.includes(local.date);
    if (workingDay && local.minute >= calendar.startMinute && local.minute < calendar.endMinute) {
      const available = (calendar.endMinute - local.minute) * 60_000;
      const span = Math.min(until - cursor, available);
      minutes += Math.ceil(span / 60_000);
      cursor += span;
    } else if (workingDay && local.minute < calendar.startMinute) {
      cursor += Math.min(until - cursor, Math.max(1, calendar.startMinute - local.minute) * 60_000);
    } else {
      cursor += Math.min(until - cursor, 60 * 60_000);
    }
    guard += 1;
    if (guard > 100_000) break;
  }
  return minutes;
}

function milestoneAt(start, total, ratio) {
  return addBusinessMinutes(start, Math.max(1, Math.round(total * ratio)));
}

function baseSla(priority, startedAt) {
  const policy = envPolicy(priority);
  return {
    version: "business-hours-v1",
    calendar: businessCalendar(),
    startedAt,
    priority,
    firstResponseMinutes: policy.firstResponseMinutes,
    resolutionMinutes: policy.resolutionMinutes,
    firstResponseDueAt: addBusinessMinutes(startedAt, policy.firstResponseMinutes),
    resolutionDueAt: addBusinessMinutes(startedAt, policy.resolutionMinutes),
    firstResponseWarn70At: milestoneAt(startedAt, policy.firstResponseMinutes, 0.7),
    firstResponseWarn90At: milestoneAt(startedAt, policy.firstResponseMinutes, 0.9),
    resolutionWarn70At: milestoneAt(startedAt, policy.resolutionMinutes, 0.7),
    resolutionWarn90At: milestoneAt(startedAt, policy.resolutionMinutes, 0.9),
    firstRespondedAt: null,
    firstResponseBreachedAt: null,
    resolutionBreachedAt: null,
    firstResponseWarned70At: null,
    firstResponseWarned90At: null,
    resolutionWarned70At: null,
    resolutionWarned90At: null,
    escalatedAt: null,
    pausedAt: null,
    pauseReason: "",
    pausedBy: "",
    pausedByName: "",
    pauseEvents: [],
    firstResponseRemainingMinutes: null,
    resolutionRemainingMinutes: null,
    lastReminderAt: null,
  };
}

export function createSla(priority, createdAt) {
  return baseSla(priority, createdAt);
}

function copyState(target, source) {
  for (const key of ["firstRespondedAt", "firstResponseBreachedAt", "resolutionBreachedAt", "firstResponseWarned70At", "firstResponseWarned90At", "resolutionWarned70At", "resolutionWarned90At", "escalatedAt", "lastReminderAt"]) {
    target[key] = source?.[key] || null;
  }
  target.pauseEvents = Array.isArray(source?.pauseEvents) ? structuredClone(source.pauseEvents) : [];
  return target;
}

export function recalculateSla(ticket, priority = ticket.priority, at = new Date().toISOString()) {
  const current = ensureSla(ticket);
  const elapsedFirst = Math.max(0, current.firstResponseMinutes - businessMinutesBetween(at, current.firstResponseDueAt));
  const elapsedResolution = Math.max(0, current.resolutionMinutes - businessMinutesBetween(at, current.resolutionDueAt));
  const next = copyState(baseSla(priority, current.startedAt || ticket.createdAt), current);
  const policy = envPolicy(priority);
  const firstRemaining = Math.max(0, policy.firstResponseMinutes - elapsedFirst);
  const resolutionRemaining = Math.max(0, policy.resolutionMinutes - elapsedResolution);
  next.firstResponseDueAt = addBusinessMinutes(at, firstRemaining);
  next.resolutionDueAt = addBusinessMinutes(at, resolutionRemaining);
  next.firstResponseWarn70At = addBusinessMinutes(at, Math.max(0, firstRemaining - Math.round(policy.firstResponseMinutes * 0.3)));
  next.firstResponseWarn90At = addBusinessMinutes(at, Math.max(0, firstRemaining - Math.round(policy.firstResponseMinutes * 0.1)));
  next.resolutionWarn70At = addBusinessMinutes(at, Math.max(0, resolutionRemaining - Math.round(policy.resolutionMinutes * 0.3)));
  next.resolutionWarn90At = addBusinessMinutes(at, Math.max(0, resolutionRemaining - Math.round(policy.resolutionMinutes * 0.1)));
  ticket.sla = next;
  if (current.pausedAt) pauseSla(ticket, current.pausedAt, current.pauseReason, { id: current.pausedBy, name: current.pausedByName });
  return ticket.sla;
}

export function ensureSla(ticket) {
  if (!ticket.sla) ticket.sla = createSla(ticket.priority || "normal", ticket.createdAt);
  if (ticket.sla.version !== "business-hours-v1") {
    const legacy = ticket.sla;
    ticket.sla = copyState(baseSla(ticket.priority || legacy.priority || "normal", legacy.startedAt || ticket.createdAt), legacy);
  }
  return ticket.sla;
}

export function markFirstResponse(ticket, at = new Date().toISOString()) {
  const sla = ensureSla(ticket);
  if (!sla.firstRespondedAt) sla.firstRespondedAt = at;
  return sla;
}

export function pauseSla(ticket, at = new Date().toISOString(), reason = "waiting_user", actor = {}) {
  const sla = ensureSla(ticket);
  if (sla.pausedAt) return sla;
  sla.pausedAt = at;
  sla.pauseReason = String(reason || "waiting_user").slice(0, 100);
  sla.pausedBy = actor.id || "system";
  sla.pausedByName = actor.name || "Hệ thống HelpDesk";
  sla.firstResponseRemainingMinutes = sla.firstRespondedAt ? 0 : businessMinutesBetween(at, sla.firstResponseDueAt);
  sla.resolutionRemainingMinutes = businessMinutesBetween(at, sla.resolutionDueAt);
  sla.pauseEvents ||= [];
  sla.pauseEvents.push({ pausedAt: at, resumedAt: null, reason: sla.pauseReason, actorId: sla.pausedBy, actorName: sla.pausedByName });
  return sla;
}

function resumedMilestone(at, remaining, total, ratio) {
  const thresholdRemaining = Math.round(total * (1 - ratio));
  return addBusinessMinutes(at, Math.max(0, remaining - thresholdRemaining));
}

export function resumeSla(ticket, at = new Date().toISOString(), reason = "client_replied", actor = {}) {
  const sla = ensureSla(ticket);
  if (!sla.pausedAt) return sla;
  const firstRemaining = Math.max(0, Number(sla.firstResponseRemainingMinutes ?? businessMinutesBetween(at, sla.firstResponseDueAt)));
  const resolutionRemaining = Math.max(0, Number(sla.resolutionRemainingMinutes ?? businessMinutesBetween(at, sla.resolutionDueAt)));
  if (!sla.firstRespondedAt) {
    sla.firstResponseDueAt = addBusinessMinutes(at, firstRemaining);
    sla.firstResponseWarn70At = resumedMilestone(at, firstRemaining, sla.firstResponseMinutes, 0.7);
    sla.firstResponseWarn90At = resumedMilestone(at, firstRemaining, sla.firstResponseMinutes, 0.9);
  }
  sla.resolutionDueAt = addBusinessMinutes(at, resolutionRemaining);
  sla.resolutionWarn70At = resumedMilestone(at, resolutionRemaining, sla.resolutionMinutes, 0.7);
  sla.resolutionWarn90At = resumedMilestone(at, resolutionRemaining, sla.resolutionMinutes, 0.9);
  const event = [...(sla.pauseEvents || [])].reverse().find((item) => !item.resumedAt);
  if (event) {
    event.resumedAt = at;
    event.resumeReason = String(reason || "client_replied").slice(0, 100);
    event.resumedBy = actor.id || "system";
    event.resumedByName = actor.name || "Hệ thống HelpDesk";
  }
  sla.pausedAt = null;
  sla.pauseReason = "";
  sla.pausedBy = "";
  sla.pausedByName = "";
  sla.firstResponseRemainingMinutes = null;
  sla.resolutionRemainingMinutes = null;
  return sla;
}

export function syncSlaForStatus(ticket, oldStatus, at = new Date().toISOString(), actor = {}) {
  if (ticket.status === "waiting_user" && oldStatus !== "waiting_user") return pauseSla(ticket, at, "waiting_user", actor);
  if (oldStatus === "waiting_user" && ticket.status !== "waiting_user") return resumeSla(ticket, at, "client_replied_or_status_changed", actor);
  return ensureSla(ticket);
}

function phaseState({ complete, active, paused, now, dueAt, warn70At, warn90At }) {
  if (complete || !active) return "completed";
  if (paused) return "paused";
  if (now > new Date(dueAt).getTime()) return "overdue";
  if (now >= new Date(warn70At).getTime() || now >= new Date(warn90At).getTime()) return "at_risk";
  return "on_track";
}

export function publicSla(ticket, now = Date.now()) {
  const sla = ensureSla(ticket);
  const active = !["resolved", "closed"].includes(ticket.status);
  const paused = Boolean(sla.pausedAt);
  const firstResponseOverdue = active && !paused && !sla.firstRespondedAt && now > new Date(sla.firstResponseDueAt).getTime();
  const resolutionOverdue = active && !paused && now > new Date(sla.resolutionDueAt).getTime();
  const firstResponseState = phaseState({ complete: Boolean(sla.firstRespondedAt), active, paused, now, dueAt: sla.firstResponseDueAt, warn70At: sla.firstResponseWarn70At, warn90At: sla.firstResponseWarn90At });
  const resolutionState = phaseState({ complete: !active, active, paused, now, dueAt: sla.resolutionDueAt, warn70At: sla.resolutionWarn70At, warn90At: sla.resolutionWarn90At });
  const state = paused ? "paused" : (firstResponseOverdue || resolutionOverdue) ? "overdue" : [firstResponseState, resolutionState].includes("at_risk") ? "at_risk" : active ? "on_track" : "completed";
  return { ...sla, paused, state, firstResponseState, resolutionState, firstResponseOverdue, resolutionOverdue, overdue: firstResponseOverdue || resolutionOverdue };
}

export function slaActiveMinutesBetween(sla = {}, start, end) {
  let total = businessMinutesBetween(start, end, sla.calendar || businessCalendar());
  for (const event of sla.pauseEvents || []) {
    const pauseStart = event.pausedAt;
    const pauseEnd = event.resumedAt || end;
    if (!pauseStart || new Date(pauseStart) >= new Date(end)) continue;
    total -= businessMinutesBetween(new Date(pauseStart) < new Date(start) ? start : pauseStart, new Date(pauseEnd) > new Date(end) ? end : pauseEnd, sla.calendar || businessCalendar());
  }
  return Math.max(0, total);
}

export function slaLabel(priority) {
  const policy = envPolicy(priority);
  return `${policy.firstResponseMinutes} phút phản hồi / ${policy.resolutionMinutes} phút xử lý trong giờ làm việc`;
}
