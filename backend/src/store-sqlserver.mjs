import sql from "mssql";
import { config } from "./config.mjs";
import { EMPTY_DB, emptyDb, normalizeDb } from "./store-helpers.mjs";

let poolPromise = null;
let queue = Promise.resolve();

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function jsonString(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJson(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function bool(value) {
  return Boolean(value);
}

export function getSqlServerConnectionConfig() {
  if (!config.sqlServerHost || !config.sqlServerDatabase) {
    throw new Error("SQLSERVER_HOST and SQLSERVER_DATABASE are required.");
  }
  if (!config.sqlServerUser || !config.sqlServerPassword) {
    throw new Error("SQLSERVER_USER and SQLSERVER_PASSWORD are required for the configured SQL Server authentication mode.");
  }
  if (config.sqlServerAuth === "ntlm" && !config.sqlServerDomain) {
    throw new Error("SQLSERVER_DOMAIN is required when SQLSERVER_AUTH=ntlm.");
  }

  const options = {
    encrypt: config.sqlServerEncrypt,
    trustServerCertificate: config.sqlServerTrustServerCertificate,
    enableArithAbort: true,
  };
  if (config.sqlServerInstance) options.instanceName = config.sqlServerInstance;

  const result = {
    server: config.sqlServerHost,
    database: config.sqlServerDatabase,
    options,
    pool: {
      max: config.sqlServerPoolMax,
      min: config.sqlServerPoolMin,
      idleTimeoutMillis: config.sqlServerPoolIdleTimeoutMs,
    },
    connectionTimeout: config.sqlServerConnectionTimeoutMs,
    requestTimeout: config.sqlServerRequestTimeoutMs,
  };

  if (!config.sqlServerInstance && config.sqlServerPort) result.port = config.sqlServerPort;

  if (config.sqlServerAuth === "ntlm") {
    result.authentication = {
      type: "ntlm",
      options: {
        userName: config.sqlServerUser,
        password: config.sqlServerPassword,
        domain: config.sqlServerDomain,
      },
    };
  } else {
    result.user = config.sqlServerUser;
    result.password = config.sqlServerPassword;
  }

  return result;
}

export async function getSqlServerPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(getSqlServerConnectionConfig()).connect().catch((error) => {
      poolPromise = null;
      throw error;
    });
  }
  return poolPromise;
}

function request(executor) {
  return executor.request();
}

async function queryAll(executor, statement) {
  const result = await request(executor).query(statement);
  return result.recordset || [];
}

