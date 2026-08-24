import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { emptyDb } from "../src/store-helpers.mjs";
import {
  eraseZaloUserDataSnapshot,
  generateZaloWebhookSignature,
  PRIVACY_ERASURE_COMPLETED,
} from "../src/zalo-webhook.mjs";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(baseUrl, logs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response.json();
    } catch {
      // Server startup can take a moment on CI.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Backend did not become healthy:\n${logs.join("")}`);
}

test("Zalo signature follows alphabetical field ordering and SHA-256", () => {
  const data = {
    event: "user.revoke.consent",
    appId: "4185582976193315701",
    userId: "4047671499938107249",
    timestamp: 1670553442564,
  };
  const apiKey = "test-only-open-api-key";
  const expectedContent = `${data.appId}${data.event}${data.timestamp}${data.userId}${apiKey}`;
  const expected = crypto.createHash("sha256").update(expectedContent).digest("hex");
  assert.equal(generateZaloWebhookSignature(data, apiKey), expected);
});

test("consent revocation removes the user's linked records without retaining identifiers", () => {
  const db = emptyDb();
  db.users.push(
    { id: "usr_target", zaloUserId: "zalo-target", name: "Target User" },
    { id: "usr_keep", zaloUserId: "zalo-keep", name: "Keep User" },
  );
  db.userInvites.push({ id: "invite_target", usedByUserId: "usr_target" }, { id: "invite_keep", usedByUserId: "usr_keep" });
  db.userRefreshSessions.push({ id: "session_target", userId: "usr_target" }, { id: "session_keep", userId: "usr_keep" });
  db.tickets.push({ id: "ticket_target", userId: "usr_target" }, { id: "ticket_keep", userId: "usr_keep" });
  db.messages.push({ id: "message_target", ticketId: "ticket_target", authorId: "usr_target" }, { id: "message_keep", ticketId: "ticket_keep", authorId: "usr_keep" });
  db.attachments.push(
    { id: "attachment_target", ticketId: "ticket_target", uploaderId: "usr_target", storagePath: "ticket_target/file.png", size: 10 },
    { id: "attachment_keep", ticketId: "ticket_keep", uploaderId: "usr_keep", storagePath: "ticket_keep/file.png", size: 20 },
  );
  db.notifications.push({ id: "notification_target", ticketId: "ticket_target", userId: "usr_target" }, { id: "notification_keep", ticketId: "ticket_keep", userId: "usr_keep" });
  db.ticketHistory.push({ id: "history_target", ticketId: "ticket_target", actorId: "usr_target" }, { id: "history_keep", ticketId: "ticket_keep", actorId: "usr_keep" });
  db.aiCopilotRuns.push({ id: "run_target", ticketId: "ticket_target" }, { id: "run_keep", ticketId: "ticket_keep" });
  db.auditLog.push({ id: "audit_target", actor: "usr_target", entityType: "ticket", entityId: "ticket_target", detail: { ticketId: "ticket_target" } });

  const result = eraseZaloUserDataSnapshot(db, "zalo-target", {
    at: "2026-08-24T00:00:00.000Z",
    requestId: "erase_test",
  });

  assert.equal(result.found, true);
  assert.deepEqual(db.users.map((item) => item.id), ["usr_keep"]);
  assert.deepEqual(db.userInvites.map((item) => item.id), ["invite_keep"]);
  assert.deepEqual(db.userRefreshSessions.map((item) => item.id), ["session_keep"]);
  assert.deepEqual(db.tickets.map((item) => item.id), ["ticket_keep"]);
  assert.deepEqual(db.messages.map((item) => item.id), ["message_keep"]);
  assert.deepEqual(db.attachments.map((item) => item.id), ["attachment_keep"]);
  assert.deepEqual(db.notifications.map((item) => item.id), ["notification_keep"]);
  assert.deepEqual(db.ticketHistory.map((item) => item.id), ["history_keep"]);
  assert.deepEqual(db.aiCopilotRuns.map((item) => item.id), ["run_keep"]);
  const privacyAudit = db.auditLog.find((item) => item.id === "erase_test");
  assert.ok(privacyAudit);
  assert.doesNotMatch(JSON.stringify(privacyAudit), /zalo-target|usr_target|Target User/);
});

