import { config } from "./config.mjs";
import { id, nowIso } from "./utils.mjs";

const REVIEW_RESULTS = ["correct", "incorrect"];
const CATEGORIES = ["network", "printer", "windows", "office", "account", "software", "hardware", "other"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const RISKS = ["low", "medium", "high"];
const OUTCOMES = ["need_info", "guide_user", "escalate", "likely_resolved"];

function providerFromAnalysis(analysis = {}) {
  if (analysis.providerTelemetry?.provider) return analysis.providerTelemetry.provider;
  const source = String(analysis.source || "");
  if (source.startsWith("gemini")) return "gemini-cloud";
  if (source.startsWith("ollama")) return "ollama-local";
  return "rules-local";
}

function decisionStatus(analysis = {}) {
  if (analysis.escalationCode === "agent_unavailable") return "unavailable";
  if (analysis.canAutoHandle) return "guided";
  return "escalated";
}

function proposalFromAnalysis(analysis = {}) {
  return {
    category: analysis.category || "other",
    priority: analysis.priority || "normal",
    priorityDetermined: Boolean(analysis.priorityDetermined),
    risk: analysis.risk || "low",
    outcome: analysis.outcome || "escalate",
    canAutoHandle: Boolean(analysis.canAutoHandle),
    confidence: Number(analysis.confidence || 0),
    escalationCode: analysis.escalationCode || null,
  };
}

export function createAiDecisionRecord(analysis, { trigger = "unknown" } = {}) {
  if (!analysis || typeof analysis !== "object") return analysis;
  const provider = providerFromAnalysis(analysis);
  const telemetry = analysis.providerTelemetry || {};
  return {
    ...analysis,
    quality: {
      schemaVersion: 1,
      decisionId: id("aid"),
      trigger: String(trigger || "unknown").slice(0, 40),
      generatedAt: analysis.generatedAt || nowIso(),
      status: decisionStatus(analysis),
      provider,
      dataBoundary: telemetry.dataBoundary || (provider.endsWith("cloud") ? "external" : "local"),
      model: analysis.model || telemetry.model || null,
      latencyMs: Number(analysis.latencyMs || telemetry.latencyMs || 0),
      router: telemetry.router || null,
      routingPolicy: telemetry.routingPolicy || null,
      attempts: Array.isArray(telemetry.attempts) ? structuredClone(telemetry.attempts).slice(0, 20) : [],
      redaction: telemetry.redaction || { applied: false, replacementCount: 0, replacementsByType: {} },
      usage: telemetry.usage || null,
      proposal: proposalFromAnalysis(analysis),
      review: null,
    },
  };
}

export function aiDecisionAuditDetail(analysis) {
  const quality = analysis?.quality;
  if (!quality?.decisionId) return null;
  return {
    decision: structuredClone(quality),
    source: analysis.source || "",
    playbookIds: Array.isArray(analysis.playbookIds) ? analysis.playbookIds.slice(0, 5) : [],
  };
}

export function validateAiReview(body = {}, session = {}) {
  const result = String(body.result || "").trim().toLowerCase();
  if (!REVIEW_RESULTS.includes(result)) throw Object.assign(new Error("Đánh giá AI phải là correct hoặc incorrect"), { status: 400 });
  const decisionId = String(body.decisionId || "").trim();
  if (!decisionId) throw Object.assign(new Error("Thiếu decisionId của quyết định AI"), { status: 400 });
  const input = body.corrections && typeof body.corrections === "object" ? body.corrections : {};
  const corrections = {};
  if (input.category !== undefined) {
    if (!CATEGORIES.includes(input.category)) throw Object.assign(new Error("Danh mục hiệu chỉnh không hợp lệ"), { status: 400 });
    corrections.category = input.category;
  }
  if (input.priority !== undefined) {
    if (!PRIORITIES.includes(input.priority)) throw Object.assign(new Error("Ưu tiên hiệu chỉnh không hợp lệ"), { status: 400 });
    corrections.priority = input.priority;
  }
  if (input.risk !== undefined) {
    if (!RISKS.includes(input.risk)) throw Object.assign(new Error("Rủi ro hiệu chỉnh không hợp lệ"), { status: 400 });
    corrections.risk = input.risk;
  }
  if (input.outcome !== undefined) {
    if (!OUTCOMES.includes(input.outcome)) throw Object.assign(new Error("Kết quả hiệu chỉnh không hợp lệ"), { status: 400 });
    corrections.outcome = input.outcome;
  }
  const note = String(body.note || "").trim().slice(0, 1000);
  if (result === "incorrect" && !note && !Object.keys(corrections).length) {
    throw Object.assign(new Error("Đánh giá Cần sửa phải có nội dung hiệu chỉnh hoặc ghi chú"), { status: 400 });
  }
  return {
    decisionId,
    result,
    corrections,
    applyToTicket: result === "incorrect" && body.applyToTicket !== false,
    note,
    reviewedAt: nowIso(),
    reviewedBy: session.sub || "",
    reviewedByName: session.name || "Admin",
  };
}

function collectDecisions(db) {
  const decisions = new Map();
  const ticketById = new Map((db.tickets || []).map((ticket) => [ticket.id, ticket]));
  for (const entry of db.auditLog || []) {
    if (entry.action !== "ai_decision" || !entry.detail?.decision?.decisionId) continue;
    decisions.set(entry.detail.decision.decisionId, {
      ...structuredClone(entry.detail.decision),
      ticketId: entry.entityId,
      recordedAt: entry.createdAt,
    });
  }
  for (const entry of db.auditLog || []) {
    if (entry.action !== "ai_review" || !entry.detail?.review?.decisionId) continue;
    const existing = decisions.get(entry.detail.review.decisionId);
    if (existing) existing.review = structuredClone(entry.detail.review);
  }
  for (const ticket of db.tickets || []) {
    const quality = ticket.aiAnalysis?.quality;
    if (!quality?.decisionId) continue;
    decisions.set(quality.decisionId, {
      ...structuredClone(quality),
      ticketId: ticket.id,
      recordedAt: quality.generatedAt,
    });
  }
  return [...decisions.values()].map((decision) => {
    const ticket = ticketById.get(decision.ticketId);
    return { ...decision, ticketCode: ticket?.code || "", ticketTitle: ticket?.title || "" };
  });
}

function percentage(numerator, denominator) {
  return denominator ? Number((numerator * 100 / denominator).toFixed(1)) : null;
}

export function buildAiQualityReport(db, { days = 30, now = new Date() } = {}) {
  const safeDays = Math.min(config.aiQualityRetentionDays, Math.max(1, Number(days) || 30));
  const from = now.getTime() - safeDays * 86_400_000;
  const decisions = collectDecisions(db)
    .filter((item) => new Date(item.generatedAt || item.recordedAt || 0).getTime() >= from)
    .sort((a, b) => String(b.generatedAt || b.recordedAt).localeCompare(String(a.generatedAt || a.recordedAt)));
  const reviewed = decisions.filter((item) => item.review?.result);
  const correct = reviewed.filter((item) => item.review.result === "correct").length;
  const incorrect = reviewed.filter((item) => item.review.result === "incorrect").length;
  const escalated = decisions.filter((item) => item.status === "escalated").length;
  const unavailable = decisions.filter((item) => item.status === "unavailable").length;
  const guided = decisions.filter((item) => item.status === "guided").length;
  const average = (values) => values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : null;
  const byProvider = {};
  const categoryIssues = {};
  const escalationReasons = {};
  for (const decision of decisions) {
    const provider = decision.provider || "unknown";
    byProvider[provider] ||= { total: 0, reviewed: 0, incorrect: 0, unavailable: 0, averageLatencyMs: null, latencyValues: [] };
    const item = byProvider[provider];
    item.total += 1;
    if (decision.review?.result) item.reviewed += 1;
    if (decision.review?.result === "incorrect") item.incorrect += 1;
    if (decision.status === "unavailable") item.unavailable += 1;
    if (Number.isFinite(Number(decision.latencyMs))) item.latencyValues.push(Number(decision.latencyMs));
    if (decision.review?.result === "incorrect") {
      const category = decision.proposal?.category || "other";
      categoryIssues[category] = (categoryIssues[category] || 0) + 1;
    }
    const code = decision.proposal?.escalationCode;
    if (code) escalationReasons[code] = (escalationReasons[code] || 0) + 1;
  }
  for (const item of Object.values(byProvider)) {
    item.averageLatencyMs = average(item.latencyValues);
    delete item.latencyValues;
  }
  return {
    days: safeDays,
    summary: {
      total: decisions.length,
      guided,
      escalated,
      unavailable,
      reviewed: reviewed.length,
      correct,
      incorrect,
      reviewCoverageRate: percentage(reviewed.length, decisions.length),
      accuracyRate: percentage(correct, reviewed.length),
      escalationRate: percentage(escalated + unavailable, decisions.length),
      unavailableRate: percentage(unavailable, decisions.length),
      averageConfidence: average(decisions.map((item) => Number(item.proposal?.confidence)).filter(Number.isFinite)),
      averageLatencyMs: average(decisions.map((item) => Number(item.latencyMs)).filter(Number.isFinite)),
    },
    byProvider,
    categoryIssues,
    escalationReasons,
    recent: decisions.slice(0, 30).map((item) => ({
      decisionId: item.decisionId,
      ticketId: item.ticketId,
      ticketCode: item.ticketCode,
      ticketTitle: item.ticketTitle,
      generatedAt: item.generatedAt || item.recordedAt,
      trigger: item.trigger,
      provider: item.provider,
      status: item.status,
      proposal: item.proposal,
      review: item.review || null,
    })),
  };
}
