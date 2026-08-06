import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(backendRoot, ".env");

try {
  const stat = fs.statSync(envFile);
  if (stat.size > 1024 * 1024) {
    throw new Error(`backend/.env is unexpectedly large (${stat.size} bytes). Repair it before starting the backend.`);
  }
  const raw = fs.readFileSync(envFile, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  // .env is optional when the file does not exist.
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function enumEnv(name, allowed, fallback) {
  const value = String(process.env[name] || "").trim().toLowerCase();
  return allowed.includes(value) ? value : fallback;
}

function booleanEnv(name, fallback) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function slaPolicy(priority, firstResponse, resolution) {
  const key = priority.toUpperCase();
  return {
    firstResponseMinutes: numberEnv(`SLA_${key}_FIRST_RESPONSE_MINUTES`, firstResponse),
    resolutionMinutes: numberEnv(`SLA_${key}_RESOLUTION_MINUTES`, resolution),
  };
}

export const config = {
  port: numberEnv("PORT", 8080),
  nodeEnv: process.env.NODE_ENV || "development",
  appSecret: process.env.APP_SECRET || "dev-only-secret-change-me",
  adminPassword: process.env.ADMIN_PASSWORD || "ChangeMeNow!",
  technicianPassword: process.env.TECHNICIAN_PASSWORD || "",
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173,https://h5.zdn.vn")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  dbProvider: enumEnv("DB_PROVIDER", ["json", "sqlserver"], "json"),
  dataFile: path.resolve(backendRoot, process.env.DATA_FILE || "./data/db.json"),
  uploadsDir: path.resolve(backendRoot, process.env.UPLOADS_DIR || "./data/uploads"),

  // SQL Server storage. SQL authentication is the simplest local setup.
  // NTLM is supported when user, password and domain are supplied.
  sqlServerHost: process.env.SQLSERVER_HOST || "localhost",
  sqlServerPort: numberEnv("SQLSERVER_PORT", 1433),
  sqlServerInstance: String(process.env.SQLSERVER_INSTANCE || "").trim(),
  sqlServerDatabase: process.env.SQLSERVER_DATABASE || "ZaloHelpDesk",
  sqlServerAuth: enumEnv("SQLSERVER_AUTH", ["sql", "ntlm"], "sql"),
  sqlServerUser: process.env.SQLSERVER_USER || "",
  sqlServerPassword: process.env.SQLSERVER_PASSWORD || "",
  sqlServerDomain: process.env.SQLSERVER_DOMAIN || "",
  sqlServerEncrypt: booleanEnv("SQLSERVER_ENCRYPT", false),
  sqlServerTrustServerCertificate: booleanEnv("SQLSERVER_TRUST_SERVER_CERTIFICATE", true),
  sqlServerConnectionTimeoutMs: numberEnv("SQLSERVER_CONNECTION_TIMEOUT_MS", 15000),
  sqlServerRequestTimeoutMs: numberEnv("SQLSERVER_REQUEST_TIMEOUT_MS", 30000),
  sqlServerPoolMax: numberEnv("SQLSERVER_POOL_MAX", 10),
  sqlServerPoolMin: numberEnv("SQLSERVER_POOL_MIN", 0),
  sqlServerPoolIdleTimeoutMs: numberEnv("SQLSERVER_POOL_IDLE_TIMEOUT_MS", 30000),
  // Large uploads use multipart/form-data so file bytes are streamed to disk.
  // File size is inclusive: a file of exactly 30 MB is accepted.
  maxAttachmentBytes: numberEnv("MAX_ATTACHMENT_MB", 30) * 1024 * 1024,
  maxReplyUploadBytes: numberEnv("MAX_REPLY_UPLOAD_MB", 120) * 1024 * 1024,
  maxLegacyJsonUploadBytes: numberEnv("MAX_LEGACY_JSON_UPLOAD_MB", 32) * 1024 * 1024,
  maxAttachmentsPerTicket: numberEnv("MAX_ATTACHMENTS_PER_TICKET", 8),
  maxAttachmentsPerReply: numberEnv("MAX_ATTACHMENTS_PER_REPLY", 4),
  sessionTtlHours: numberEnv("SESSION_TTL_HOURS", 168),
  reopenWindowDays: numberEnv("REOPEN_WINDOW_DAYS", 14),
  notificationPollSeconds: numberEnv("NOTIFICATION_POLL_SECONDS", 20),
  overdueCheckSeconds: numberEnv("OVERDUE_CHECK_SECONDS", 60),
  zaloAuthMode: enumEnv("ZALO_AUTH_MODE", ["development", "remote"], "development"),
  zaloTokenVerifyUrl: process.env.ZALO_TOKEN_VERIFY_URL || "",
  zaloVerifyTimeoutMs: numberEnv("ZALO_VERIFY_TIMEOUT_MS", 7000),

  sla: {
    low: slaPolicy("low", 480, 4320),
    normal: slaPolicy("normal", 240, 1440),
    high: slaPolicy("high", 120, 480),
    urgent: slaPolicy("urgent", 30, 240),
  },

  // Zero-cost agent: rules is always available. Ollama is optional and runs locally.
  agentMode: enumEnv("AGENT_MODE", ["rules", "ollama"], "rules"),
  autoResolveThreshold: numberEnv("AUTO_RESOLVE_THRESHOLD", 0.78),
  agentStrictEscalation: enumEnv("AGENT_STRICT_ESCALATION", ["true", "false"], "true") === "true",
  agentRequirePlaybook: enumEnv("AGENT_REQUIRE_PLAYBOOK", ["true", "false"], "true") === "true",
  agentMinConfidence: numberEnv("AGENT_MIN_CONFIDENCE", 0.82),
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, ""),
  ollamaModel: process.env.OLLAMA_MODEL || "qwen3.5:9b",
  ollamaTimeoutMs: numberEnv("OLLAMA_TIMEOUT_MS", 180000),
  ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE || "10m",
  ollamaTemperature: numberEnv("OLLAMA_TEMPERATURE", 0.1),
  ollamaNumCtx: numberEnv("OLLAMA_NUM_CTX", 8192),
  agentHistoryMessages: numberEnv("AGENT_HISTORY_MESSAGES", 12),
  agentStatusCacheMs: numberEnv("AGENT_STATUS_CACHE_MS", 10000),

  // Enterprise playbook / local RAG. Raw device configs are never indexed.
  playbookEnabled: enumEnv("PLAYBOOK_ENABLED", ["true", "false"], "true") === "true",
  playbookFile: path.resolve(backendRoot, process.env.PLAYBOOK_FILE || "./playbooks/enterprise-playbook.json"),
  playbookIndexFile: path.resolve(backendRoot, process.env.PLAYBOOK_INDEX_FILE || "./data/playbook-index.json"),
  playbookSemantic: enumEnv("PLAYBOOK_SEMANTIC", ["true", "false"], "true") === "true",
  playbookAutoIndex: enumEnv("PLAYBOOK_AUTO_INDEX", ["true", "false"], "false") === "true",
  playbookEmbedModel: process.env.PLAYBOOK_EMBED_MODEL || "embeddinggemma",
  playbookEmbedTimeoutMs: numberEnv("PLAYBOOK_EMBED_TIMEOUT_MS", 120000),
  playbookEmbedBatchSize: numberEnv("PLAYBOOK_EMBED_BATCH_SIZE", 12),
  playbookTopK: numberEnv("PLAYBOOK_TOP_K", 5),
  playbookMinScore: numberEnv("PLAYBOOK_MIN_SCORE", 0.2),
  playbookAutoMinScore: numberEnv("PLAYBOOK_AUTO_MIN_SCORE", 0.72),
  playbookLexicalWeight: numberEnv("PLAYBOOK_LEXICAL_WEIGHT", 0.35),
  playbookMaxEntryChars: numberEnv("PLAYBOOK_MAX_ENTRY_CHARS", 10000),
  playbookGovernanceEnabled: booleanEnv("PLAYBOOK_GOVERNANCE_ENABLED", true),
  playbookGovernanceCacheMs: numberEnv("PLAYBOOK_GOVERNANCE_CACHE_MS", 5000),
  playbookAutoReindexOnPublish: booleanEnv("PLAYBOOK_AUTO_REINDEX_ON_PUBLISH", true),

  backendRoot,
};
