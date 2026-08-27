import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

async function waitForHealth(baseUrl, logs) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { const response = await fetch(`${baseUrl}/health`); if (response.ok) return response.json(); }
    catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Backend did not become ready:\n${logs()}`);
}

test("one-time invite creates a rolling device session that can be revoked immediately", { timeout: 20_000 }, async (context) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "helpdesk-v516-invite-"));
  const dataFile = path.join(tempRoot, "db.json");
  const port = await availablePort();
  let logs = "";
  const child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DEPLOYMENT_PROFILE: "local",
      DB_PROVIDER: "json",
      DATA_FILE: dataFile,
      UPLOADS_DIR: path.join(tempRoot, "uploads"),
      APP_SECRET: "invite-auth-v516-test-secret-at-least-32-characters",
      ADMIN_PASSWORD: "AdminTest2026",
      LEGACY_STAFF_LOGIN_ENABLED: "true",
      PLAYBOOK_GOVERNANCE_ENABLED: "false",
      AI_CLOUD_ENABLED: "false",
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
  assert.equal(health.version, "5.18.2");
  assert.deepEqual(health.authentication, { userLogin: "one-time-invite", deviceSessionDays: 90, accessTokenMinutes: 60, immediateRevocation: true });

  async function request(pathname, { method = "GET", token = "", body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }

  const adminLogin = await request("/api/auth/staff", { method: "POST", body: { username: "admin", password: "AdminTest2026" } });
  assert.equal(adminLogin.status, 200, logs);
  const adminToken = adminLogin.body.token;

  const created = await request("/api/admin/user-invites", {
    method: "POST",
    token: adminToken,
    body: { employeeCode: "NV-001", displayName: "Nguyễn Văn An", department: "Kế toán", validHours: 24 },
  });
  assert.equal(created.status, 201, logs);
  assert.match(created.body.code, /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){2}$/);
  assert.equal(created.body.invite.status, "active");
  assert.equal("codeHash" in created.body.invite, false);

  const accessList = await request("/api/admin/user-access", { token: adminToken });
  assert.equal(accessList.status, 200);
  assert.equal(accessList.body.invites[0].employeeCode, "NV-001");
  assert.equal(JSON.stringify(accessList.body).includes(created.body.code), false);

  const deviceId = "device-v516-iphone-00000001";
  const redeemed = await request("/api/auth/invite", { method: "POST", body: { code: created.body.code.toLowerCase(), deviceId } });
  assert.equal(redeemed.status, 200, logs);
  assert.equal(redeemed.body.user.name, "Nguyễn Văn An");
  assert.ok(redeemed.body.token);
  assert.ok(redeemed.body.refreshToken);
  assert.ok(Date.parse(redeemed.body.refreshExpiresAt) > Date.now() + 89 * 86400_000);

  const reusedInvite = await request("/api/auth/invite", { method: "POST", body: { code: created.body.code, deviceId: "device-v516-ipad-0000000002" } });
  assert.deepEqual(reusedInvite, { status: 401, body: { error: "Mã mời không hợp lệ hoặc đã hết hạn", code: "INVITE_INVALID", field: "code" } });
  assert.equal((await request("/api/me", { token: redeemed.body.token })).status, 200);

  const refreshed = await request("/api/auth/refresh", { method: "POST", body: { refreshToken: redeemed.body.refreshToken, deviceId } });
  assert.equal(refreshed.status, 200, logs);
  assert.notEqual(refreshed.body.refreshToken, redeemed.body.refreshToken);
  assert.equal((await request("/api/me", { token: refreshed.body.token })).status, 200);

  const replay = await request("/api/auth/refresh", { method: "POST", body: { refreshToken: redeemed.body.refreshToken, deviceId } });
  assert.equal(replay.status, 401);
  assert.equal((await request("/api/auth/refresh", { method: "POST", body: { refreshToken: refreshed.body.refreshToken, deviceId } })).status, 401);
  assert.equal((await request("/api/me", { token: refreshed.body.token })).status, 401);

  const replacementInvite = await request("/api/admin/user-invites", {
    method: "POST", token: adminToken, body: { employeeCode: "NV-001", displayName: "Nguyễn Văn An", department: "Kế toán" },
  });
  const secondSession = await request("/api/auth/invite", { method: "POST", body: { code: replacementInvite.body.code, deviceId } });
  assert.equal(secondSession.status, 200, logs);
  const revoked = await request(`/api/admin/users/${secondSession.body.user.id}/revoke-sessions`, { method: "POST", token: adminToken, body: {} });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.revoked, 1);
  assert.equal((await request("/api/me", { token: secondSession.body.token })).status, 401);

  const persisted = await readFile(dataFile, "utf8");
  assert.equal(persisted.includes(created.body.code), false);
  assert.equal(persisted.includes(redeemed.body.refreshToken), false);
  assert.match(persisted, /"codeHash"/);
  assert.match(persisted, /"tokenHash"/);
});

test("Mini App source uses invite login and no longer requests a Zalo access token", async () => {
  const [contextSource, zaloSource, loginPage] = await Promise.all([
    readFile(path.join(backendRoot, "..", "miniapp", "src", "context.tsx"), "utf8"),
    readFile(path.join(backendRoot, "..", "miniapp", "src", "lib", "zalo.ts"), "utf8"),
    readFile(path.join(backendRoot, "..", "miniapp", "src", "pages", "InviteLoginPage.tsx"), "utf8"),
  ]);
  assert.match(contextSource, /loginWithInvite/);
  assert.doesNotMatch(contextSource, /loginZalo|getZaloIdentity/);
  assert.doesNotMatch(zaloSource, /getAccessToken|getUserID/);
  assert.match(loginPage, /Sau lần xác nhận này/);
});

test("SQL Server schema 10 persists invite hashes and rolling device sessions", async () => {
  const [migration, store] = await Promise.all([
    readFile(path.join(backendRoot, "sql", "010_user_invite_access.sql"), "utf8"),
    readFile(path.join(backendRoot, "src", "store-sqlserver.mjs"), "utf8"),
  ]);
  assert.match(migration, /helpdesk\.user_invites/);
  assert.match(migration, /helpdesk\.user_refresh_sessions/);
  assert.match(migration, /version_number = 10/);
  assert.match(store, /\["userInvites", "user_invites", upsertUserInvite\]/);
  assert.match(store, /\["userRefreshSessions", "user_refresh_sessions", upsertUserRefreshSession\]/);
});
