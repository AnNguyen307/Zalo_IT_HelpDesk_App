import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  analysisRequiresHumanHandoff,
  isHumanHandoffLocked,
  lockHumanHandoff,
  publicHumanHandoff,
  shouldAgentParticipate,
  statusAfterHumanReply,
} from "../src/handoff.mjs";

test("AI escalation permanently locks the ticket for human-only conversation", () => {
  const ticket = {
    aiAnalysis: { outcome: "escalate", canAutoHandle: false, escalated: true, escalationCode: "low_confidence" },
    aiHandoffLocked: false,
  };

  assert.equal(analysisRequiresHumanHandoff(ticket.aiAnalysis), true);
  assert.equal(isHumanHandoffLocked(ticket), true);
  assert.equal(shouldAgentParticipate(ticket), false);

  const changed = lockHumanHandoff(ticket, {
    at: "2026-08-06T03:00:00.000Z",
    reason: "low_confidence",
    actorId: "ai-agent",
    actorName: "HelpDesk Escalation",
  });
  assert.equal(changed, true);
  assert.equal(ticket.aiHandoffLocked, true);
  assert.equal(publicHumanHandoff(ticket).aiParticipationAllowed, false);

  const secondChange = lockHumanHandoff(ticket, {
    at: "2026-08-06T04:00:00.000Z",
    reason: "attempted_unlock_or_overwrite",
    actorId: "other",
    actorName: "Other",
  });
  assert.equal(secondChange, false);
  assert.equal(ticket.aiHandoffReason, "low_confidence");
  assert.equal(ticket.aiHandoffBy, "ai-agent");
});

test("a staff message locks AI even when the original analysis allowed guidance", () => {
  const ticket = { aiAnalysis: { canAutoHandle: true, outcome: "guide_user" }, aiHandoffLocked: false };
  const messages = [{ role: "user" }, { role: "technician" }];
  assert.equal(isHumanHandoffLocked(ticket, messages), true);
  assert.equal(shouldAgentParticipate(ticket, messages), false);
});

test("human-only user reply returns waiting_user ticket to staff queue", () => {
  assert.equal(statusAfterHumanReply("waiting_user"), "in_progress");
  assert.equal(statusAfterHumanReply("open"), "open");
  assert.equal(statusAfterHumanReply("in_progress"), "in_progress");
});

test("server contains pre-analysis and in-transaction race guards", async () => {
  const source = await readFile(new URL("../src/server.mjs", import.meta.url), "utf8");
  assert.match(source, /isHumanHandoffLocked\(bundle\.ticket, bundle\.messages\)/);
  assert.match(source, /currentMessages = db\.messages\.filter/);
  assert.match(source, /agentAccepted: false/);
  assert.match(source, /AI bị khóa vĩnh viễn khỏi hội thoại ticket này/);
});

test("SQL migration persists and backfills immutable handoff state", async () => {
  const migration = await readFile(new URL("../sql/006_ai_handoff_conversation_lock.sql", import.meta.url), "utf8");
  for (const column of ["ai_handoff_locked", "ai_handoff_at", "ai_handoff_reason", "ai_handoff_by", "ai_handoff_by_name"]) {
    assert.match(migration, new RegExp(column));
  }
  assert.match(migration, /JSON_VALUE\(ticket\.ai_analysis_json, N'\$\.escalated'\)/);
  assert.match(migration, /WHERE role = N'technician'/);
  assert.match(migration, /version_number = 6/);
});
