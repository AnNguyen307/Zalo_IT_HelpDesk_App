import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertTicketAttachmentBudget,
  assertTicketSlotAvailable,
  processRetentionCleanups,
  reserveTicketSlot,
  RETENTION_EVICTED,
  RETENTION_GC_PENDING,
} from "../src/retention.mjs";
import { emptyDb } from "../src/store-helpers.mjs";

const MB = 1024 * 1024;
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(baseUrl, logs) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Backend did not become ready:\n${logs()}`);
}

async function request(baseUrl, pathname, { token = "", method = "GET", body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function ticket(index, status = "open", resolvedAt = null) {
  const at = new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString();
  return {
    id: `t${index}`,
    code: `HD-${index}`,
    status,
    createdAt: at,
    updatedAt: resolvedAt || at,
    resolvedAt,
  };
}

test("the 31st ticket evicts only the oldest terminal ticket and all related state", () => {
  const db = emptyDb();
  db.tickets = Array.from({ length: 28 }, (_, index) => ticket(index + 1));
  const oldest = ticket(29, "resolved", "2026-08-02T00:00:00.000Z");
  const newer = ticket(30, "closed", "2026-08-03T00:00:00.000Z");
  db.tickets.push(newer, oldest);
  db.messages.push({ id: "m-old", ticketId: oldest.id }, { id: "m-keep", ticketId: newer.id });
  db.attachments.push(
    { id: "a-old", ticketId: oldest.id, storagePath: "tickets/t29/a-old.jpg", size: 2 * MB },
    { id: "a-keep", ticketId: newer.id, storagePath: "tickets/t30/a-keep.jpg", size: MB },
  );
  db.notifications.push({ id: "n-old", ticketId: oldest.id }, { id: "n-keep", ticketId: newer.id });
  db.ticketHistory.push({ id: "h-old", ticketId: oldest.id }, { id: "h-keep", ticketId: newer.id });
  db.aiCopilotRuns.push({ id: "c-old", ticketId: oldest.id }, { id: "c-keep", ticketId: newer.id });
  db.auditLog.push(
    { id: "audit-old", entityType: "ticket", entityId: oldest.id, detail: {} },
    { id: "audit-attachment", entityType: "attachment", entityId: "a-old", detail: { ticketId: oldest.id } },
    { id: "audit-keep", entityType: "ticket", entityId: newer.id, detail: {} },
  );

  const result = reserveTicketSlot(db, { maxTickets: 30, at: "2026-08-19T00:00:00.000Z" });

  assert.equal(result.evicted.length, 1);
  assert.equal(result.evicted[0].ticketId, oldest.id);
  assert.equal(db.tickets.length, 29);
  assert.equal(db.tickets.some((item) => item.id === oldest.id), false);
  for (const key of ["messages", "attachments", "notifications", "ticketHistory", "aiCopilotRuns"]) {
    assert.equal(db[key].some((item) => item.ticketId === oldest.id), false, `${key} must be pruned`);
    assert.equal(db[key].some((item) => item.ticketId === newer.id), true, `${key} for newer ticket must remain`);
  }
  assert.equal(db.auditLog.some((item) => item.id === "audit-old" || item.id === "audit-attachment"), false);
  const cleanup = db.auditLog.find((item) => item.action === RETENTION_GC_PENDING);
  assert.equal(cleanup.entityId, oldest.id);
  assert.equal(cleanup.detail.attachments[0].storagePath, "tickets/t29/a-old.jpg");
});

test("ticket creation is rejected when all 30 retained tickets are active", () => {
  const db = emptyDb();
  db.tickets = Array.from({ length: 30 }, (_, index) => ticket(index + 1));
  const before = structuredClone(db);

  assert.throws(
    () => assertTicketSlotAvailable(db, 30),
    (error) => error.status === 409 && error.code === "TICKET_CAPACITY_REACHED",
  );
  assert.throws(
    () => reserveTicketSlot(db, { maxTickets: 30 }),
    (error) => error.status === 409 && error.code === "TICKET_CAPACITY_REACHED",
  );
  assert.deepEqual(db, before);
});

test("the 10 MB attachment budget is cumulative and accepts the exact boundary", () => {
  const db = emptyDb();
  db.attachments.push({ id: "a1", ticketId: "t1", size: 6 * MB });

  assert.deepEqual(
    assertTicketAttachmentBudget(db, "t1", [{ id: "a2", size: 4 * MB }], 10 * MB),
    { incomingBytes: 4 * MB, totalBytes: 10 * MB },
  );
  assert.throws(
    () => assertTicketAttachmentBudget(db, "t1", [{ id: "a2", size: 4 * MB + 1 }], 10 * MB),
    (error) => error.status === 413 && error.code === "TICKET_ATTACHMENT_BUDGET_EXCEEDED",
  );
});

test("pending attachment cleanup is durable, idempotent and removes storage paths from completed audit", async () => {
  const db = emptyDb();
  db.auditLog.push({
    id: "gc-1",
    actor: "system-retention",
    action: RETENTION_GC_PENDING,
    entityType: "ticket_retention",
    entityId: "t-old",
    detail: {
      ticketCode: "HD-OLD",
      ticketStatus: "resolved",
      requestedAt: "2026-08-19T00:00:00.000Z",
      attachments: [
        { id: "a1", storagePath: "tickets/t-old/a1.jpg", size: 3 * MB },
        { id: "a2", storagePath: "tickets/t-old/a2.jpg", size: 2 * MB },
      ],
    },
    createdAt: "2026-08-19T00:00:00.000Z",
  });
  const removed = [];
  let failOnce = true;
  const dependencies = {
    async readDb() { return db; },
    async updateDb(mutator) { return mutator(db); },
    async removeAttachment(attachment) {
      removed.push(attachment.storagePath);
      if (attachment.id === "a2" && failOnce) {
        failOnce = false;
        throw new Error("temporary storage failure");
      }
    },
  };

  const first = await processRetentionCleanups(dependencies);
  const second = await processRetentionCleanups(dependencies);
  const third = await processRetentionCleanups(dependencies);

  assert.equal(first.completed, 0);
  assert.equal(first.failed.length, 1);
  assert.deepEqual(second, { completed: 1, failed: [] });
  assert.deepEqual(third, { completed: 0, failed: [] });
  assert.deepEqual(removed, [
    "tickets/t-old/a1.jpg",
    "tickets/t-old/a2.jpg",
    "tickets/t-old/a1.jpg",
    "tickets/t-old/a2.jpg",
  ]);
  const completed = db.auditLog.find((item) => item.id === "gc-1");
  assert.equal(completed.action, RETENTION_EVICTED);
  assert.equal(completed.detail.filesDeleted, 2);
  assert.equal(completed.detail.bytesReleased, 5 * MB);
  assert.equal("attachments" in completed.detail, false);
  assert.equal(JSON.stringify(completed).includes("storagePath"), false);
});

test("ticket API atomically evicts the oldest terminal ticket and rejects overflow when all tickets are active", { timeout: 20_000 }, async (context) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "helpdesk-v5151-retention-"));
  const dataFile = path.join(tempRoot, "db.json");
  const seeded = emptyDb();
  seeded.tickets = Array.from({ length: 30 }, (_, index) => {
    const resolvedAt = new Date(Date.UTC(2026, 7, 1, 0, index + 1)).toISOString();
    return ticket(index + 1, "resolved", resolvedAt);
  });
  seeded.messages.push({ id: "m-oldest", ticketId: "t1" });
  seeded.attachments.push({
    id: "a-oldest",
    ticketId: "t1",
    storagePath: path.relative(backendRoot, path.join(tempRoot, "uploads", "t1", "a-oldest.jpg")).replaceAll("\\", "/"),
    size: MB,
  });
  await writeFile(dataFile, JSON.stringify(seeded, null, 2));

  const port = await availablePort();
  let logs = "";
  const child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PROVIDER: "json",
      DATA_FILE: dataFile,
      UPLOADS_DIR: path.join(tempRoot, "uploads"),
      APP_SECRET: "retention-v5151-test-secret-at-least-32-characters",
      ZALO_AUTH_MODE: "development",
      AI_ROUTER_ENABLED: "false",
      AI_PROVIDER: "rules",
      AGENT_MODE: "rules",
      PLAYBOOK_SEMANTIC: "false",
      PLAYBOOK_GOVERNANCE_ENABLED: "false",
      MAX_STORED_TICKETS: "30",
      MAX_TICKET_ATTACHMENT_MB: "10",
      OVERDUE_CHECK_SECONDS: "3600",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });
  context.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    await rm(tempRoot, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl, () => logs);
  const login = await request(baseUrl, "/api/auth/zalo", {
    method: "POST",
    body: { userId: "retention-user", name: "Retention Test" },
  });
  assert.equal(login.status, 200, logs);

  const createPayload = {
    title: "Kiểm tra giới hạn lưu trữ",
    description: "Tạo ticket thứ ba mươi mốt để kiểm tra retention.",
  };
  const created = await request(baseUrl, "/api/tickets", {
    token: login.body.token,
    method: "POST",
    body: createPayload,
  });
  assert.equal(created.status, 201, logs);

  let afterEviction = JSON.parse(await readFile(dataFile, "utf8"));
  assert.equal(afterEviction.tickets.length, 30);
  assert.equal(afterEviction.tickets.some((item) => item.id === "t1"), false);
  assert.equal(afterEviction.tickets.some((item) => item.id === "t2"), true);
  assert.equal(afterEviction.messages.some((item) => item.id === "m-oldest"), false);
  assert.equal(afterEviction.attachments.some((item) => item.id === "a-oldest"), false);
  const completedGc = afterEviction.auditLog.find((item) => item.entityId === "t1" && item.action === RETENTION_EVICTED);
  assert.ok(completedGc, JSON.stringify(afterEviction.auditLog, null, 2));
  assert.equal(completedGc.detail.filesDeleted, 1);
  assert.equal("attachments" in completedGc.detail, false);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    afterEviction = JSON.parse(await readFile(dataFile, "utf8"));
    if (!afterEviction.aiCopilotRuns.some((run) => ["queued", "running"].includes(run.status))) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(afterEviction.aiCopilotRuns.some((run) => ["queued", "running"].includes(run.status)), false, logs);

  afterEviction.tickets = Array.from({ length: 30 }, (_, index) => ticket(index + 101));
  afterEviction.messages = [];
  afterEviction.attachments = [];
  afterEviction.notifications = [];
  afterEviction.ticketHistory = [];
  afterEviction.aiCopilotRuns = [];
  afterEviction.auditLog = [];
  await writeFile(dataFile, JSON.stringify(afterEviction, null, 2));

  const rejected = await request(baseUrl, "/api/tickets", {
    token: login.body.token,
    method: "POST",
    body: createPayload,
  });
  assert.deepEqual(rejected, {
    status: 409,
    body: {
      error: "Hệ thống đã đạt giới hạn 30 yêu cầu và chưa có yêu cầu đã xử lý/đã đóng để giải phóng. Vui lòng thử lại sau.",
      code: "TICKET_CAPACITY_REACHED",
    },
  });
  const afterRejection = JSON.parse(await readFile(dataFile, "utf8"));
  assert.equal(afterRejection.tickets.length, 30);
  assert.equal(afterRejection.tickets.every((item) => item.status === "open"), true);
});
