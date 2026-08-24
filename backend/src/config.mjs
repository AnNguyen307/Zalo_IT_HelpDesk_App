import fs from "node:fs";
import os from "node:os";
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

function outputTokenEnv(name, fallback = 4096) {
  return Math.max(4096, Math.trunc(numberEnv(name, fallback)));
}

function openRouterModelEnv() {
  const model = String(process.env.OPENROUTER_MODEL || "openrouter/free").trim();
  // OpenRouter retired this free GPT-OSS slug. Keep existing Render/NAS
  // environments working by treating it as a compatibility alias for the
  // provider-maintained free router instead of returning HTTP 404 forever.
  return !model || model === "openai/gpt-oss-120b:free" ? "openrouter/free" : model;
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

function timeMinuteEnv(name, fallback) {
  const match = String(process.env[name] || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : fallback;
}

function numberListEnv(name, fallback) {
  const values = String(process.env[name] || "").split(",").map((value) => value.trim()).filter(Boolean).map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return values.length ? [...new Set(values)] : fallback;
}

function stringListEnv(name, allowed, fallback) {
  const values = String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => allowed.includes(value));
  return values.length ? [...new Set(values)] : fallback;
}

function slaPolicy(priority, firstResponse, resolution) {
  const key = priority.toUpperCase();
  return {
    firstResponseMinutes: numberEnv(`SLA_${key}_FIRST_RESPONSE_MINUTES`, firstResponse),
    resolutionMinutes: numberEnv(`SLA_${key}_RESOLUTION_MINUTES`, resolution),
  };
}

const legacyAgentMode = enumEnv("AGENT_MODE", ["rules"], "rules");
const aiProviderKeys = ["rules", "gemini", "groq", "openrouter", "sambanova"];
const aiProvider = enumEnv("AI_PROVIDER", aiProviderKeys, legacyAgentMode);
const aiProviderOrder = stringListEnv(
  "AI_PROVIDER_ORDER",
  aiProviderKeys.filter((value) => value !== "rules"),
  ["gemini", "groq", "openrouter", "sambanova"],
);
const playbookEmbedProvider = enumEnv("PLAYBOOK_EMBED_PROVIDER", ["none", "gemini"], "none");
const legacyPlaybookSemantic = booleanEnv("PLAYBOOK_SEMANTIC", false);
const playbookRetrievalMode = enumEnv(
  "PLAYBOOK_RETRIEVAL_MODE",
  ["lexical", "hybrid"],
  legacyPlaybookSemantic ? "hybrid" : "lexical",
);
const maxStoredTickets = Math.min(30, Math.max(1, Math.trunc(numberEnv("MAX_STORED_TICKETS", 30))));
const maxTicketAttachmentMb = Math.min(10, Math.max(1, numberEnv("MAX_TICKET_ATTACHMENT_MB", 10)));

export const config = {
  port: numberEnv("PORT", 8080),
  nodeEnv: process.env.NODE_ENV || "development",
  deploymentProfile: enumEnv("DEPLOYMENT_PROFILE", ["local", "free-hosting", "nas"], "local"),
  appSecret: process.env.APP_SECRET || "dev-only-secret-change-me",
  adminPassword: process.env.ADMIN_PASSWORD || "ChangeMeNow!",
  technicianPassword: process.env.TECHNICIAN_PASSWORD || "",
  legacyStaffLoginEnabled: booleanEnv("LEGACY_STAFF_LOGIN_ENABLED", true),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173,https://h5.zdn.vn")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  dbProvider: enumEnv("DB_PROVIDER", ["json", "sqlserver", "postgres"], "json"),
  dataFile: path.resolve(backendRoot, process.env.DATA_FILE || "./data/db.json"),
  uploadsDir: path.resolve(backendRoot, process.env.UPLOADS_DIR || "./data/uploads"),

  // PostgreSQL state-document adapter for the free-hosting pilot. SQL Server
  // remains the normalized enterprise store used by the NAS profile.
  postgresUrl: process.env.POSTGRES_URL || process.env.DATABASE_URL || "",
  postgresSslMode: enumEnv("POSTGRES_SSL_MODE", ["disable", "require", "verify-full"], "require"),
  postgresPoolMax: numberEnv("POSTGRES_POOL_MAX", 4),
  postgresConnectionTimeoutMs: numberEnv("POSTGRES_CONNECTION_TIMEOUT_MS", 15000),
  postgresIdleTimeoutMs: numberEnv("POSTGRES_IDLE_TIMEOUT_MS", 30000),
  postgresStatementTimeoutMs: numberEnv("POSTGRES_STATEMENT_TIMEOUT_MS", 30000),

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
  attachmentStorageProvider: enumEnv("ATTACHMENT_STORAGE_PROVIDER", ["filesystem", "supabase"], "filesystem"),
  attachmentTempDir: path.resolve(process.env.ATTACHMENT_TEMP_DIR || path.join(os.tmpdir(), "zalo-helpdesk-uploads")),
  supabaseUrl: String(process.env.SUPABASE_URL || "").replace(/\/$/, ""),
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || "",
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || "helpdesk-attachments",
  // Retention guardrails are hard-capped for the free-tier pilot. Environment
  // values may lower these limits, but cannot raise them above 30 tickets or
  // 10 MB of attachments per ticket.
  maxStoredTickets,
  maxTicketAttachmentBytes: maxTicketAttachmentMb * 1024 * 1024,
  // Large uploads use multipart/form-data so file bytes are streamed to disk.
  // A single upload/reply can never exceed the ticket's total 10 MB budget.
  maxAttachmentBytes: Math.min(Math.max(1, numberEnv("MAX_ATTACHMENT_MB", 10)), maxTicketAttachmentMb) * 1024 * 1024,
  maxReplyUploadBytes: Math.min(Math.max(1, numberEnv("MAX_REPLY_UPLOAD_MB", 10)), maxTicketAttachmentMb) * 1024 * 1024,
  maxLegacyJsonUploadBytes: numberEnv("MAX_LEGACY_JSON_UPLOAD_MB", 32) * 1024 * 1024,
  maxAttachmentsPerTicket: numberEnv("MAX_ATTACHMENTS_PER_TICKET", 8),
  maxAttachmentsPerReply: numberEnv("MAX_ATTACHMENTS_PER_REPLY", 4),
  rateLimitEnabled: booleanEnv("RATE_LIMIT_ENABLED", true),
  rateLimitWindowSeconds: numberEnv("RATE_LIMIT_WINDOW_SECONDS", 60),
  rateLimitAuthMax: numberEnv("RATE_LIMIT_AUTH_MAX", 120),
  rateLimitInviteMax: numberEnv("RATE_LIMIT_INVITE_MAX", 10),
  rateLimitWriteMax: numberEnv("RATE_LIMIT_WRITE_MAX", 240),
  rateLimitUploadMax: numberEnv("RATE_LIMIT_UPLOAD_MAX", 60),
  rateLimitMaxKeys: numberEnv("RATE_LIMIT_MAX_KEYS", 10000),
  sessionTtlHours: numberEnv("SESSION_TTL_HOURS", 168),
  userAccessTtlMinutes: Math.min(60, Math.max(5, numberEnv("USER_ACCESS_TTL_MINUTES", 60))),
  userRefreshTtlDays: Math.min(90, Math.max(1, numberEnv("USER_REFRESH_TTL_DAYS", 90))),
  userInviteTtlHours: Math.min(168, Math.max(1, numberEnv("USER_INVITE_TTL_HOURS", 24))),
  reopenWindowDays: numberEnv("REOPEN_WINDOW_DAYS", 14),
  notificationPollSeconds: numberEnv("NOTIFICATION_POLL_SECONDS", 20),
  overdueCheckSeconds: numberEnv("OVERDUE_CHECK_SECONDS", 60),
  zaloAuthMode: enumEnv("ZALO_AUTH_MODE", ["development", "remote", "zalo"], "development"),
  zaloTokenVerifyUrl: process.env.ZALO_TOKEN_VERIFY_URL || "",
  zaloAppSecret: process.env.ZALO_APP_SECRET || "",
  zaloMiniAppId: String(process.env.ZALO_MINI_APP_ID || "").trim(),
  zaloOpenApiKey: String(process.env.ZALO_OPEN_API_KEY || "").trim(),
  zaloProfileUrl: process.env.ZALO_PROFILE_URL || "https://graph.zalo.me/v2.0/me",
  zaloVerifyTimeoutMs: numberEnv("ZALO_VERIFY_TIMEOUT_MS", 7000),

  sla: {
    low: slaPolicy("low", 480, 4320),
    normal: slaPolicy("normal", 240, 1440),
    high: slaPolicy("high", 120, 480),
    urgent: slaPolicy("urgent", 30, 240),
  },
  slaBusiness: {
    timeZone: process.env.SLA_TIME_ZONE || "Asia/Ho_Chi_Minh",
    workDays: numberListEnv("SLA_WORK_DAYS", [1, 2, 3, 4, 5]),
    startMinute: timeMinuteEnv("SLA_WORK_START", 8 * 60),
    endMinute: timeMinuteEnv("SLA_WORK_END", 17 * 60 + 30),
    holidays: String(process.env.SLA_HOLIDAYS || "").split(",").map((value) => value.trim()).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
  },

  // AI Router V2: AGENT_MODE=rules remains a rollback-compatible alias.
  agentMode: legacyAgentMode,
  aiProvider,
  aiRouterEnabled: booleanEnv("AI_ROUTER_ENABLED", true),
  aiProviderOrder,
  aiRoutingPolicy: enumEnv("AI_ROUTING_POLICY", ["fixed", "capability_then_free_quota"], "capability_then_free_quota"),
  aiCloudEnabled: booleanEnv("AI_CLOUD_ENABLED", false),
  aiRedactionEnabled: booleanEnv("AI_REDACTION_ENABLED", false),
  aiQualityRetentionDays: numberEnv("AI_QUALITY_RETENTION_DAYS", 180),
  aiProviderRetries: numberEnv("AI_PROVIDER_RETRIES", 1),
  aiCircuitFailureThreshold: numberEnv("AI_CIRCUIT_FAILURE_THRESHOLD", 2),
  aiCircuitCooldownMs: numberEnv("AI_CIRCUIT_COOLDOWN_MS", 60000),
  autoResolveThreshold: numberEnv("AUTO_RESOLVE_THRESHOLD", 0.78),
  agentStrictEscalation: enumEnv("AGENT_STRICT_ESCALATION", ["true", "false"], "true") === "true",
  agentRequirePlaybook: enumEnv("AGENT_REQUIRE_PLAYBOOK", ["true", "false"], "true") === "true",
  agentMinConfidence: numberEnv("AGENT_MIN_CONFIDENCE", 0.82),
  geminiBaseUrl: (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, ""),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
  geminiTimeoutMs: numberEnv("GEMINI_TIMEOUT_MS", 60000),
  geminiTemperature: numberEnv("GEMINI_TEMPERATURE", 0.1),
  geminiMaxOutputTokens: outputTokenEnv("GEMINI_MAX_OUTPUT_TOKENS"),
  geminiEnabled: booleanEnv("GEMINI_ENABLED", true),
  geminiDailyRequestLimit: numberEnv("GEMINI_DAILY_REQUEST_LIMIT", 0),
  geminiDailyTokenLimit: numberEnv("GEMINI_DAILY_TOKEN_LIMIT", 0),
  groqEnabled: booleanEnv("GROQ_ENABLED", false),
  groqBaseUrl: (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  groqTimeoutMs: numberEnv("GROQ_TIMEOUT_MS", 60000),
  groqTemperature: numberEnv("GROQ_TEMPERATURE", 0.1),
  groqMaxOutputTokens: outputTokenEnv("GROQ_MAX_OUTPUT_TOKENS"),
  groqDailyRequestLimit: numberEnv("GROQ_DAILY_REQUEST_LIMIT", 1000),
  groqDailyTokenLimit: numberEnv("GROQ_DAILY_TOKEN_LIMIT", 200000),
  openrouterEnabled: booleanEnv("OPENROUTER_ENABLED", false),
  openrouterBaseUrl: (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
  openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
  openrouterModel: openRouterModelEnv(),
  openrouterTimeoutMs: numberEnv("OPENROUTER_TIMEOUT_MS", 60000),
  openrouterTemperature: numberEnv("OPENROUTER_TEMPERATURE", 0.1),
  openrouterMaxOutputTokens: outputTokenEnv("OPENROUTER_MAX_OUTPUT_TOKENS"),
  openrouterDailyRequestLimit: numberEnv("OPENROUTER_DAILY_REQUEST_LIMIT", 50),
  openrouterDailyTokenLimit: numberEnv("OPENROUTER_DAILY_TOKEN_LIMIT", 0),
  sambanovaEnabled: booleanEnv("SAMBANOVA_ENABLED", false),
  sambanovaBaseUrl: (process.env.SAMBANOVA_BASE_URL || "https://api.sambanova.ai/v1").replace(/\/$/, ""),
  sambanovaApiKey: process.env.SAMBANOVA_API_KEY || "",
  sambanovaModel: process.env.SAMBANOVA_MODEL || "DeepSeek-V3.2",
  sambanovaTimeoutMs: numberEnv("SAMBANOVA_TIMEOUT_MS", 60000),
  sambanovaTemperature: numberEnv("SAMBANOVA_TEMPERATURE", 0.1),
  sambanovaMaxOutputTokens: outputTokenEnv("SAMBANOVA_MAX_OUTPUT_TOKENS"),
  sambanovaDailyRequestLimit: numberEnv("SAMBANOVA_DAILY_REQUEST_LIMIT", 20),
  sambanovaDailyTokenLimit: numberEnv("SAMBANOVA_DAILY_TOKEN_LIMIT", 200000),
  agentHistoryMessages: numberEnv("AGENT_HISTORY_MESSAGES", 12),
  agentStatusCacheMs: numberEnv("AGENT_STATUS_CACHE_MS", 10000),

  // Enterprise playbook / local RAG. Raw device configs are never indexed.
  playbookEnabled: enumEnv("PLAYBOOK_ENABLED", ["true", "false"], "true") === "true",
  playbookFile: path.resolve(backendRoot, process.env.PLAYBOOK_FILE || "./playbooks/enterprise-playbook.json"),
  playbookIndexFile: path.resolve(backendRoot, process.env.PLAYBOOK_INDEX_FILE || "./data/playbook-index.json"),
  playbookRetrievalMode,
  playbookSemantic: playbookRetrievalMode === "hybrid",
  playbookAutoIndex: enumEnv("PLAYBOOK_AUTO_INDEX", ["true", "false"], "false") === "true",
  playbookEmbedProvider,
  playbookEmbedModel: process.env.PLAYBOOK_EMBED_MODEL
    || (playbookEmbedProvider === "gemini" ? "gemini-embedding-001" : "none"),
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

function issue(code, message, severity = "error") {
  return { code, message, severity };
}

function isHttpsUrl(value) {
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}

export function runtimeConfigIssues(candidate = config) {
  if (candidate.deploymentProfile === "local") return [];

  const issues = [];
  if (candidate.nodeEnv !== "production") {
    issues.push(issue("node-env", "NODE_ENV must be production outside the local profile."));
  }
  if (!candidate.appSecret || candidate.appSecret === "dev-only-secret-change-me" || candidate.appSecret.length < 32) {
    issues.push(issue("app-secret", "APP_SECRET must be a non-default value with at least 32 characters."));
  }
  if (!candidate.allowedOrigins.length || candidate.allowedOrigins.includes("*")) {
    issues.push(issue("cors", "ALLOWED_ORIGINS must be an explicit allowlist; wildcard origins are not accepted."));
  }
  if (candidate.zaloAuthMode === "development") {
    issues.push(issue("zalo-auth", "ZALO_AUTH_MODE=development cannot be exposed by a hosted deployment."));
  }
  if (candidate.zaloAuthMode === "remote" && !isHttpsUrl(candidate.zaloTokenVerifyUrl)) {
    issues.push(issue("zalo-verifier", "Remote Zalo authentication requires an HTTPS ZALO_TOKEN_VERIFY_URL."));
  }
  if (candidate.zaloAuthMode === "zalo" && !candidate.zaloAppSecret) {
    issues.push(issue("zalo-app-secret", "Direct Zalo authentication requires ZALO_APP_SECRET on the backend."));
  }
  if (candidate.zaloAuthMode === "zalo") {
    try {
      const profileUrl = new URL(candidate.zaloProfileUrl);
      if (profileUrl.protocol !== "https:" || profileUrl.hostname !== "graph.zalo.me") throw new Error("invalid");
    } catch {
      issues.push(issue("zalo-profile-url", "Hosted direct authentication only sends tokens to https://graph.zalo.me."));
    }
  }
  if (!candidate.zaloMiniAppId) {
    issues.push(issue("zalo-mini-app-id", "ZALO_MINI_APP_ID is required for the consent-revocation webhook."));
  }
  if (!candidate.zaloOpenApiKey) {
    issues.push(issue("zalo-open-api-key", "Set ZALO_OPEN_API_KEY after Zalo generates it; signed webhook POSTs remain disabled until then.", "warning"));
  }
  if (candidate.aiCloudEnabled && !candidate.aiRedactionEnabled) {
    issues.push(issue("ai-redaction", "AI_REDACTION_ENABLED must be true when cloud AI is enabled."));
  }
  if (candidate.legacyStaffLoginEnabled) {
    if (!candidate.adminPassword || candidate.adminPassword === "ChangeMeNow!" || candidate.adminPassword.length < 12) {
      issues.push(issue("legacy-admin-password", "Legacy staff login requires a non-default ADMIN_PASSWORD with at least 12 characters."));
    } else {
      issues.push(issue("legacy-staff-login", "Disable LEGACY_STAFF_LOGIN_ENABLED after creating a named Admin account.", "warning"));
    }
  }

  if (candidate.deploymentProfile === "free-hosting") {
    if (candidate.dbProvider !== "postgres") {
      issues.push(issue("free-database", "The free-hosting profile requires DB_PROVIDER=postgres."));
    }
    if (!candidate.postgresUrl) {
      issues.push(issue("postgres-url", "POSTGRES_URL is required for the free-hosting profile."));
    }
    if (candidate.attachmentStorageProvider !== "supabase") {
      issues.push(issue("free-attachments", "The free-hosting profile requires ATTACHMENT_STORAGE_PROVIDER=supabase."));
    }
    if (!isHttpsUrl(candidate.supabaseUrl) || !candidate.supabaseSecretKey || !candidate.supabaseStorageBucket) {
      issues.push(issue("supabase-storage", "SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_STORAGE_BUCKET are required for private attachment storage."));
    }
  }

  if (candidate.deploymentProfile === "nas") {
    if (candidate.dbProvider !== "sqlserver") {
      issues.push(issue("nas-database", "The NAS profile requires DB_PROVIDER=sqlserver."));
    }
    if (candidate.attachmentStorageProvider !== "filesystem") {
      issues.push(issue("nas-attachments", "The NAS profile requires ATTACHMENT_STORAGE_PROVIDER=filesystem."));
    }
  }

  return issues;
}

export function assertRuntimeConfig(candidate = config) {
  const errors = runtimeConfigIssues(candidate).filter((item) => item.severity === "error");
  if (!errors.length) return;
  throw new Error(`Hosted runtime configuration is unsafe:\n${errors.map((item) => `- [${item.code}] ${item.message}`).join("\n")}`);
}
