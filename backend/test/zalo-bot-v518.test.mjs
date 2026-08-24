import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { normalizeZaloBotEvent, verifyZaloBotWebhookSecret } from "../src/zalo-bot.mjs";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(check, message, { attempts = 120, delayMs = 100 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await check();
      if (result) return result;
    } catch {
      // Runtime state may not be ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(message);
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

function webhookPayload(messageId, text) {
  return {
    ok: true,
    result: {
      event_name: "message.text.received",
      message: {
        message_id: messageId,
        from: { id: "zalo-bot-user-1", display_name: "Nguyễn Bot Pilot", is_bot: false },
        chat: { id: "zalo-private-chat-1", chat_type: "PRIVATE" },
        text,
        date: 1787529600,
      },
    },
  };
}

test("Zalo Bot normalizes official text events and verifies the webhook secret", () => {
  const event = normalizeZaloBotEvent(webhookPayload("message-001", "Laptop không kết nối được Wi-Fi"));
  assert.equal(event.eventName, "message.text.received");
  assert.equal(event.externalMessageId, "message-001");
  assert.equal(event.externalUserId, "zalo-bot-user-1");
  assert.equal(event.chatId, "zalo-private-chat-1");
  assert.equal(event.chatType, "PRIVATE");
  assert.equal(event.fromIsBot, false);
  assert.equal(event.text, "Laptop không kết nối được Wi-Fi");
  assert.equal(verifyZaloBotWebhookSecret("test-secret", "test-secret"), true);
  assert.equal(verifyZaloBotWebhookSecret("invalid", "test-secret"), false);
});

test("Zalo Bot uses generative fallback without a Playbook, then auto-creates one ticket when the user reports failure", { timeout: 30_000 }, async (context) => {
  const [backendPort, botApiPort] = await Promise.all([availablePort(), availablePort()]);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "helpdesk-v518-zalo-bot-"));
  const dataFile = path.join(tempRoot, "db.json");
  const botRequests = [];
  const aiRequests = [];
  const logs = [];
  const botApi = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    response.writeHead(200, { "Content-Type": "application/json" });
    if (request.url === "/openai/v1/chat/completions") {
      aiRequests.push({ url: request.url, body });
      response.end(JSON.stringify({
        id: `ai-${aiRequests.length}`,
        model: "mock-groq-model",
        choices: [{
          message: {
            content: JSON.stringify({
              category: "network",
              priority: "normal",
              risk: "low",
              confidence: 0.88,
              summary: "Laptop không kết nối được Wi-Fi văn phòng",
              reply: "Hãy kiểm tra Airplane mode và thử quên mạng Wi-Fi rồi kết nối lại.",
              steps: ["Tắt Airplane mode nếu đang bật.", "Chọn Quên mạng rồi nhập lại mật khẩu Wi-Fi hợp lệ."],
              needsHuman: false,
              reason: "Đây là thao tác phía người dùng, có thể hoàn tác và không cần quyền quản trị.",
            }),
          },
        }],
        usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 },
      }));
      return;
    }
    botRequests.push({ url: request.url, body });
    response.end(JSON.stringify({ ok: true, result: { message_id: `out-${botRequests.length}` } }));
  });
  await listen(botApi, botApiPort);

  const child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(backendPort),
      NODE_ENV: "development",
      DEPLOYMENT_PROFILE: "local",
      DB_PROVIDER: "json",
      DATA_FILE: dataFile,
      UPLOADS_DIR: path.join(tempRoot, "uploads"),
      ATTACHMENT_TEMP_DIR: path.join(tempRoot, "temp"),
      ATTACHMENT_STORAGE_PROVIDER: "filesystem",
      ZALO_AUTH_MODE: "development",
      ZALO_BOT_ENABLED: "true",
      ZALO_BOT_TOKEN: "test-bot-token",
      ZALO_BOT_WEBHOOK_SECRET: "test-bot-secret",
      ZALO_BOT_API_BASE_URL: `http://127.0.0.1:${botApiPort}`,
      ZALO_BOT_GENERATIVE_FALLBACK: "true",
      ZALO_BOT_MAX_SELF_SERVICE_ATTEMPTS: "3",
      AI_ROUTER_ENABLED: "true",
      AI_PROVIDER_ORDER: "groq",
      AI_ROUTING_POLICY: "fixed",
      AI_PROVIDER: "rules",
      AI_CLOUD_ENABLED: "true",
      AI_REDACTION_ENABLED: "true",
      GEMINI_ENABLED: "false",
      GROQ_ENABLED: "true",
      GROQ_BASE_URL: `http://127.0.0.1:${botApiPort}/openai/v1`,
      GROQ_API_KEY: "test-groq-key",
      GROQ_MODEL: "mock-groq-model",
      OPENROUTER_ENABLED: "false",
      SAMBANOVA_ENABLED: "false",
      PLAYBOOK_ENABLED: "false",
      PLAYBOOK_GOVERNANCE_ENABLED: "false",
      RATE_LIMIT_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  context.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await closeServer(botApi);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${backendPort}`;
  const health = await waitFor(async () => {
    const response = await fetch(`${baseUrl}/health`);
    return response.ok ? response.json() : null;
  }, `Backend did not become healthy:\n${logs.join("")}`);
  assert.equal(health.version, "5.18.0");
  assert.equal(health.bot.enabled, true);
  assert.equal(health.bot.configured, true);
  assert.equal(health.bot.manualTicket, true);
  assert.equal(health.bot.autoCreateOnFailure, true);
  assert.equal(health.bot.autoCreateOnNoPlaybook, false);
  assert.ok(health.features.includes("zalo-bot-durable-inbox"));
  assert.ok(health.features.includes("zalo-bot-generative-fallback"));

  const status = await fetch(`${baseUrl}/api/webhooks/zalo-bot`);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).configured, true);

  const invalid = await fetch(`${baseUrl}/api/webhooks/zalo-bot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bot-Api-Secret-Token": "invalid-secret" },
    body: JSON.stringify(webhookPayload("message-invalid", "Không kết nối được mạng")),
  });
  assert.equal(invalid.status, 401);

  const verification = await fetch(`${baseUrl}/api/webhooks/zalo-bot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bot-Api-Secret-Token": "test-bot-secret" },
    body: JSON.stringify({}),
  });
  assert.equal(verification.status, 202);
  assert.deepEqual(await verification.json(), {
    accepted: true,
    queued: false,
    duplicate: false,
    verification: true,
  });

  const unsupported = webhookPayload("message-unsupported", "");
  unsupported.result.event_name = "message.unsupported.received";
  const ignored = await fetch(`${baseUrl}/api/webhooks/zalo-bot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bot-Api-Secret-Token": "test-bot-secret" },
    body: JSON.stringify(unsupported),
  });
  assert.equal(ignored.status, 202);

  const first = await fetch(`${baseUrl}/api/webhooks/zalo-bot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bot-Api-Secret-Token": "test-bot-secret" },
    body: JSON.stringify(webhookPayload("message-001", "Laptop không thể kết nối Wi-Fi văn phòng dù đã khởi động lại")),
  });
  assert.equal(first.status, 202);
  const accepted = await first.json();
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.queued, true);
  assert.equal(accepted.duplicate, false);

  let guided;
  try {
    guided = await waitFor(async () => {
      const db = JSON.parse(await fs.readFile(dataFile, "utf8"));
      return db.tickets?.length === 0 && botRequests.length === 1 && aiRequests.length >= 1 ? db : null;
    }, "Zalo Bot did not return generative guidance");
  } catch (error) {
    const debugDb = JSON.parse(await fs.readFile(dataFile, "utf8"));
    error.message += `; aiRequests=${aiRequests.length}; botRequests=${botRequests.length}; botText=${JSON.stringify(botRequests.at(-1)?.body?.text)}; tickets=${debugDb.tickets?.length}; audit=${JSON.stringify(debugDb.auditLog?.slice(-3))}; urls=${JSON.stringify([...aiRequests, ...botRequests].map((item) => item.url))}\n${logs.join("")}`;
    throw error;
  }
  assert.equal(guided.tickets.length, 0);
  assert.equal(guided.users.length, 1);
  assert.equal(guided.users[0].zaloUserId, "bot:zalo-bot-user-1");
  assert.match(botRequests[0].url, /^\/bottest-bot-token\/sendMessage$/);
  assert.equal(botRequests[0].body.chat_id, "zalo-private-chat-1");
  assert.match(botRequests[0].body.text, /Gợi ý AI thử nghiệm/);
  assert.match(botRequests[0].body.text, /Quên mạng/);
  assert.ok(guided.auditLog.some((entry) => entry.action === "zalo_bot_inbox_completed" && entry.entityId === "message-001"));

  const duplicate = await fetch(`${baseUrl}/api/webhooks/zalo-bot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bot-Api-Secret-Token": "test-bot-secret" },
    body: JSON.stringify(webhookPayload("message-001", "Laptop không thể kết nối Wi-Fi văn phòng dù đã khởi động lại")),
  });
  assert.equal(duplicate.status, 202);
  const duplicateResult = await duplicate.json();
  assert.equal(duplicateResult.queued, false);
  assert.equal(duplicateResult.duplicate, true);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(botRequests.length, 1);

  const unresolved = await fetch(`${baseUrl}/api/webhooks/zalo-bot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bot-Api-Secret-Token": "test-bot-secret" },
    body: JSON.stringify(webhookPayload("message-002", "Tôi đã thử nhưng vẫn chưa được")),
  });
  assert.equal(unresolved.status, 202);
  const stored = await waitFor(async () => {
    const db = JSON.parse(await fs.readFile(dataFile, "utf8"));
    return db.tickets?.length === 1 && botRequests.length === 2 ? db : null;
  }, `Zalo Bot did not create and acknowledge the ticket after self-service failed:\n${logs.join("")}`);
  assert.equal(stored.tickets.length, 1);
  assert.equal(stored.tickets[0].status, "open");
  assert.equal(stored.tickets[0].aiHandoffLocked, true);
  assert.match(stored.tickets[0].description, /Nguồn: Zalo Chat Bot/);
  assert.match(stored.tickets[0].description, /Laptop không thể kết nối Wi-Fi/);
  assert.equal(stored.messages.length, 2);
  assert.match(botRequests.at(-1).body.text, new RegExp(stored.tickets[0].code));

  const followUp = await fetch(`${baseUrl}/api/webhooks/zalo-bot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bot-Api-Secret-Token": "test-bot-secret" },
    body: JSON.stringify(webhookPayload("message-003", "Tôi bổ sung: lỗi xuất hiện từ sáng nay tại tầng 2")),
  });
  assert.equal(followUp.status, 202);
  const updated = await waitFor(async () => {
    const db = JSON.parse(await fs.readFile(dataFile, "utf8"));
    return db.messages?.length === 3 && botRequests.length === 3 ? db : null;
  }, `Zalo Bot did not append to the existing ticket:\n${logs.join("")}`);
  assert.equal(updated.tickets.length, 1);
  assert.match(updated.messages.at(-1).body, /lỗi xuất hiện từ sáng nay/);
  assert.match(botRequests.at(-1).body.text, new RegExp(updated.tickets[0].code));
});
