import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeWithRules } from "../src/ai-agent.mjs";
import { KB_SEED } from "../src/kb.mjs";
import { DEFAULT_TICKET_PRIORITY, priorityFromAgentAnalysis } from "../src/ticket-priority.mjs";

const entries = KB_SEED.map((entry, index) => ({ ...entry, id: `kb_${index}`, active: true }));

test("new or missing AI analysis defaults ticket priority to normal", () => {
  assert.equal(priorityFromAgentAnalysis(), DEFAULT_TICKET_PRIORITY);
  assert.equal(priorityFromAgentAnalysis({}), DEFAULT_TICKET_PRIORITY);
});

test("undetermined AI escalation keeps normal even if a priority was proposed", () => {
  assert.equal(priorityFromAgentAnalysis({
    priority: "urgent",
    priorityDetermined: false,
    canAutoHandle: false,
    escalationCode: "low_confidence",
  }), DEFAULT_TICKET_PRIORITY);
});

test("agent unavailable keeps the default normal priority", () => {
  assert.equal(priorityFromAgentAnalysis({
    priority: "high",
    priorityDetermined: false,
    canAutoHandle: false,
    escalationCode: "agent_unavailable",
  }), DEFAULT_TICKET_PRIORITY);
});

test("invalid determined priority falls back safely to normal", () => {
  assert.equal(priorityFromAgentAnalysis({ priority: "critical", priorityDetermined: true }), DEFAULT_TICKET_PRIORITY);
  assert.equal(priorityFromAgentAnalysis({ priority: null, priorityDetermined: true }), DEFAULT_TICKET_PRIORITY);
});

test("a determined AI priority is accepted", () => {
  for (const priority of ["low", "normal", "high", "urgent"]) {
    assert.equal(priorityFromAgentAnalysis({ priority, priorityDetermined: true }), priority);
  }
});

test("unknown requests escalate but remain normal", () => {
  const analysis = analyzeWithRules({
    title: "Thiết bị có hiện tượng lạ",
    description: "Không rõ nguyên nhân và chưa có thông báo lỗi cụ thể.",
  }, entries, {}, []);

  assert.equal(analysis.escalated, true);
  assert.equal(analysis.priorityDetermined, false);
  assert.equal(priorityFromAgentAnalysis(analysis), DEFAULT_TICKET_PRIORITY);
});

test("explicit urgent impact may be classified even when handling is escalated", () => {
  const analysis = analyzeWithRules({
    title: "Mất mạng cả công ty",
    description: "Toàn công ty không thể làm việc vì server down.",
  }, entries, {}, []);

  assert.equal(analysis.escalated, true);
  assert.equal(analysis.priorityDetermined, true);
  assert.equal(priorityFromAgentAnalysis(analysis), "urgent");
});

test("ticket creation and re-analysis both use the guarded priority decision", async () => {
  const source = await readFile(new URL("../src/server.mjs", import.meta.url), "utf8");
  assert.match(source, /const priority = priorityFromAgentAnalysis\(analysis\)/);
  assert.match(source, /const nextPriority = priorityFromAgentAnalysis\(analysis\)/);
  assert.match(source, /sla: createSla\(priority, createdAt\)/);
  assert.match(source, /recalculateSla\(ticket, nextPriority\)/);
});