function mapUser(row) {
  return {
    id: row.id,
    zaloUserId: row.zalo_user_id || "",
    name: row.name || "",
    avatar: row.avatar || "",
    phone: row.phone || "",
    department: row.department || "",
    role: row.role || "user",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapStaffAccount(row) {
  return {
    id: row.id,
    username: row.username || "",
    displayName: row.display_name || "",
    role: row.role || "technician",
    passwordHash: row.password_hash || "",
    active: bool(row.active),
    sessionVersion: Number(row.session_version || 1),
    lastLoginAt: toIso(row.last_login_at),
    createdBy: row.created_by || "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapTicket(row) {
  return {
    id: row.id,
    code: row.code,
    userId: row.user_id,
    title: row.title || "",
    description: row.description || "",
    category: row.category || "other",
    priority: row.priority || "normal",
    risk: row.risk || "low",
    status: row.status || "open",
    location: row.location || "",
    device: row.device || "",
    assignedTo: row.assigned_to || "",
    assignedToId: row.assigned_to_id || "",
    aiAnalysis: parseJson(row.ai_analysis_json, null),
    aiHandoffLocked: bool(row.ai_handoff_locked),
    aiHandoffAt: toIso(row.ai_handoff_at),
    aiHandoffReason: row.ai_handoff_reason || "",
    aiHandoffBy: row.ai_handoff_by || "",
    aiHandoffByName: row.ai_handoff_by_name || "",
    resolution: row.resolution || "",
    satisfaction: parseJson(row.satisfaction_json, null),
    reopenCount: Number(row.reopen_count || 0),
    lastReopenedAt: toIso(row.last_reopened_at),
    sla: parseJson(row.sla_json, null),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    resolvedAt: toIso(row.resolved_at),
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorId: row.author_id || "",
    authorName: row.author_name || "",
    role: row.role || "user",
    body: row.body || "",
    createdAt: toIso(row.created_at),
  };
}

function mapAttachment(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    messageId: row.message_id || null,
    uploaderId: row.uploader_id || "",
    uploaderName: row.uploader_name || "",
    fileName: row.file_name || "",
    mimeType: row.mime_type || "application/octet-stream",
    size: Number(row.size_bytes || 0),
    storagePath: row.storage_path || "",
    createdAt: toIso(row.created_at),
  };
}

function mapNotification(row) {
  return {
    id: row.id,
    userId: row.user_id,
    ticketId: row.ticket_id || "",
    type: row.type || "info",
    title: row.title || "",
    body: row.body || "",
    readAt: toIso(row.read_at),
    createdAt: toIso(row.created_at),
  };
}

function mapHistory(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    actorId: row.actor_id || "",
    actorName: row.actor_name || "Hệ thống",
    type: row.type || "info",
    from: row.from_value,
    to: row.to_value,
    note: row.note || "",
    createdAt: toIso(row.created_at),
  };
}

function mapCopilotRun(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    trigger: row.trigger_name || "manual",
    requestedProviderKey: row.requested_provider_key || "auto",
    requestedModel: row.requested_model || null,
    provider: row.provider || "",
    model: row.model || null,
    suggestion: parseJson(row.suggestion_json, null),
    playbookIds: parseJson(row.playbook_ids_json, []),
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    telemetry: parseJson(row.telemetry_json, null),
    status: row.status || "queued",
    error: row.error_message || "",
    requestedBy: row.requested_by || "system",
    requestedByName: row.requested_by_name || "Hệ thống HelpDesk",
    createdAt: toIso(row.created_at),
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
  };
}

