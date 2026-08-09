import assert from "node:assert/strict";
import test from "node:test";
import { buildAiQualityReport, createAiDecisionRecord, validateAiReview } from "../src/ai-quality.mjs";
import { redactSensitiveData } from "../src/ai-redaction.mjs";

test("cloud payload redaction masks credentials, identity and network addresses", () => {
  const input = {
    description: "Email trang@example.com, phone 0912 345 678, IP 10.20.30.40, password=Secret123",
    conversation: [{ content: "Bearer abc.def.ghi and otp: 778899" }],
  };
  const result = redactSensitiveData(input);
  const serialized = JSON.stringify(result.value);

  assert.equal(result.summary.applied, true);
  assert.ok(result.summary.replacementCount >= 6);
  assert.doesNotMatch(serialized, /trang@example\.com|0912 345 678|10\.20\.30\.40|Secret123|abc\.def\.ghi|778899/);
  assert.match(serialized, /REDACTED_EMAIL/);
  assert.equal(input.description.includes("trang@example.com"), true, "redaction must not mutate the source payload");
});

test("AI decision record captures a stable proposal and provider telemetry", () => {
  const analysis = createAiDecisionRecord({
    source: "gemini-cloud+playbook-rag",
    model: "gemini-test",
    generatedAt: "2026-08-09T02:00:00.000Z",
    latencyMs: 420,
    category: "printer",
    priority: "normal",
    priorityDetermined: true,
    risk: "low",
    outcome: "guide_user",
    confidence: 0.91,
    canAutoHandle: true,
    escalationCode: null,
    providerTelemetry: {
      provider: "gemini-cloud",
      dataBoundary: "external",
      redaction: { applied: true, replacementCount: 2, replacementsByType: { email: 1, phone: 1 } },
      usage: { totalTokens: 350 },
    },
  }, { trigger: "ticket_created" });

  assert.match(analysis.quality.decisionId, /^aid_/);
  assert.equal(analysis.quality.provider, "gemini-cloud");
  assert.equal(analysis.quality.status, "guided");
  assert.equal(analysis.quality.proposal.confidence, 0.91);
  assert.equal(analysis.quality.redaction.replacementCount, 2);
  assert.equal(analysis.quality.review, null);
});

test("incorrect AI review requires a correction signal", () => {
  assert.throws(() => validateAiReview({ decisionId: "aid_1", result: "incorrect" }, { sub: "admin", name: "Admin" }), /hiệu chỉnh|ghi chú/i);
  const review = validateAiReview({
    decisionId: "aid_1",
    result: "incorrect",
    corrections: { category: "network", priority: "high", outcome: "escalate" },
    note: "AI phân loại nhầm máy in.",
  }, { sub: "admin", name: "Quản trị viên" });
  assert.equal(review.result, "incorrect");
  assert.equal(review.applyToTicket, true);
  assert.equal(review.corrections.priority, "high");
  assert.equal(review.reviewedByName, "Quản trị viên");
});

test("quality report merges decision and review audit records", () => {
  const baseDecision = {
    schemaVersion: 1,
    decisionId: "aid_a",
    trigger: "ticket_created",
    generatedAt: "2026-08-09T02:00:00.000Z",
    status: "guided",
    provider: "ollama-local",
    dataBoundary: "local",
    model: "qwen-test",
    latencyMs: 200,
    proposal: { category: "printer", priority: "normal", risk: "low", outcome: "guide_user", confidence: 0.9, canAutoHandle: true, escalationCode: null },
    review: null,
  };
  const db = {
    tickets: [{ id: "t1", code: "HD-1", title: "Máy in", aiAnalysis: { quality: { ...baseDecision, review: { decisionId: "aid_a", result: "correct", reviewedAt: "2026-08-09T03:00:00.000Z" } } } }],
    auditLog: [
      { action: "ai_decision", entityId: "t1", createdAt: "2026-08-09T02:00:00.000Z", detail: { decision: baseDecision } },
      { action: "ai_decision", entityId: "t2", createdAt: "2026-08-09T02:05:00.000Z", detail: { decision: { ...baseDecision, decisionId: "aid_b", status: "unavailable", provider: "gemini-cloud", latencyMs: 60000, proposal: { ...baseDecision.proposal, category: "network", outcome: "escalate", canAutoHandle: false, confidence: 0, escalationCode: "agent_unavailable" } } } },
      { action: "ai_review", entityId: "t2", createdAt: "2026-08-09T03:05:00.000Z", detail: { review: { decisionId: "aid_b", result: "incorrect", reviewedAt: "2026-08-09T03:05:00.000Z", corrections: { category: "other" } } } },
    ],
  };
  const report = buildAiQualityReport(db, { days: 30, now: new Date("2026-08-09T10:00:00.000Z") });

  assert.equal(report.summary.total, 2);
  assert.equal(report.summary.reviewed, 2);
  assert.equal(report.summary.accuracyRate, 50);
  assert.equal(report.summary.unavailable, 1);
  assert.equal(report.byProvider["gemini-cloud"].incorrect, 1);
  assert.equal(report.categoryIssues.network, 1);
});
