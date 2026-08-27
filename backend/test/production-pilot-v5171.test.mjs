import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(backendRoot, "..");

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

test("v5.17.1 Production Pilot covers invite through rated HelpDesk resolution", { timeout: 30_000 }, async (context) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "helpdesk-v5171-pilot-"));
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
      APP_SECRET: "production-pilot-v5171-test-secret-32-chars",
      ADMIN_PASSWORD: "PilotAdmin2026",
      LEGACY_STAFF_LOGIN_ENABLED: "true",
      AI_ROUTER_ENABLED: "false",
      AI_PROVIDER: "rules",
      AI_CLOUD_ENABLED: "false",
      PLAYBOOK_RETRIEVAL_MODE: "lexical",
      PLAYBOOK_EMBED_PROVIDER: "none",
      PLAYBOOK_GOVERNANCE_ENABLED: "false",
      OVERDUE_CHECK_SECONDS: "3600",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });
  context.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
    await rm(tempRoot, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await waitForHealth(baseUrl, () => logs);
  assert.equal(health.version, "5.18.2");
  assert.ok(health.features.includes("production-pilot-e2e"));
  assert.equal(health.authentication.userLogin, "one-time-invite");

  const adminLogin = await request(baseUrl, "/api/auth/staff", {
    method: "POST",
    body: { username: "admin", password: "PilotAdmin2026" },
  });
  assert.equal(adminLogin.status, 200, logs);
  const adminToken = adminLogin.body.token;

  const invite = await request(baseUrl, "/api/admin/user-invites", {
    token: adminToken,
    method: "POST",
    body: {
      employeeCode: "PILOT-001",
      displayName: "Người dùng Pilot",
      department: "Vận hành",
      validHours: 24,
    },
  });
  assert.equal(invite.status, 201, logs);
  assert.match(invite.body.code, /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){2}$/);

  const deviceId = "pilot-device-zalo-miniapp-0001";
  const login = await request(baseUrl, "/api/auth/invite", {
    method: "POST",
    body: { code: invite.body.code, deviceId },
  });
  assert.equal(login.status, 200, logs);
  assert.equal(login.body.user.name, "Người dùng Pilot");
  assert.equal(login.body.user.zaloUserId, "invite:pilot-001");

  const refreshed = await request(baseUrl, "/api/auth/refresh", {
    method: "POST",
    body: { refreshToken: login.body.refreshToken, deviceId },
  });
  assert.equal(refreshed.status, 200, logs);
  assert.notEqual(refreshed.body.refreshToken, login.body.refreshToken);
  const userToken = refreshed.body.token;

  const created = await request(baseUrl, "/api/tickets", {
    token: userToken,
    method: "POST",
    body: {
      title: "Máy in Ricoh Offline không in được",
      description: "Máy Ricoh tầng 2 báo Offline và hàng đợi bị kẹt.",
      location: "Tầng 2",
      device: "Ricoh IM C3000",
    },
  });
  assert.equal(created.status, 201, logs);
  assert.equal(created.body.ticket.status, "waiting_user");
  assert.equal(created.body.ticket.humanHandoff.locked, false);
  const ticketId = created.body.ticket.id;

  const form = new FormData();
  const attachmentText = "Pilot evidence: Ricoh SC542";
  form.append("file", new Blob([attachmentText], { type: "text/plain" }), "pilot-evidence.txt");
  const uploadedResponse = await fetch(`${baseUrl}/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` },
    body: form,
  });
  const uploaded = { status: uploadedResponse.status, body: await uploadedResponse.json() };
  assert.equal(uploaded.status, 201, logs);
  assert.equal(uploaded.body.attachment.fileName, "pilot-evidence.txt");
  assert.equal(uploaded.body.attachment.mimeType, "text/plain");

  const preview = await fetch(`${baseUrl}/api/attachments/${uploaded.body.attachment.id}?preview=1`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get("content-security-policy"), /^sandbox;/);
  assert.equal(await preview.text(), attachmentText);

  const handoff = await request(baseUrl, `/api/tickets/${ticketId}/request-human-help`, {
    token: userToken,
    method: "POST",
    body: {},
  });
  assert.equal(handoff.status, 200, logs);
  assert.equal(handoff.body.ticket.status, "open");
  assert.equal(handoff.body.humanHandoff.locked, true);
  assert.equal(handoff.body.copilotQueued, true);

  let copilot;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    copilot = await request(baseUrl, `/api/staff/tickets/${ticketId}/copilot`, { token: adminToken });
    if (copilot.body.runs?.[0]?.status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(copilot.status, 200, logs);
  assert.equal(copilot.body.runs[0].status, "completed", logs);
  assert.equal(copilot.body.runs[0].provider, "rules-local");

  const staffReply = await request(baseUrl, `/api/tickets/${ticketId}/messages`, {
    token: adminToken,
    method: "POST",
    body: { message: "HelpDesk đã tiếp nhận. Vui lòng tắt nguồn máy in 30 giây rồi bật lại." },
  });
  assert.equal(staffReply.status, 201, logs);
  assert.equal(staffReply.body.messages[0].role, "technician");

  const resolved = await request(baseUrl, `/api/admin/tickets/${ticketId}`, {
    token: adminToken,
    method: "PATCH",
    body: { status: "resolved", resolution: "Đã khởi động lại và xóa hàng đợi bị kẹt." },
  });
  assert.equal(resolved.status, 200, logs);
  assert.equal(resolved.body.ticket.status, "resolved");
  assert.equal(resolved.body.ticket.resolution, "Đã khởi động lại và xóa hàng đợi bị kẹt.");

  const notifications = await request(baseUrl, "/api/notifications", { token: userToken });
  assert.equal(notifications.status, 200);
  assert.ok(notifications.body.notifications.some((item) => item.type === "reply" && item.ticketId === ticketId));
  assert.ok(notifications.body.notifications.some((item) => item.type === "status" && item.ticketId === ticketId));

  const rating = await request(baseUrl, `/api/tickets/${ticketId}/rating`, {
    token: userToken,
    method: "POST",
    body: { score: 5, comment: "Phản hồi rõ ràng và xử lý nhanh." },
  });
  assert.equal(rating.status, 200, logs);
  assert.equal(rating.body.satisfaction.score, 5);

  const publicBundle = await request(baseUrl, `/api/tickets/${ticketId}`, { token: userToken });
  assert.equal(publicBundle.status, 200);
  assert.equal(publicBundle.body.ticket.status, "resolved");
  assert.equal(publicBundle.body.ticket.satisfaction.score, 5);
  assert.equal(publicBundle.body.attachments.length, 1);
  assert.ok(publicBundle.body.messages.some((item) => item.role === "technician"));
  assert.ok(publicBundle.body.history.some((item) => item.type === "rating"));
  assert.doesNotMatch(JSON.stringify(publicBundle.body), /diagnosticSuggestions|draftReply|aiCopilotRuns|copilotRuns|suggestion/);

  const persisted = await readFile(dataFile, "utf8");
  assert.equal(persisted.includes(invite.body.code), false);
  assert.equal(persisted.includes(refreshed.body.refreshToken), false);
});