test("public legal pages identify the individual owner and support address", async () => {
  const [terms, privacy] = await Promise.all([
    fs.readFile(path.join(backendRoot, "public/legal/terms.html"), "utf8"),
    fs.readFile(path.join(backendRoot, "public/legal/privacy.html"), "utf8"),
  ]);
  for (const document of [terms, privacy]) {
    assert.match(document, /Chủ sở hữu: Cá nhân/);
    assert.match(document, /nguyenphantruongan123@gmail\.com/);
  }
  assert.match(terms, /rút lại sự đồng ý trên Zalo/);
});

test("signed webhook is public, rejects invalid signatures, and erases the Zalo user", async (t) => {
  const port = await availablePort();
  const tempRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-zalo-webhook-"));
  const dataFile = path.join(tempRoot, "db.json");
  const logs = [];
  const apiKey = "test-only-open-api-key";
  const miniAppId = "4185582976193315701";
  const child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "development",
      DEPLOYMENT_PROFILE: "local",
      DB_PROVIDER: "json",
      DATA_FILE: dataFile,
      UPLOADS_DIR: path.join(tempRoot, "uploads"),
      ATTACHMENT_TEMP_DIR: path.join(tempRoot, "temp"),
      ATTACHMENT_STORAGE_PROVIDER: "filesystem",
      ZALO_AUTH_MODE: "development",
      ZALO_MINI_APP_ID: miniAppId,
      ZALO_OPEN_API_KEY: apiKey,
      PLAYBOOK_ENABLED: "false",
      PLAYBOOK_GOVERNANCE_ENABLED: "false",
      RATE_LIMIT_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await waitForHealth(baseUrl, logs);
  assert.equal(health.privacy.configured, true);
  assert.ok(health.features.includes("zalo-consent-revocation-webhook"));

  const publicTerms = await fetch(`${baseUrl}/legal/terms.html`);
  assert.equal(publicTerms.status, 200);
  assert.match(await publicTerms.text(), /nguyenphantruongan123@gmail\.com/);

  const loginResponse = await fetch(`${baseUrl}/api/auth/zalo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "zalo-runtime-target", name: "Runtime Target" }),
  });
  assert.equal(loginResponse.status, 200);
  const login = await loginResponse.json();

  const statusResponse = await fetch(`${baseUrl}/api/webhooks/zalo`);
  assert.equal(statusResponse.status, 200);
  assert.equal((await statusResponse.json()).configured, true);

  const event = {
    event: "user.revoke.consent",
    appId: miniAppId,
    userId: "zalo-runtime-target",
    timestamp: 1787529600000,
  };
  const invalid = await fetch(`${baseUrl}/api/webhooks/zalo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-ZEvent-Signature": "invalid" },
    body: JSON.stringify(event),
  });
  assert.equal(invalid.status, 401);

  const erase = await fetch(`${baseUrl}/api/webhooks/zalo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ZEvent-Signature": generateZaloWebhookSignature(event, apiKey),
    },
    body: JSON.stringify(event),
  });
  assert.equal(erase.status, 200);
  const eraseResult = await erase.json();
  assert.equal(eraseResult.accepted, true);
  assert.equal(eraseResult.event, "user.revoke.consent");
  assert.equal(eraseResult.erased, true);
  assert.match(eraseResult.requestId, /^erase_/);
  assert.equal(eraseResult.cleanupPending, 0);

  const oldSession = await fetch(`${baseUrl}/api/me`, { headers: { Authorization: `Bearer ${login.token}` } });
  assert.equal(oldSession.status, 401);

  const stored = JSON.parse(await fs.readFile(dataFile, "utf8"));
  assert.equal(stored.users.length, 0);
  assert.equal(stored.auditLog.at(-1).action, PRIVACY_ERASURE_COMPLETED);
  assert.doesNotMatch(JSON.stringify(stored.auditLog.at(-1)), /zalo-runtime-target|Runtime Target/);
});
