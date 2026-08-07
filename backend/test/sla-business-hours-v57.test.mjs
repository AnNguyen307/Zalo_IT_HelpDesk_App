import assert from "node:assert/strict";
import test from "node:test";
import { addBusinessMinutes, businessMinutesBetween, createSla, pauseSla, publicSla, resumeSla, syncSlaForStatus } from "../src/sla.mjs";

test("business-hours SLA carries Friday work into Monday in Asia/Ho_Chi_Minh", () => {
  const friday1630 = "2026-08-07T09:30:00.000Z";
  assert.equal(addBusinessMinutes(friday1630, 120), "2026-08-10T02:00:00.000Z");
  assert.equal(businessMinutesBetween(friday1630, "2026-08-10T02:00:00.000Z"), 120);
});

test("waiting_user pauses SLA and resume preserves remaining business minutes", () => {
  const ticket = { priority: "normal", status: "in_progress", createdAt: "2026-08-07T09:30:00.000Z", sla: createSla("normal", "2026-08-07T09:30:00.000Z") };
  ticket.status = "waiting_user";
  syncSlaForStatus(ticket, "in_progress", "2026-08-07T10:00:00.000Z", { id: "stf_1", name: "Kỹ thuật viên" });
  assert.equal(ticket.sla.pausedAt, "2026-08-07T10:00:00.000Z");
  assert.equal(ticket.sla.resolutionRemainingMinutes, 1410);
  assert.equal(publicSla(ticket, new Date("2026-08-20T00:00:00.000Z").getTime()).state, "paused");

  ticket.status = "in_progress";
  syncSlaForStatus(ticket, "waiting_user", "2026-08-10T03:00:00.000Z", { id: "usr_1", name: "Người dùng" });
  assert.equal(ticket.sla.pausedAt, null);
  assert.equal(ticket.sla.pauseEvents.length, 1);
  assert.equal(ticket.sla.pauseEvents[0].resumedAt, "2026-08-10T03:00:00.000Z");
  assert.equal(businessMinutesBetween("2026-08-10T03:00:00.000Z", ticket.sla.resolutionDueAt), 1410);
});

test("pause and resume are idempotent", () => {
  const ticket = { priority: "urgent", status: "waiting_user", createdAt: "2026-08-07T02:00:00.000Z", sla: createSla("urgent", "2026-08-07T02:00:00.000Z") };
  pauseSla(ticket, "2026-08-07T02:10:00.000Z");
  pauseSla(ticket, "2026-08-07T02:20:00.000Z");
  assert.equal(ticket.sla.pauseEvents.length, 1);
  resumeSla(ticket, "2026-08-07T03:00:00.000Z");
  resumeSla(ticket, "2026-08-07T03:10:00.000Z");
  assert.equal(ticket.sla.pauseEvents.length, 1);
});
