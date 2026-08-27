import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createFilesystemAttachmentStorage, createSupabaseAttachmentStorage } from "../src/attachment-storage.mjs";
import { config, runtimeConfigIssues } from "../src/config.mjs";
import { enforceRequestRateLimit, resetRateLimitsForTests } from "../src/rate-limit.mjs";
import { createPostgresStateAdapter } from "../src/store-postgres.mjs";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(backendRoot, "..");

function validHostedConfig(overrides = {}) {
  return {
    ...config,
    deploymentProfile: "free-hosting",
    nodeEnv: "production",
    appSecret: "a".repeat(48),
    adminPassword: "StrongBootstrap2026",
    legacyStaffLoginEnabled: true,
    allowedOrigins: ["https://h5.zdn.vn"],
    zaloAuthMode: "zalo",
    zaloAppSecret: "zalo-secret",
    zaloMiniAppId: "4185582976193315701",
    zaloOpenApiKey: "test-only-open-api-key",
    aiCloudEnabled: false,
    aiRedactionEnabled: true,
    dbProvider: "postgres",
    postgresUrl: "postgresql://example.invalid/helpdesk",
    attachmentStorageProvider: "supabase",
    supabaseUrl: "https://project.supabase.co",
    supabaseSecretKey: "sb_secret_example",
    supabaseStorageBucket: "helpdesk-attachments",
    ...overrides,
  };
}

test("hosted profiles reject wildcard CORS, development identity and ephemeral storage", () => {
  const issues = runtimeConfigIssues(validHostedConfig({
    allowedOrigins: ["*"],
    zaloAuthMode: "development",
    attachmentStorageProvider: "filesystem",
  }));
  assert.deepEqual(issues.filter((item) => item.severity === "error").map((item) => item.code).sort(), [
    "cors", "free-attachments", "zalo-auth",
  ]);
  assert.equal(runtimeConfigIssues(validHostedConfig()).filter((item) => item.severity === "error").length, 0);
});

test("hosted automatic Zalo Bot registration requires the exact public HTTPS webhook route", () => {
  const base = {
    zaloBotEnabled: true,
    zaloBotToken: "test-bot-token",
    zaloBotWebhookSecret: "test-webhook-secret",
    zaloBotAutoRegisterWebhook: true,
  };
  const invalid = runtimeConfigIssues(validHostedConfig({
    ...base,
    zaloBotWebhookUrl: "http://helpdesk.example/api/webhooks/zalo-bot?secret=unsafe",
  }));
  assert.ok(invalid.some((item) => item.code === "zalo-bot-webhook-url"));
  const valid = runtimeConfigIssues(validHostedConfig({
    ...base,
    zaloBotWebhookUrl: "https://helpdesk.example/api/webhooks/zalo-bot",
  }));
  assert.equal(valid.filter((item) => item.severity === "error").length, 0);
});

test("v5.15.1 retention defaults enforce the approved global and attachment caps", () => {
  assert.equal(config.maxStoredTickets, 30);
  assert.equal(config.maxTicketAttachmentBytes, 10 * 1024 * 1024);
  assert.ok(config.maxAttachmentBytes <= config.maxTicketAttachmentBytes);
  assert.ok(config.maxReplyUploadBytes <= config.maxTicketAttachmentBytes);
});

test("write rate limiter is bounded by client and returns a retry window", () => {
  const original = {
    enabled: config.rateLimitEnabled,
    max: config.rateLimitAuthMax,
    window: config.rateLimitWindowSeconds,
  };
  config.rateLimitEnabled = true;
  config.rateLimitAuthMax = 2;
  config.rateLimitWindowSeconds = 60;
  resetRateLimitsForTests();
  const request = { method: "POST", headers: { "x-forwarded-for": "203.0.113.10" }, socket: {} };
  try {
    enforceRequestRateLimit(request, "/api/auth/zalo", 1_000);
    enforceRequestRateLimit(request, "/api/auth/zalo", 1_000);
    assert.throws(
      () => enforceRequestRateLimit(request, "/api/auth/zalo", 1_000),
      (error) => error.status === 429 && error.retryAfterSeconds === 60,
    );
  } finally {
    config.rateLimitEnabled = original.enabled;
    config.rateLimitAuthMax = original.max;
    config.rateLimitWindowSeconds = original.window;
    resetRateLimitsForTests();
  }
});

class FakePostgresPool {
  constructor() {
    this.state = {};
    this.revision = 0;
    this.updatedAt = new Date();
    this.closed = false;
  }

  row(state = this.state, revision = this.revision) {
    return { rows: [{ state: structuredClone(state), revision, updated_at: this.updatedAt }] };
  }

  async query(statement) {
    if (/SELECT revision, state/.test(statement)) return this.row();
    return { rows: [] };
  }

