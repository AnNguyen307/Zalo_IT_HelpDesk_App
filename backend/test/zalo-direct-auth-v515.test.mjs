import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
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

test("direct Zalo authentication verifies appsecret_proof and rejects claimed identity mismatch", { timeout: 20_000 }, async (context) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "helpdesk-v515-zalo-"));
  const graphPort = await availablePort();
  const backendPort = await availablePort();
  const appSecret = "zalo-app-secret-for-v515-tests";
  const accessToken = "valid-zalo-access-token";
  const expectedProof = crypto.createHmac("sha256", appSecret).update(accessToken).digest("hex");
  const observed = [];
  const graph = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    observed.push({ headers: req.headers, fields: url.searchParams.get("fields") });
    const valid = req.headers.access_token === accessToken
      && req.headers.appsecret_proof === expectedProof
      && url.searchParams.get("fields") === "id,name,picture";
    res.writeHead(valid ? 200 : 401, { "Content-Type": "application/json" });
    res.end(JSON.stringify(valid
      ? { id: "zalo-verified-user", name: "Verified User", picture: { data: { url: "https://example.invalid/avatar.jpg" } }, error: 0 }
      : { error: -1, message: "invalid" }));
  });
  await new Promise((resolve, reject) => graph.once("error", reject).listen(graphPort, "127.0.0.1", resolve));

  let logs = "";
  const child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(backendPort),
      DEPLOYMENT_PROFILE: "local",
      DB_PROVIDER: "json",
      DATA_FILE: path.join(tempRoot, "db.json"),
      UPLOADS_DIR: path.join(tempRoot, "uploads"),
      APP_SECRET: "zalo-auth-v515-test-secret-at-least-32-characters",
      ZALO_AUTH_MODE: "zalo",
      ZALO_APP_SECRET: appSecret,
      ZALO_PROFILE_URL: `http://127.0.0.1:${graphPort}/v2.0/me`,
      PLAYBOOK_GOVERNANCE_ENABLED: "false",
      AI_CLOUD_ENABLED: "false",
      RATE_LIMIT_AUTH_MAX: "3",
      RATE_LIMIT_WINDOW_SECONDS: "60",
      OVERDUE_CHECK_SECONDS: "3600",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });
  context.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    await new Promise((resolve) => graph.close(resolve));
    await rm(tempRoot, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${backendPort}`;
  await waitForHealth(baseUrl, () => logs);
  const login = async (body) => {
    const response = await fetch(`${baseUrl}/api/auth/zalo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), retryAfter: response.headers.get("retry-after") };
  };

  assert.equal((await login({ accessToken })).status, 200, logs);
  const verified = await login({ accessToken, userId: "zalo-verified-user", name: "Untrusted Name" });
  assert.equal(verified.status, 200, logs);
  assert.equal(verified.body.user.zaloUserId, "zalo-verified-user");
  assert.equal(verified.body.user.name, "Verified User");
  assert.equal((await login({ accessToken, userId: "spoofed-user" })).status, 401);
  const limited = await login({ accessToken, userId: "zalo-verified-user" });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.retryAfter) >= 1);
  assert.ok(observed.length >= 3);
  assert.ok(observed.every(({ headers }) => headers.appsecret_proof === expectedProof));
  assert.ok(observed.every(({ fields }) => fields === "id,name,picture"));
});
