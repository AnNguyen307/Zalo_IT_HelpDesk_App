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
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

test("Admin can review a v5.8 AI decision and apply corrections to the ticket", { timeout: 20_000 }, async (context) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "helpdesk-v58-quality-"));
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
      APP_SECRET: "ai-quality-v58-test-secret-at-least-32-characters",
      ADMIN_PASSWORD: "AdminTest2026",
      LEGACY_STAFF_LOGIN_ENABLED: "true",
      AI_ROUTER_ENABLED: "false",
      AI_PROVIDER: "rules",
      AGENT_MODE: "rules",
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
  assert.equal(health.version, "5.18.6");
  assert.equal(health.agent.provider, "rules-local");

  const adminLogin = await request(baseUrl, "/api/auth/staff", { method: "POST", body: { username: "admin", password: "AdminTest2026" } });
  assert.equal(adminLogin.status, 200, logs);
  const adminToken = adminLogin.body.token;
  const userLogin = await request(baseUrl, "/api/auth/zalo", { method: "POST", body: { userId: "zalo-v58-user", name: "Người dùng test" } });
  assert.equal(userLogin.status, 200, logs);

  const created = await request(baseUrl, "/api/tickets", {
    token: userLogin.body.token,
    method: "POST",
    body: { title: "Thiết bị có hiện tượng lạ", description: "Thiết bị không hoạt động nhưng chưa có mã lỗi cụ thể." },
  });
  assert.equal(created.status, 201, logs);
  const ticket = created.body.ticket;
  assert.equal(ticket.priority, "normal");
  assert.match(ticket.aiAnalysis.quality.decisionId, /^aid_/);

  const initialReport = await request(baseUrl, "/api/admin/ai-quality?days=30", { token: adminToken });
  assert.equal(initialReport.status, 200);
  assert.equal(initialReport.body.report.summary.total, 1);
  assert.equal(initialReport.body.report.summary.reviewed, 0);

  const reviewed = await request(baseUrl, `/api/admin/tickets/${ticket.id}/ai-review`, {
    token: adminToken,
    method: "POST",
    body: {
      decisionId: ticket.aiAnalysis.quality.decisionId,
      result: "incorrect",
      corrections: { category: "hardware", priority: "high", risk: "medium", outcome: "escalate" },
      note: "Đã xác nhận đây là lỗi phần cứng cần ưu tiên cao.",
      applyToTicket: true,
    },
  });
  assert.equal(reviewed.status, 200, logs);
  assert.equal(reviewed.body.ticket.category, "hardware");
  assert.equal(reviewed.body.ticket.priority, "high");
  assert.equal(reviewed.body.ticket.risk, "medium");
  assert.equal(reviewed.body.review.result, "incorrect");

  const finalReport = await request(baseUrl, "/api/admin/ai-quality?days=30", { token: adminToken });
  assert.equal(finalReport.body.report.summary.reviewed, 1);
  assert.equal(finalReport.body.report.summary.incorrect, 1);
  assert.equal(finalReport.body.report.categoryIssues.other, 1);
});

test("ticket is still created with Normal priority when Gemini staging is disabled", { timeout: 20_000 }, async (context) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "helpdesk-v58-gemini-off-"));
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
      APP_SECRET: "ai-quality-v58-gemini-off-secret-32-chars",
      LEGACY_STAFF_LOGIN_ENABLED: "true",
      AI_ROUTER_ENABLED: "false",
      AI_PROVIDER: "gemini",
      AI_CLOUD_ENABLED: "false",
      AI_REDACTION_ENABLED: "true",
      GEMINI_API_KEY: "",
      AGENT_MODE: "rules",
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
  assert.equal(health.agent.provider, "gemini-cloud");
  assert.equal(health.agent.ready, false);
  assert.equal(health.agent.cloudEnabled, false);

  const userLogin = await request(baseUrl, "/api/auth/zalo", {
    method: "POST",
    body: { userId: "zalo-v58-gemini-off", name: "Người dùng Gemini off" },
  });
  assert.equal(userLogin.status, 200, logs);

  const created = await request(baseUrl, "/api/tickets", {
    token: userLogin.body.token,
    method: "POST",
    body: {
      title: "Máy in Ricoh Offline không in được",
      description: "Máy Ricoh tầng 2 báo Offline và hàng đợi bị kẹt.",
    },
  });
  assert.equal(created.status, 201, logs);
  assert.equal(created.body.ticket.priority, "normal");
  assert.equal(created.body.ticket.aiAnalysis.escalationCode, "agent_unavailable");
  assert.deepEqual(created.body.ticket.aiAnalysis.steps, []);
  assert.equal(created.body.ticket.aiAnalysis.quality.status, "unavailable");
  assert.equal(created.body.ticket.aiAnalysis.quality.provider, "gemini-cloud");
  assert.equal(created.body.ticket.aiAnalysis.quality.dataBoundary, "external");
  assert.equal(created.body.ticket.aiAnalysis.quality.redaction.applied, true);
});

test("ticket survives total Router V2 provider failure with attempt telemetry", { timeout: 20_000 }, async (context) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "helpdesk-v59-router-fail-"));
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
      APP_SECRET: "ai-router-v59-failure-secret-at-least-32-chars",
      AI_ROUTER_ENABLED: "true",
      AI_PROVIDER_ORDER: "gemini,groq,openrouter,sambanova",
      AI_CLOUD_ENABLED: "true",
      GEMINI_ENABLED: "false",
      GROQ_ENABLED: "false",
      OPENROUTER_ENABLED: "false",
      SAMBANOVA_ENABLED: "false",
      AI_PROVIDER_RETRIES: "0",
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
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    await rm(tempRoot, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await waitForHealth(baseUrl, () => logs);
  assert.equal(health.version, "5.18.6");
  assert.equal(health.agent.provider, "ai-router-v2");
  assert.equal(health.agent.paidApiRequired, false);

  const login = await request(baseUrl, "/api/auth/zalo", {
    method: "POST",
    body: { userId: "zalo-v59-router-failure", name: "Mock Router Failure" },
  });
  const created = await request(baseUrl, "/api/tickets", {
    token: login.body.token,
    method: "POST",
    body: { title: "Máy in Ricoh Offline không in được", description: "Ricoh tầng 2 báo Offline." },
  });

  assert.equal(created.status, 201, logs);
  assert.equal(created.body.ticket.priority, "normal");
  assert.equal(created.body.ticket.aiAnalysis.escalationCode, "agent_unavailable");
  assert.equal(created.body.ticket.aiAnalysis.quality.provider, "ai-router-v2");
  assert.deepEqual(created.body.ticket.aiAnalysis.quality.attempts.map((item) => item.providerKey), [
    "gemini", "groq", "openrouter", "sambanova",
  ]);
});
