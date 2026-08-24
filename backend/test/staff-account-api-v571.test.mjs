import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(baseUrl, processLogs) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Backend did not become ready:\n${processLogs()}`);
}

test("staff account API reports duplicate errors and persists activation on create", { timeout: 15_000 }, async (context) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "helpdesk-v571-"));
  const port = await availablePort();
  let logs = "";
  const child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PROVIDER: "json",
      DATA_FILE: path.join(tempRoot, "db.json"),
      UPLOADS_DIR: path.join(tempRoot, "uploads"),
      APP_SECRET: "staff-api-v571-test-secret-at-least-32-characters",
      ADMIN_PASSWORD: "AdminTest2026",
      LEGACY_STAFF_LOGIN_ENABLED: "true",
      PLAYBOOK_SEMANTIC: "false",
      PLAYBOOK_GOVERNANCE_ENABLED: "false",
      OVERDUE_CHECK_SECONDS: "3600",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });
  context.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    await rm(tempRoot, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await waitForHealth(baseUrl, () => logs);
  assert.equal(health.version, "5.17.0");
  assert.deepEqual(health.deployment.retention, {
    maxStoredTickets: 30,
    terminalStatuses: ["resolved", "closed"],
    maxTicketAttachmentBytes: 10 * 1024 * 1024,
  });
  assert.ok(health.features.includes("terminal-ticket-auto-eviction"));
  assert.ok(health.features.includes("10mb-ticket-attachment-budget"));

  const login = async (username, password = "HelpDesk2026") => {
    const response = await fetch(`${baseUrl}/api/auth/staff`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    return { status: response.status, body: await response.json() };
  };
  const legacy = await login("admin", "AdminTest2026");
  assert.equal(legacy.status, 200, logs);
  const token = legacy.body.token;
  const create = async (body) => {
    const response = await fetch(`${baseUrl}/api/admin/staff`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };

  const active = await create({ username: "active.one", displayName: "Active One", role: "technician", password: "HelpDesk2026", active: true });
  assert.equal(active.status, 201);
  assert.equal(active.body.account.active, true);
  assert.equal((await login("active.one")).status, 200);

  const duplicate = await create({ username: " Active One ", displayName: "Duplicate", role: "viewer", password: "HelpDesk2026", active: true });
  assert.deepEqual(duplicate, { status: 409, body: { error: "Tên đăng nhập đã tồn tại", code: "STAFF_USERNAME_EXISTS", field: "username" } });

  const inactive = await create({ username: "inactive.one", displayName: "Inactive One", role: "viewer", password: "HelpDesk2026", active: false });
  assert.equal(inactive.status, 201);
  assert.equal(inactive.body.account.active, false);
  assert.equal((await login("inactive.one")).status, 401);

  const invalidActive = await create({ username: "invalid.active", displayName: "Invalid Active", role: "viewer", password: "HelpDesk2026", active: "false" });
  assert.deepEqual(invalidActive, { status: 400, body: { error: "Trạng thái tài khoản không hợp lệ", code: "STAFF_ACTIVE_INVALID", field: "active" } });
});