function mapKnowledgeBase(row) {
  return {
    id: row.id,
    slug: row.slug || "",
    title: row.title || "",
    category: row.category || "other",
    keywords: parseJson(row.keywords_json, []),
    risk: row.risk || "low",
    autoEligible: bool(row.auto_eligible),
    summary: row.summary || "",
    steps: parseJson(row.steps_json, []),
    active: bool(row.active),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapAudit(row) {
  return {
    id: row.id,
    actor: row.actor || "",
    action: row.action || "",
    entityType: row.entity_type || "",
    entityId: row.entity_id || "",
    detail: parseJson(row.detail_json, {}),
    createdAt: toIso(row.created_at),
  };
}

async function readDbFrom(executor) {
  // Keep requests sequential so this works both with a pool and with a single-connection transaction.
  const users = await queryAll(executor, "SELECT * FROM helpdesk.users ORDER BY created_at, id");
  const staffAccounts = await queryAll(executor, "SELECT * FROM helpdesk.staff_accounts ORDER BY created_at, id");
  const tickets = await queryAll(executor, "SELECT * FROM helpdesk.tickets ORDER BY created_at, id");
  const messages = await queryAll(executor, "SELECT * FROM helpdesk.messages ORDER BY created_at, id");
  const attachments = await queryAll(executor, "SELECT * FROM helpdesk.attachments ORDER BY created_at, id");
  const notifications = await queryAll(executor, "SELECT * FROM helpdesk.notifications ORDER BY created_at, id");
  const ticketHistory = await queryAll(executor, "SELECT * FROM helpdesk.ticket_history ORDER BY created_at, id");
  const aiCopilotRuns = await queryAll(executor, "SELECT * FROM helpdesk.ai_copilot_runs ORDER BY created_at, id");
  const knowledgeBase = await queryAll(executor, "SELECT * FROM helpdesk.knowledge_base ORDER BY created_at, id");
  const auditLog = await queryAll(executor, "SELECT * FROM helpdesk.audit_log ORDER BY created_at, id");

  return normalizeDb({
    users: users.map(mapUser),
    staffAccounts: staffAccounts.map(mapStaffAccount),
    tickets: tickets.map(mapTicket),
    messages: messages.map(mapMessage),
    attachments: attachments.map(mapAttachment),
    notifications: notifications.map(mapNotification),
    ticketHistory: ticketHistory.map(mapHistory),
    aiCopilotRuns: aiCopilotRuns.map(mapCopilotRun),
    knowledgeBase: knowledgeBase.map(mapKnowledgeBase),
    auditLog: auditLog.map(mapAudit),
  });
}

function indexById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function stable(value) {
  return JSON.stringify(value);
}

function changed(before, after) {
  return stable(before) !== stable(after);
}

async function deleteMissing(executor, table, beforeItems, afterItems) {
  const afterIds = new Set(afterItems.map((item) => item.id));
  for (const item of beforeItems) {
    if (afterIds.has(item.id)) continue;
    const req = request(executor);
    req.input("id", sql.NVarChar(64), item.id);
    await req.query(`DELETE FROM helpdesk.${table} WHERE id = @id`);
  }
}

async function upsertUser(executor, item) {
  const req = request(executor);
  req.input("id", sql.NVarChar(64), item.id)
    .input("zalo_user_id", sql.NVarChar(200), item.zaloUserId || null)
    .input("name", sql.NVarChar(200), item.name || "")
    .input("avatar", sql.NVarChar(2048), item.avatar || "")
    .input("phone", sql.NVarChar(80), item.phone || "")
    .input("department", sql.NVarChar(200), item.department || "")
    .input("role", sql.NVarChar(30), item.role || "user")
    .input("created_at", sql.DateTime2(3), toDate(item.createdAt) || new Date())
    .input("updated_at", sql.DateTime2(3), toDate(item.updatedAt) || new Date());
  await req.query(`
    MERGE helpdesk.users WITH (HOLDLOCK) AS target
    USING (SELECT @id AS id) AS source ON target.id = source.id
    WHEN MATCHED THEN UPDATE SET
      zalo_user_id=@zalo_user_id, name=@name, avatar=@avatar, phone=@phone,
      department=@department, role=@role, created_at=@created_at, updated_at=@updated_at
    WHEN NOT MATCHED THEN INSERT
      (id,zalo_user_id,name,avatar,phone,department,role,created_at,updated_at)
      VALUES (@id,@zalo_user_id,@name,@avatar,@phone,@department,@role,@created_at,@updated_at);
  `);
}

async function upsertStaffAccount(executor, item) {
  const req = request(executor);
  req.input("id", sql.NVarChar(64), item.id)
    .input("username", sql.NVarChar(80), item.username || "")
    .input("display_name", sql.NVarChar(120), item.displayName || "")
    .input("role", sql.NVarChar(30), item.role || "technician")
    .input("password_hash", sql.NVarChar(512), item.passwordHash || "")
    .input("active", sql.Bit, item.active !== false)
    .input("session_version", sql.Int, Number(item.sessionVersion || 1))
    .input("last_login_at", sql.DateTime2(3), toDate(item.lastLoginAt))
    .input("created_by", sql.NVarChar(64), item.createdBy || "")
    .input("created_at", sql.DateTime2(3), toDate(item.createdAt) || new Date())
    .input("updated_at", sql.DateTime2(3), toDate(item.updatedAt) || new Date());
  await req.query(`
    MERGE helpdesk.staff_accounts WITH (HOLDLOCK) AS target
    USING (SELECT @id AS id) AS source ON target.id=source.id
    WHEN MATCHED THEN UPDATE SET username=@username,display_name=@display_name,role=@role,password_hash=@password_hash,active=@active,session_version=@session_version,last_login_at=@last_login_at,created_by=@created_by,created_at=@created_at,updated_at=@updated_at
    WHEN NOT MATCHED THEN INSERT (id,username,display_name,role,password_hash,active,session_version,last_login_at,created_by,created_at,updated_at)
      VALUES (@id,@username,@display_name,@role,@password_hash,@active,@session_version,@last_login_at,@created_by,@created_at,@updated_at);
  `);
}

async function upsertTicket(executor, item) {
  const req = request(executor);
  req.input("id", sql.NVarChar(64), item.id)
    .input("code", sql.NVarChar(50), item.code)
    .input("user_id", sql.NVarChar(64), item.userId)
    .input("title", sql.NVarChar(160), item.title || "")
    .input("description", sql.NVarChar(sql.MAX), item.description || "")
    .input("category", sql.NVarChar(40), item.category || "other")
    .input("priority", sql.NVarChar(20), item.priority || "normal")
    .input("risk", sql.NVarChar(20), item.risk || "low")
    .input("status", sql.NVarChar(30), item.status || "open")
    .input("location", sql.NVarChar(160), item.location || "")
    .input("device", sql.NVarChar(160), item.device || "")
    .input("assigned_to", sql.NVarChar(120), item.assignedTo || "")
    .input("assigned_to_id", sql.NVarChar(64), item.assignedToId || null)
    .input("ai_analysis_json", sql.NVarChar(sql.MAX), jsonString(item.aiAnalysis))
    .input("ai_handoff_locked", sql.Bit, bool(item.aiHandoffLocked))
    .input("ai_handoff_at", sql.DateTime2(3), toDate(item.aiHandoffAt))
    .input("ai_handoff_reason", sql.NVarChar(100), item.aiHandoffReason || "")
    .input("ai_handoff_by", sql.NVarChar(64), item.aiHandoffBy || "")
    .input("ai_handoff_by_name", sql.NVarChar(200), item.aiHandoffByName || "")
    .input("resolution", sql.NVarChar(1000), item.resolution || "")
    .input("satisfaction_json", sql.NVarChar(sql.MAX), jsonString(item.satisfaction))
    .input("reopen_count", sql.Int, Number(item.reopenCount || 0))
    .input("last_reopened_at", sql.DateTime2(3), toDate(item.lastReopenedAt))
    .input("sla_json", sql.NVarChar(sql.MAX), jsonString(item.sla))
    .input("created_at", sql.DateTime2(3), toDate(item.createdAt) || new Date())
    .input("updated_at", sql.DateTime2(3), toDate(item.updatedAt) || new Date())
    .input("resolved_at", sql.DateTime2(3), toDate(item.resolvedAt));
  await req.query(`
    MERGE helpdesk.tickets WITH (HOLDLOCK) AS target
    USING (SELECT @id AS id) AS source ON target.id = source.id
    WHEN MATCHED THEN UPDATE SET
      code=@code,user_id=@user_id,title=@title,description=@description,category=@category,
      priority=@priority,risk=@risk,status=@status,location=@location,device=@device,
      assigned_to=@assigned_to,assigned_to_id=@assigned_to_id,ai_analysis_json=@ai_analysis_json,
      ai_handoff_locked=@ai_handoff_locked,ai_handoff_at=@ai_handoff_at,ai_handoff_reason=@ai_handoff_reason,
      ai_handoff_by=@ai_handoff_by,ai_handoff_by_name=@ai_handoff_by_name,resolution=@resolution,
      satisfaction_json=@satisfaction_json,reopen_count=@reopen_count,last_reopened_at=@last_reopened_at,
      sla_json=@sla_json,created_at=@created_at,updated_at=@updated_at,resolved_at=@resolved_at
    WHEN NOT MATCHED THEN INSERT
      (id,code,user_id,title,description,category,priority,risk,status,location,device,assigned_to,assigned_to_id,
       ai_analysis_json,ai_handoff_locked,ai_handoff_at,ai_handoff_reason,ai_handoff_by,ai_handoff_by_name,
       resolution,satisfaction_json,reopen_count,last_reopened_at,sla_json,created_at,updated_at,resolved_at)
      VALUES
      (@id,@code,@user_id,@title,@description,@category,@priority,@risk,@status,@location,@device,@assigned_to,@assigned_to_id,
       @ai_analysis_json,@ai_handoff_locked,@ai_handoff_at,@ai_handoff_reason,@ai_handoff_by,@ai_handoff_by_name,
       @resolution,@satisfaction_json,@reopen_count,@last_reopened_at,@sla_json,@created_at,@updated_at,@resolved_at);
  `);
}

async function upsertMessage(executor, item) {
  const req = request(executor);
  req.input("id", sql.NVarChar(64), item.id)
    .input("ticket_id", sql.NVarChar(64), item.ticketId)
    .input("author_id", sql.NVarChar(64), item.authorId || "")
    .input("author_name", sql.NVarChar(200), item.authorName || "")
    .input("role", sql.NVarChar(30), item.role || "user")
    .input("body", sql.NVarChar(sql.MAX), item.body || "")
    .input("created_at", sql.DateTime2(3), toDate(item.createdAt) || new Date());
  await req.query(`
    MERGE helpdesk.messages WITH (HOLDLOCK) AS target
    USING (SELECT @id AS id) AS source ON target.id=source.id
    WHEN MATCHED THEN UPDATE SET ticket_id=@ticket_id,author_id=@author_id,author_name=@author_name,role=@role,body=@body,created_at=@created_at
    WHEN NOT MATCHED THEN INSERT (id,ticket_id,author_id,author_name,role,body,created_at)
      VALUES (@id,@ticket_id,@author_id,@author_name,@role,@body,@created_at);
  `);
}

async function upsertAttachment(executor, item) {
  const req = request(executor);
  req.input("id", sql.NVarChar(64), item.id)
    .input("ticket_id", sql.NVarChar(64), item.ticketId)
    .input("message_id", sql.NVarChar(64), item.messageId || null)
    .input("uploader_id", sql.NVarChar(64), item.uploaderId || "")
    .input("uploader_name", sql.NVarChar(200), item.uploaderName || "")
    .input("file_name", sql.NVarChar(180), item.fileName || "")
    .input("mime_type", sql.NVarChar(160), item.mimeType || "application/octet-stream")
    .input("size_bytes", sql.BigInt, Number(item.size || 0))
    .input("storage_path", sql.NVarChar(1024), item.storagePath || "")
    .input("created_at", sql.DateTime2(3), toDate(item.createdAt) || new Date());
  await req.query(`
    MERGE helpdesk.attachments WITH (HOLDLOCK) AS target
    USING (SELECT @id AS id) AS source ON target.id=source.id
    WHEN MATCHED THEN UPDATE SET ticket_id=@ticket_id,message_id=@message_id,uploader_id=@uploader_id,uploader_name=@uploader_name,file_name=@file_name,mime_type=@mime_type,size_bytes=@size_bytes,storage_path=@storage_path,created_at=@created_at
    WHEN NOT MATCHED THEN INSERT (id,ticket_id,message_id,uploader_id,uploader_name,file_name,mime_type,size_bytes,storage_path,created_at)
      VALUES (@id,@ticket_id,@message_id,@uploader_id,@uploader_name,@file_name,@mime_type,@size_bytes,@storage_path,@created_at);
  `);
}

async function upsertNotification(executor, item) {
  const req = request(executor);
  req.input("id", sql.NVarChar(64), item.id)
    .input("user_id", sql.NVarChar(64), item.userId)
    .input("ticket_id", sql.NVarChar(64), item.ticketId || null)
    .input("type", sql.NVarChar(40), item.type || "info")
    .input("title", sql.NVarChar(160), item.title || "")
    .input("body", sql.NVarChar(1000), item.body || "")
    .input("read_at", sql.DateTime2(3), toDate(item.readAt))
    .input("created_at", sql.DateTime2(3), toDate(item.createdAt) || new Date());
  await req.query(`
    MERGE helpdesk.notifications WITH (HOLDLOCK) AS target
    USING (SELECT @id AS id) AS source ON target.id=source.id
    WHEN MATCHED THEN UPDATE SET user_id=@user_id,ticket_id=@ticket_id,type=@type,title=@title,body=@body,read_at=@read_at,created_at=@created_at
    WHEN NOT MATCHED THEN INSERT (id,user_id,ticket_id,type,title,body,read_at,created_at)
      VALUES (@id,@user_id,@ticket_id,@type,@title,@body,@read_at,@created_at);
  `);
}

async function upsertHistory(executor, item) {
  const req = request(executor);
  req.input("id", sql.NVarChar(64), item.id)
    .input("ticket_id", sql.NVarChar(64), item.ticketId)
    .input("actor_id", sql.NVarChar(64), item.actorId || "")
    .input("actor_name", sql.NVarChar(200), item.actorName || "Hệ thống")
    .input("type", sql.NVarChar(50), item.type || "info")
    .input("from_value", sql.NVarChar(200), item.from === null || item.from === undefined ? null : String(item.from))
    .input("to_value", sql.NVarChar(200), item.to === null || item.to === undefined ? null : String(item.to))
    .input("note", sql.NVarChar(1000), item.note || "")
    .input("created_at", sql.DateTime2(3), toDate(item.createdAt) || new Date());
  await req.query(`
    MERGE helpdesk.ticket_history WITH (HOLDLOCK) AS target
    USING (SELECT @id AS id) AS source ON target.id=source.id
    WHEN MATCHED THEN UPDATE SET ticket_id=@ticket_id,actor_id=@actor_id,actor_name=@actor_name,type=@type,from_value=@from_value,to_value=@to_value,note=@note,created_at=@created_at
    WHEN NOT MATCHED THEN INSERT (id,ticket_id,actor_id,actor_name,type,from_value,to_value,note,created_at)
      VALUES (@id,@ticket_id,@actor_id,@actor_name,@type,@from_value,@to_value,@note,@created_at);
  `);
}

async function upsertCopilotRun(executor, item) {
  const req = request(executor);
  req.input("id", sql.NVarChar(64), item.id)
    .input("ticket_id", sql.NVarChar(64), item.ticketId)
    .input("trigger_name", sql.NVarChar(80), item.trigger || "manual")
    .input("requested_provider_key", sql.NVarChar(30), item.requestedProviderKey || "auto")
    .input("requested_model", sql.NVarChar(200), item.requestedModel || null)
    .input("provider", sql.NVarChar(100), item.provider || "")
    .input("model", sql.NVarChar(200), item.model || null)
    .input("suggestion_json", sql.NVarChar(sql.MAX), jsonString(item.suggestion))
    .input("playbook_ids_json", sql.NVarChar(sql.MAX), jsonString(item.playbookIds || []))
    .input("confidence", sql.Decimal(6, 5), item.confidence === null || item.confidence === undefined ? null : Number(item.confidence))
    .input("telemetry_json", sql.NVarChar(sql.MAX), jsonString(item.telemetry))
    .input("status", sql.NVarChar(30), item.status || "queued")
    .input("error_message", sql.NVarChar(1000), item.error || "")
    .input("requested_by", sql.NVarChar(64), item.requestedBy || "system")
    .input("requested_by_name", sql.NVarChar(200), item.requestedByName || "Hệ thống HelpDesk")
    .input("created_at", sql.DateTime2(3), toDate(item.createdAt) || new Date())
    .input("started_at", sql.DateTime2(3), toDate(item.startedAt))
    .input("completed_at", sql.DateTime2(3), toDate(item.completedAt));
  await req.query(`
    MERGE helpdesk.ai_copilot_runs WITH (HOLDLOCK) AS target
    USING (SELECT @id AS id) AS source ON target.id=source.id
    WHEN MATCHED THEN UPDATE SET ticket_id=@ticket_id,trigger_name=@trigger_name,requested_provider_key=@requested_provider_key,requested_model=@requested_model,provider=@provider,model=@model,suggestion_json=@suggestion_json,playbook_ids_json=@playbook_ids_json,confidence=@confidence,telemetry_json=@telemetry_json,status=@status,error_message=@error_message,requested_by=@requested_by,requested_by_name=@requested_by_name,created_at=@created_at,started_at=@started_at,completed_at=@completed_at
    WHEN NOT MATCHED THEN INSERT (id,ticket_id,trigger_name,requested_provider_key,requested_model,provider,model,suggestion_json,playbook_ids_json,confidence,telemetry_json,status,error_message,requested_by,requested_by_name,created_at,started_at,completed_at)
      VALUES (@id,@ticket_id,@trigger_name,@requested_provider_key,@requested_model,@provider,@model,@suggestion_json,@playbook_ids_json,@confidence,@telemetry_json,@status,@error_message,@requested_by,@requested_by_name,@created_at,@started_at,@completed_at);
  `);
}

async function upsertKnowledgeBase(executor, item) {
  const req = request(executor);
  req.input("id", sql.NVarChar(64), item.id)
    .input("slug", sql.NVarChar(200), item.slug || item.id)
    .input("title", sql.NVarChar(180), item.title || "")
    .input("category", sql.NVarChar(40), item.category || "other")
    .input("keywords_json", sql.NVarChar(sql.MAX), jsonString(item.keywords || []))
    .input("risk", sql.NVarChar(20), item.risk || "low")
    .input("auto_eligible", sql.Bit, bool(item.autoEligible))
    .input("summary", sql.NVarChar(1000), item.summary || "")
    .input("steps_json", sql.NVarChar(sql.MAX), jsonString(item.steps || []))
    .input("active", sql.Bit, item.active !== false)
    .input("created_at", sql.DateTime2(3), toDate(item.createdAt) || new Date())
    .input("updated_at", sql.DateTime2(3), toDate(item.updatedAt) || new Date());
  await req.query(`
    MERGE helpdesk.knowledge_base WITH (HOLDLOCK) AS target
    USING (SELECT @id AS id) AS source ON target.id=source.id
    WHEN MATCHED THEN UPDATE SET slug=@slug,title=@title,category=@category,keywords_json=@keywords_json,risk=@risk,auto_eligible=@auto_eligible,summary=@summary,steps_json=@steps_json,active=@active,created_at=@created_at,updated_at=@updated_at
    WHEN NOT MATCHED THEN INSERT (id,slug,title,category,keywords_json,risk,auto_eligible,summary,steps_json,active,created_at,updated_at)
      VALUES (@id,@slug,@title,@category,@keywords_json,@risk,@auto_eligible,@summary,@steps_json,@active,@created_at,@updated_at);
  `);
}

async function upsertAudit(executor, item) {
  const req = request(executor);
  req.input("id", sql.NVarChar(64), item.id)
    .input("actor", sql.NVarChar(64), item.actor || "")
    .input("action", sql.NVarChar(80), item.action || "")
    .input("entity_type", sql.NVarChar(80), item.entityType || "")
    .input("entity_id", sql.NVarChar(128), item.entityId || "")
    .input("detail_json", sql.NVarChar(sql.MAX), jsonString(item.detail || {}))
    .input("created_at", sql.DateTime2(3), toDate(item.createdAt) || new Date());
  await req.query(`
    MERGE helpdesk.audit_log WITH (HOLDLOCK) AS target
    USING (SELECT @id AS id) AS source ON target.id=source.id
    WHEN MATCHED THEN UPDATE SET actor=@actor,action=@action,entity_type=@entity_type,entity_id=@entity_id,detail_json=@detail_json,created_at=@created_at
    WHEN NOT MATCHED THEN INSERT (id,actor,action,entity_type,entity_id,detail_json,created_at)
      VALUES (@id,@actor,@action,@entity_type,@entity_id,@detail_json,@created_at);
  `);
}

const COLLECTIONS = [
  ["users", "users", upsertUser],
  ["staffAccounts", "staff_accounts", upsertStaffAccount],
  ["tickets", "tickets", upsertTicket],
  ["messages", "messages", upsertMessage],
  ["attachments", "attachments", upsertAttachment],
  ["notifications", "notifications", upsertNotification],
  ["ticketHistory", "ticket_history", upsertHistory],
  ["aiCopilotRuns", "ai_copilot_runs", upsertCopilotRun],
  ["knowledgeBase", "knowledge_base", upsertKnowledgeBase],
  ["auditLog", "audit_log", upsertAudit],
];

async function upsertCollection(executor, beforeItems, afterItems, upsert) {
  const beforeMap = indexById(beforeItems);
  for (const item of afterItems) {
    const prior = beforeMap.get(item.id);
    if (!prior || changed(prior, item)) await upsert(executor, item);
  }
}

async function syncSnapshot(executor, before, after) {
  // Parents are inserted before children.
  for (const [key, , upsert] of COLLECTIONS) {
    await upsertCollection(executor, before[key], after[key], upsert);
  }
  // Children are deleted before parents to preserve foreign-key integrity.
  for (const [key, table] of [...COLLECTIONS].reverse()) {
    await deleteMissing(executor, table, before[key], after[key]);
  }
}

export async function initializeStore() {
  const pool = await getSqlServerPool();
  await pool.request().query("SELECT TOP (1) 1 AS ok FROM helpdesk.schema_version");
}

export async function readDb() {
  const pool = await getSqlServerPool();
  return readDbFrom(pool);
}

export function updateDb(mutator) {
  const task = queue.then(async () => {
    const pool = await getSqlServerPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const before = await readDbFrom(transaction);
      const after = structuredClone(before);
      const result = await mutator(after);
      await syncSnapshot(transaction, before, normalizeDb(after));
      await transaction.commit();
      return result;
    } catch (error) {
      try { await transaction.rollback(); } catch {}
      throw error;
    }
  });
  queue = task.catch(() => undefined);
  return task;
}

export function replaceDb(snapshot, { requireEmpty = false } = {}) {
  const task = queue.then(async () => {
    const pool = await getSqlServerPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      let before = await readDbFrom(transaction);
      if (requireEmpty && Object.keys(EMPTY_DB).some((key) => before[key].length > 0)) {
        throw new Error("SQL Server database is not empty. Use --force only after making a backup.");
      }
      if (!requireEmpty) {
        // A forced import is a true replacement. Clear children before parents to avoid
        // unique-key conflicts between old and imported IDs/codes/slugs.
        for (const [, table] of [...COLLECTIONS].reverse()) {
          await request(transaction).query(`DELETE FROM helpdesk.${table}`);
        }
        before = emptyDb();
      }
      const after = normalizeDb(snapshot);
      await syncSnapshot(transaction, before, after);
      await transaction.commit();
      return after;
    } catch (error) {
      try { await transaction.rollback(); } catch {}
      throw error;
    }
  });
  queue = task.catch(() => undefined);
  return task;
}

