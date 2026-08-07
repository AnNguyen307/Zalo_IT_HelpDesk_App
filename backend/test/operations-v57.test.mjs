import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationsReport, clientReplyPending, matchesSmartQueue, smartQueueCounts, ticketsCsv } from "../src/operations.mjs";
import { createSla } from "../src/sla.mjs";

const createdAt = "2026-08-07T02:00:00.000Z";
const session = { sub: "stf_1", name: "Kỹ thuật viên A", role: "technician" };
const tickets = [
  { id: "t1", code: "HD-1", userId: "u1", title: "Mạng lỗi", category: "network", priority: "high", status: "in_progress", assignedToId: "stf_1", assignedTo: "Kỹ thuật viên A", createdAt, updatedAt: createdAt, reopenCount: 0, sla: createSla("high", createdAt) },
  { id: "t2", code: "HD-2", userId: "u1", title: "Máy in", category: "printer", priority: "normal", status: "open", assignedToId: "", assignedTo: "", createdAt, updatedAt: createdAt, reopenCount: 1, sla: createSla("normal", createdAt) },
  { id: "t3", code: "HD-3", userId: "u1", title: "Office", category: "office", priority: "low", status: "resolved", assignedToId: "stf_1", assignedTo: "Kỹ thuật viên A", createdAt, updatedAt: createdAt, resolvedAt: "2026-08-07T03:00:00.000Z", reopenCount: 0, satisfaction: { score: 5 }, sla: { ...createSla("low", createdAt), firstRespondedAt: "2026-08-07T02:15:00.000Z" } },
];
const messages = [
  { ticketId: "t1", role: "technician", createdAt: "2026-08-07T02:10:00.000Z" },
  { ticketId: "t1", role: "user", createdAt: "2026-08-07T02:20:00.000Z" },
];

test("smart queues identify mine, unassigned, client replied and reopened", () => {
  assert.equal(matchesSmartQueue(tickets[0], "mine", session, messages), true);
  assert.equal(matchesSmartQueue(tickets[1], "unassigned", session, messages), true);
  assert.equal(clientReplyPending(tickets[0], messages), true);
  assert.equal(matchesSmartQueue(tickets[1], "reopened", session, messages), true);
  const counts = smartQueueCounts(tickets, session, messages);
  assert.equal(counts.mine, 2);
  assert.equal(counts.unassigned, 1);
  assert.equal(counts.client_replied, 1);
});

test("operations report and UTF-8 CSV include operational metrics", () => {
  const db = { tickets, messages, users: [{ id: "u1", name: "Người dùng", department: "IT" }] };
  const report = buildOperationsReport(db, { days: 30, now: new Date("2026-08-08T00:00:00.000Z") });
  assert.equal(report.summary.total, 3);
  assert.equal(report.summary.averageSatisfaction, 5);
  assert.equal(report.byCategory.network, 1);
  assert.equal(report.byTechnician[0].name, "Kỹ thuật viên A");
  const csv = ticketsCsv(db);
  assert.ok(csv.startsWith("\uFEFFMã ticket"));
  assert.match(csv, /HD-1/);
  assert.match(csv, /Người dùng/);
});
