import { businessMinutesBetween, publicSla, slaActiveMinutesBetween } from "./sla.mjs";

const ACTIVE_STATUSES = new Set(["open", "waiting_user", "in_progress"]);

function latestAt(messages, ticketId, roles) {
  return messages
    .filter((item) => item.ticketId === ticketId && roles.includes(item.role))
    .reduce((latest, item) => !latest || item.createdAt > latest ? item.createdAt : latest, "");
}

export function clientReplyPending(ticket, messages = []) {
  if (!ACTIVE_STATUSES.has(ticket.status)) return false;
  const userAt = latestAt(messages, ticket.id, ["user"]);
  const staffAt = latestAt(messages, ticket.id, ["technician"]);
  return Boolean(userAt && staffAt && userAt > staffAt);
}

export function matchesSmartQueue(ticket, queue, session, messages = [], now = Date.now()) {
  if (!queue || queue === "all") return true;
  const sla = publicSla(ticket, now);
  if (queue === "mine") return ticket.assignedToId === session.sub || (!ticket.assignedToId && ticket.assignedTo === session.name);
  if (queue === "unassigned") return ACTIVE_STATUSES.has(ticket.status) && !ticket.assignedToId && !ticket.assignedTo;
  if (queue === "sla_risk") return ACTIVE_STATUSES.has(ticket.status) && sla.state === "at_risk";
  if (queue === "overdue") return ACTIVE_STATUSES.has(ticket.status) && sla.overdue;
  if (queue === "waiting_user") return ticket.status === "waiting_user";
  if (queue === "client_replied") return clientReplyPending(ticket, messages);
  if (queue === "reopened") return ACTIVE_STATUSES.has(ticket.status) && Number(ticket.reopenCount || 0) > 0;
  return true;
}

export function smartQueueCounts(tickets, session, messages = [], now = Date.now()) {
  const queues = ["all", "mine", "unassigned", "sla_risk", "overdue", "waiting_user", "client_replied", "reopened"];
  return Object.fromEntries(queues.map((queue) => [queue, tickets.filter((ticket) => matchesSmartQueue(ticket, queue, session, messages, now)).length]));
}

function average(values) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : null;
}

function dateKey(value) {
  return String(value || "").slice(0, 10);
}

export function buildOperationsReport(db, { days = 30, now = new Date() } = {}) {
  const end = new Date(now);
  const start = new Date(end.getTime() - Math.max(1, Number(days)) * 86_400_000);
  const tickets = db.tickets.filter((ticket) => new Date(ticket.createdAt) >= start && new Date(ticket.createdAt) <= end);
  const resolved = tickets.filter((ticket) => ticket.resolvedAt);
  const firstResponseMinutes = tickets
    .filter((ticket) => ticket.sla?.firstRespondedAt)
    .map((ticket) => slaActiveMinutesBetween(ticket.sla, ticket.sla.startedAt || ticket.createdAt, ticket.sla.firstRespondedAt));
  const resolutionMinutes = resolved.map((ticket) => slaActiveMinutesBetween(ticket.sla || {}, ticket.sla?.startedAt || ticket.createdAt, ticket.resolvedAt));
  const scores = tickets.map((ticket) => ticket.satisfaction?.score).filter(Number.isFinite);
  const slaMeasured = tickets.filter((ticket) => ticket.resolvedAt || ticket.sla?.firstResponseBreachedAt || ticket.sla?.resolutionBreachedAt);
  const slaMet = slaMeasured.filter((ticket) => ticket.resolvedAt && !ticket.sla?.firstResponseBreachedAt && !ticket.sla?.resolutionBreachedAt).length;
  const reopened = tickets.filter((ticket) => Number(ticket.reopenCount || 0) > 0).length;

  const byCategory = {};
  const byDepartment = {};
  const byTechnician = {};
  for (const ticket of tickets) {
    byCategory[ticket.category || "other"] = (byCategory[ticket.category || "other"] || 0) + 1;
    const user = db.users.find((item) => item.id === ticket.userId);
    const department = user?.department || "Chưa xác định";
    byDepartment[department] = (byDepartment[department] || 0) + 1;
    const technician = ticket.assignedTo || "Chưa phân công";
    const bucket = byTechnician[technician] ||= { assigned: 0, resolved: 0, slaMeasured: 0, slaMet: 0, satisfactionTotal: 0, satisfactionCount: 0 };
    bucket.assigned += 1;
    if (ticket.resolvedAt) bucket.resolved += 1;
    if (ticket.resolvedAt || ticket.sla?.firstResponseBreachedAt || ticket.sla?.resolutionBreachedAt) {
      bucket.slaMeasured += 1;
      if (ticket.resolvedAt && !ticket.sla?.firstResponseBreachedAt && !ticket.sla?.resolutionBreachedAt) bucket.slaMet += 1;
    }
    if (Number.isFinite(ticket.satisfaction?.score)) {
      bucket.satisfactionTotal += ticket.satisfaction.score;
      bucket.satisfactionCount += 1;
    }
  }

  const trend = [];
  for (let index = Math.min(13, Math.max(0, days - 1)); index >= 0; index -= 1) {
    const day = new Date(end.getTime() - index * 86_400_000).toISOString().slice(0, 10);
    trend.push({
      date: day,
      created: tickets.filter((ticket) => dateKey(ticket.createdAt) === day).length,
      resolved: tickets.filter((ticket) => dateKey(ticket.resolvedAt) === day).length,
    });
  }

  return {
    period: { days, from: start.toISOString(), to: end.toISOString() },
    summary: {
      total: tickets.length,
      active: tickets.filter((ticket) => ACTIVE_STATUSES.has(ticket.status)).length,
      averageFirstResponseMinutes: average(firstResponseMinutes),
      averageResolutionMinutes: average(resolutionMinutes),
      slaComplianceRate: slaMeasured.length ? Number((slaMet * 100 / slaMeasured.length).toFixed(1)) : null,
      reopenRate: tickets.length ? Number((reopened * 100 / tickets.length).toFixed(1)) : null,
      averageSatisfaction: average(scores),
      satisfactionCoverage: resolved.length ? Number((scores.length * 100 / resolved.length).toFixed(1)) : null,
    },
    byCategory,
    byDepartment,
    byTechnician: Object.entries(byTechnician).map(([name, value]) => ({
      name,
      assigned: value.assigned,
      resolved: value.resolved,
      slaRate: value.slaMeasured ? Number((value.slaMet * 100 / value.slaMeasured).toFixed(1)) : null,
      satisfaction: value.satisfactionCount ? Number((value.satisfactionTotal / value.satisfactionCount).toFixed(1)) : null,
    })).sort((a, b) => b.assigned - a.assigned),
    trend,
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function ticketsCsv(db, tickets = db.tickets) {
  const header = ["Mã ticket", "Tiêu đề", "Trạng thái", "Ưu tiên", "Danh mục", "Người yêu cầu", "Phòng ban", "Kỹ thuật viên", "Tạo lúc", "Phản hồi đầu", "Xử lý lúc", "SLA", "Mở lại", "CSAT"];
  const rows = tickets.map((ticket) => {
    const requester = db.users.find((item) => item.id === ticket.userId);
    const sla = publicSla(ticket);
    return [ticket.code, ticket.title, ticket.status, ticket.priority, ticket.category, requester?.name || "", requester?.department || "", ticket.assignedTo || "", ticket.createdAt, ticket.sla?.firstRespondedAt || "", ticket.resolvedAt || "", sla.state, ticket.reopenCount || 0, ticket.satisfaction?.score || ""];
  });
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export { businessMinutesBetween };