export async function getStoreStatus() {
  try {
    const pool = await getSqlServerPool();
    const result = await pool.request().query(`
      SELECT
        (SELECT COUNT_BIG(*) FROM helpdesk.users) AS users,
        (SELECT COUNT_BIG(*) FROM helpdesk.staff_accounts) AS staffAccounts,
        (SELECT COUNT_BIG(*) FROM helpdesk.tickets) AS tickets,
        (SELECT COUNT_BIG(*) FROM helpdesk.messages) AS messages,
        (SELECT COUNT_BIG(*) FROM helpdesk.attachments) AS attachments,
        (SELECT COUNT_BIG(*) FROM helpdesk.notifications) AS notifications,
        (SELECT COUNT_BIG(*) FROM helpdesk.ticket_history) AS ticketHistory,
        (SELECT COUNT_BIG(*) FROM helpdesk.ai_copilot_runs) AS aiCopilotRuns,
        (SELECT COUNT_BIG(*) FROM helpdesk.knowledge_base) AS knowledgeBase,
        (SELECT COUNT_BIG(*) FROM helpdesk.audit_log) AS auditLog;
    `);
    const row = result.recordset?.[0] || {};
    return {
      ready: true,
      provider: "sqlserver",
      server: config.sqlServerInstance ? `${config.sqlServerHost}\\${config.sqlServerInstance}` : `${config.sqlServerHost}:${config.sqlServerPort}`,
      database: config.sqlServerDatabase,
      auth: config.sqlServerAuth,
      encrypted: config.sqlServerEncrypt,
      counts: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value || 0)])),
      error: null,
    };
  } catch (error) {
    return {
      ready: false,
      provider: "sqlserver",
      server: config.sqlServerInstance ? `${config.sqlServerHost}\\${config.sqlServerInstance}` : `${config.sqlServerHost}:${config.sqlServerPort}`,
      database: config.sqlServerDatabase,
      auth: config.sqlServerAuth,
      encrypted: config.sqlServerEncrypt,
      counts: {},
      error: error.message,
    };
  }
}

export async function closeStore() {
  if (!poolPromise) return;
  try {
    const pool = await poolPromise;
    await pool.close();
  } finally {
    poolPromise = null;
  }
}
