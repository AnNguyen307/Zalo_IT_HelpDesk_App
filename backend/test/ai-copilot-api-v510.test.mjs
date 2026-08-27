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

async function request(baseUrl, pathname, { token = "", method = "GET", body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
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

test("explicit User handoff queues an isolated staff-only Copilot run", { timeout: 20_000 }, async (context) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "helpdesk-v510-copilot-"));
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
      APP_SECRET: "copilot-api-v510-test-secret-at-least-32-chars",
      ADMIN_PASSWORD: "AdminCopilot2026",
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
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    await rm(tempRoot, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await waitForHealth(baseUrl, () => logs);
  assert.equal(health.version, "5.18.1");
  assert.ok(health.features.includes("copilot-independent-reasoning"));
  assert.ok(health.features.includes("copilot-no-playbook-analysis"));
  assert.ok(health.features.includes("copilot-multi-path-solutions"));
  assert.ok(health.features.includes("copilot-model-selection"));
  assert.ok(health.features.includes("staff-ai-copilot"));

  const [adminLogin, userLogin] = await Promise.all([
    request(baseUrl, "/api/auth/staff", { method: "POST", body: { username: "admin", password: "AdminCopilot2026" } }),
    request(baseUrl, "/api/auth/zalo", { method: "POST", body: { userId: "zalo-v510-user", name: "Người dùng Copilot" } }),
  ]);
  assert.equal(adminLogin.status, 200, logs);
  assert.equal(userLogin.status, 200, logs);

  const created = await request(baseUrl, "/api/tickets", {
    token: userLogin.body.token,
    method: "POST",
    body: { title: "Máy in Ricoh Offline không in được", description: "Máy Ricoh tầng 2 báo Offline và hàng đợi bị kẹt." },
  });
  assert.equal(created.status, 201, logs);
  assert.equal(created.body.ticket.status, "waiting_user", logs);
  assert.equal(created.body.ticket.humanHandoff.locked, false);

  const userCannotReadCopilot = await request(baseUrl, `/api/staff/tickets/${created.body.ticket.id}/copilot`, { token: userLogin.body.token });
  assert.equal(userCannotReadCopilot.status, 403);

  const handoff = await request(baseUrl, `/api/tickets/${created.body.ticket.id}/request-human-help`, {
    token: userLogin.body.token,
    method: "POST",
    body: {},
  });
  assert.equal(handoff.status, 200, logs);
  assert.equal(handoff.body.ticket.status, "open");
  assert.equal(handoff.body.ticket.humanHandoff.locked, true);
  assert.equal(handoff.body.copilotQueued, true);

  let copilot;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    copilot = await request(baseUrl, `/api/staff/tickets/${created.body.ticket.id}/copilot`, { token: adminLogin.body.token });
    if (copilot.body.runs?.[0]?.status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(copilot.status, 200, logs);
  assert.equal(copilot.body.modelOptions.defaultProviderKey, "auto");
  assert.deepEqual(copilot.body.modelOptions.options, []);
  assert.equal(copilot.body.runs[0].status, "completed", logs);
  assert.equal(copilot.body.runs[0].provider, "rules-local");
  assert.ok(copilot.body.runs[0].suggestion.draftReply);

  const publicBundle = await request(baseUrl, `/api/tickets/${created.body.ticket.id}`, { token: userLogin.body.token });
  const publicJson = JSON.stringify(publicBundle.body);
  assert.doesNotMatch(publicJson, /diagnosticSuggestions|draftReply|aiCopilotRuns|copilotRuns|suggestion/);

  const userReply = await request(baseUrl, `/api/tickets/${created.body.ticket.id}/messages`, {
    token: userLogin.body.token,
    method: "POST",
    body: { message: "Tôi bổ sung mã lỗi SC542" },
  });
  assert.equal(userReply.status, 201, logs);
  assert.equal(userReply.body.messages.length, 1);
  assert.equal(userReply.body.analysis, null);

  const invalidModel = await request(baseUrl, `/api/staff/tickets/${created.body.ticket.id}/copilot/runs`, {
    token: adminLogin.body.token,
    method: "POST",
    body: { providerKey: "unapproved-model" },
  });
  assert.equal(invalidModel.status, 400, logs);

  const manual = await request(baseUrl, `/api/staff/tickets/${created.body.ticket.id}/copilot/runs`, {
    token: adminLogin.body.token,
    method: "POST",
    body: { providerKey: "auto" },
  });
  assert.equal(manual.status, 202, logs);
  assert.equal(manual.body.run.trigger, "staff_manual_reanalysis");
  assert.equal(manual.body.run.requestedProviderKey, "auto");
  assert.equal(manual.body.run.requestedModel, null);
});