test("v5.17.1 Mini App deploy gate accepts the current ready v5.18.2 Backend", async () => {
  const [backendManifestText, miniAppManifestText, workflow, releaseNote, checklist, botRelease, webhookRelease, mobileRelease] = await Promise.all([
    readFile(path.join(backendRoot, "package.json"), "utf8"),
    readFile(path.join(repositoryRoot, "miniapp", "package.json"), "utf8"),
    readFile(path.join(repositoryRoot, ".github", "workflows", "zalo-miniapp-deploy.yml"), "utf8"),
    readFile(path.join(repositoryRoot, "docs", "releases", "v5.17.1", "CHANGES_V5_17_1_PRODUCTION_PILOT.md"), "utf8"),
    readFile(path.join(repositoryRoot, "docs", "releases", "v5.17.1", "PRODUCTION_PILOT_CHECKLIST.md"), "utf8"),
    readFile(path.join(repositoryRoot, "docs", "releases", "v5.18.0", "CHANGES_V5_18_0_ZALO_BOT_ASSISTANT.md"), "utf8"),
    readFile(path.join(repositoryRoot, "docs", "releases", "v5.18.1", "CHANGES_V5_18_1_ZALO_BOT_WEBHOOK_BOOTSTRAP.md"), "utf8"),
    readFile(path.join(repositoryRoot, "docs", "releases", "v5.18.2", "CHANGES_V5_18_2_ADMIN_MOBILE_RESPONSIVE.md"), "utf8"),
  ]);
  const backendManifest = JSON.parse(backendManifestText);
  const miniAppManifest = JSON.parse(miniAppManifestText);

  assert.equal(backendManifest.version, "5.18.2");
  assert.equal(miniAppManifest.version, "5.17.1");
  assert.match(miniAppManifest.devDependencies.vite, /^\^5\./, "ZMP CLI 4.0.3 currently requires the official Vite 5 project baseline");
  assert.equal(backendManifest.scripts["test:pilot"], "node --test test/production-pilot-v5171.test.mjs");
  assert.match(workflow, /Run Production Pilot E2E gate/);
  assert.match(workflow, /npm run test:pilot/);
  assert.match(workflow, /health\.version !== expectedVersion/);
  assert.match(workflow, /features\.includes\("production-pilot-e2e"\)/);
  assert.match(workflow, /health\.authentication\?\.userLogin !== "one-time-invite"/);
  assert.match(workflow, /Deployment type: Testing/);
  assert.match(releaseNote, /Không chạy migration/);
  assert.match(checklist, /Mini App không thấy nội dung Copilot/);
  assert.match(botRelease, /Mini App build\/deployment: not required/);
  assert.match(webhookRelease, /Database migration: not required/);
  assert.match(mobileRelease, /Mini App build\/deployment: not required/);
});