  async connect() {
    let working = null;
    let revision = this.revision;
    return {
      query: async (statement, params = []) => {
        if (statement === "BEGIN") { working = structuredClone(this.state); return { rows: [] }; }
        if (/SELECT revision, state/.test(statement)) return this.row(working, revision);
        if (/UPDATE public\.helpdesk_runtime_state/.test(statement)) {
          working = JSON.parse(params[1]);
          revision += 1;
          return { rows: [] };
        }
        if (statement === "COMMIT") {
          this.state = structuredClone(working);
          this.revision = revision;
          this.updatedAt = new Date();
          return { rows: [] };
        }
        if (statement === "ROLLBACK") return { rows: [] };
        throw new Error(`Unexpected SQL in fake pool: ${statement}`);
      },
      release() {},
    };
  }

  async end() { this.closed = true; }
}

test("PostgreSQL state adapter serializes mutations and reports revision/counts", async () => {
  const pool = new FakePostgresPool();
  const adapter = createPostgresStateAdapter(pool);
  await adapter.initializeStore();
  await Promise.all([
    adapter.updateDb(async (db) => { await new Promise((resolve) => setTimeout(resolve, 10)); db.tickets.push({ id: "t1" }); }),
    adapter.updateDb((db) => db.messages.push({ id: "m1" })),
  ]);
  const snapshot = await adapter.readDb();
  assert.equal(snapshot.tickets.length, 1);
  assert.equal(snapshot.messages.length, 1);
  const status = await adapter.getStoreStatus();
  assert.equal(status.ready, true);
  assert.equal(status.provider, "postgres");
  assert.equal(status.revision, 2);
  assert.equal(status.counts.tickets, 1);
  await adapter.closeStore();
  assert.equal(pool.closed, true);
});

test("filesystem and Supabase storage adapters preserve private attachment bytes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "helpdesk-v515-storage-"));
  try {
    const filesystem = createFilesystemAttachmentStorage({ backendRoot: root, uploadsDir: path.join(root, "data", "uploads") });
    const filesystemPath = filesystem.buildStoragePath("ticket-1", "attachment.txt");
    await filesystem.putBuffer(filesystemPath, Buffer.from("filesystem"), "text/plain");
    assert.equal((await filesystem.read(filesystemPath)).toString(), "filesystem");
    await filesystem.remove(filesystemPath);

    const objects = new Map();
    const fakeClient = {
      storage: {
        from(bucket) {
          assert.equal(bucket, "helpdesk-attachments");
          return {
            async upload(key, body) { objects.set(key, Buffer.from(body)); return { error: null }; },
            async download(key) { return { data: new Blob([objects.get(key)]), error: null }; },
            async remove(keys) { keys.forEach((key) => objects.delete(key)); return { error: null }; },
          };
        },
      },
    };
    const supabase = createSupabaseAttachmentStorage({ client: fakeClient, bucket: "helpdesk-attachments" });
    const objectPath = supabase.buildStoragePath("ticket-2", "attachment.txt");
    await supabase.putBuffer(objectPath, Buffer.from("object-storage"), "text/plain");
    assert.equal((await supabase.read(objectPath)).toString(), "object-storage");
    await supabase.remove(objectPath);
    assert.equal(objects.size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deployment manifests are non-secret, persistent and opt-in", async () => {
  const [dockerfile, render, nas, sqlBootstrap, postgresSchema] = await Promise.all([
    readFile(path.join(backendRoot, "Dockerfile"), "utf8"),
    readFile(path.join(repositoryRoot, "render.yaml"), "utf8"),
    readFile(path.join(repositoryRoot, "deploy", "nas", "compose.yaml"), "utf8"),
    readFile(path.join(backendRoot, "sql", "000_create_database_template.sql"), "utf8"),
    readFile(path.join(backendRoot, "sql", "postgres", "001_state_store.sql"), "utf8"),
  ]);
  assert.equal((dockerfile.match(/FROM node:22-alpine/g) ?? []).length, 2);
  assert.doesNotMatch(dockerfile, /FROM node:20/);
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.match(dockerfile, /USER node/);
  assert.doesNotMatch(dockerfile, /COPY data/);
  assert.match(dockerfile, /CMD \["sh", "-c", "npm run db:postgres:init && exec npm start"\]/);
  assert.match(render, /plan: free/);
  assert.match(render, /autoDeployTrigger: off/);
  assert.doesNotMatch(render, /dockerCommand:/);
  assert.match(render, /key: MAX_STORED_TICKETS\n\s+value: "30"/);
  assert.match(render, /key: MAX_TICKET_ATTACHMENT_MB\n\s+value: "10"/);
  for (const key of ["POSTGRES_URL", "SUPABASE_SECRET_KEY", "ZALO_APP_SECRET", "ZALO_BOT_TOKEN", "ZALO_BOT_WEBHOOK_SECRET", "ADMIN_PASSWORD"]) {
    assert.match(render, new RegExp(`key: ${key}\\n\\s+sync: false`));
  }
  assert.match(nas, /helpdesk_data:\/app\/data/);
  assert.match(nas, /read_only: true/);
  assert.match(sqlBootstrap, /PASSWORD = 'CHANGE_ME_STRONG_SQL_PASSWORD'/);
  assert.match(postgresSchema, /REVOKE ALL ON TABLE public\.helpdesk_runtime_state FROM PUBLIC/);
  assert.match(postgresSchema, /ENABLE ROW LEVEL SECURITY/);
});
