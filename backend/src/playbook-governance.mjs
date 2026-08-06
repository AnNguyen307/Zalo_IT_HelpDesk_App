import crypto from "node:crypto";
import fs from "node:fs/promises";
import sql from "mssql";
import { config } from "./config.mjs";
import { getSqlServerPool } from "./store-sqlserver.mjs";
import { id, normalizeText, nowIso, slug } from "./utils.mjs";

const VERSION_STATUSES = new Set(["draft", "submitted", "rejected", "published", "superseded", "archived"]);
const PROCEDURE_STATUSES = new Set(["active", "deprecated", "archived"]);
const CATEGORIES = new Set(["network", "printer", "windows", "office", "account", "software", "hardware", "other"]);
const AUDIENCES = new Set(["employee", "technician", "both"]);
const RISKS = new Set(["low", "medium", "high"]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function string(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function stringArray(value, maxItems = 30, maxChars = 500) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => string(item, maxChars)).filter(Boolean).slice(0, maxItems);
}

export function redactSensitiveText(value = "") {
  return String(value)
    .replace(/\b(password|passwd|pwd|secret|token|api[_ -]?key|private[_ -]?key|wpa[-_ ]?passphrase|pre[-_ ]?shared[-_ ]?key|snmp[_ -]?community|radius[_ -]?key)\b\s*[:=]\s*[^\s,;]+/gi, "$1=<REDACTED>")
    .replace(/\b[A-Fa-f0-9]{40,}\b/g, "<REDACTED_HEX>")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "<REDACTED_PRIVATE_BLOCK>");
}

function normalizeSourceRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item) => ({
    document: string(item?.document, 240),
    section: string(item?.section, 160),
    title: string(item?.title, 240),
  })).filter((item) => item.document || item.title);
}

export function normalizePlaybookContent(payload = {}, { code = "", title = "" } = {}) {
  const risk = RISKS.has(payload.risk) ? payload.risk : "medium";
  const audience = AUDIENCES.has(payload.audience) ? payload.audience : "technician";
  let autoEligible = Boolean(payload.autoEligible);
  if (risk === "high" || audience === "technician") autoEligible = false;

  const entry = {
    id: string(payload.id || code || slug(title || payload.title), 100),
    title: string(payload.title || title, 220),
    category: CATEGORIES.has(payload.category) ? payload.category : "other",
    audience,
    risk,
    priority: PRIORITIES.has(payload.priority) ? payload.priority : "normal",
    autoEligible,
    approved: false,
    active: true,
    version: string(payload.version || "1.0", 30),
    sourceType: string(payload.sourceType || "managed-playbook", 80),
    summary: string(payload.summary, 2000),
    symptoms: stringArray(payload.symptoms, 30, 400),
    requiredQuestions: stringArray(payload.requiredQuestions, 30, 500),
    steps: stringArray(payload.steps, 40, 1000),
    commands: stringArray(payload.commands, 20, 1000),
    forbiddenSteps: stringArray(payload.forbiddenSteps, 30, 1000),
    keywords: stringArray(payload.keywords, 50, 200),
    sourceRefs: normalizeSourceRefs(payload.sourceRefs),
    notes: string(payload.notes, 3000),
  };
  entry.content = [entry.summary, ...entry.requiredQuestions, ...entry.steps, ...entry.forbiddenSteps].filter(Boolean).join("\n");
  return entry;
}

export function validatePlaybookContent(entry, { publishing = false } = {}) {
  const errors = [];
  if (!entry.id || entry.id.length < 3) errors.push("Mã procedure phải có ít nhất 3 ký tự");
  if (!entry.title || entry.title.length < 5) errors.push("Tiêu đề phải có ít nhất 5 ký tự");
  if (!entry.summary || entry.summary.length < 15) errors.push("Tóm tắt phải có ít nhất 15 ký tự");
  if (!entry.steps.length) errors.push("Phải có ít nhất một bước xử lý");
  if (!entry.keywords.length) errors.push("Phải có ít nhất một từ khóa hoặc triệu chứng");
  if (publishing && entry.risk === "high" && !entry.forbiddenSteps.length) errors.push("Procedure rủi ro cao phải có bước bị cấm/cảnh báo an toàn");
  if (entry.audience === "technician" && entry.autoEligible) errors.push("Procedure chỉ dành cho kỹ thuật viên không được auto-eligible");
  if (entry.risk === "high" && entry.autoEligible) errors.push("Procedure rủi ro cao không được auto-eligible");
  if (publishing && entry.audience === "employee" && entry.autoEligible && !entry.requiredQuestions.length) {
    errors.push("Procedure tự hướng dẫn người dùng phải có câu hỏi khoanh vùng bắt buộc");
  }
  if (errors.length) throw httpError(errors.join("; "), 422);
  return entry;
}

function parseJson(value, fallback = null) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function mapProcedure(row) {
  const content = parseJson(row.content_json, null);
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    category: row.category,
    audience: row.audience,
    lifecycleStatus: row.lifecycle_status,
    currentVersionId: row.current_version_id || null,
    ownerId: row.owner_id || "",
    ownerName: row.owner_name || "",
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at?.toISOString?.() || row.created_at || null,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at || null,
    version: row.version_id ? {
      id: row.version_id,
      versionNumber: Number(row.version_number || 0),
      status: row.version_status,
      content,
      changeSummary: row.change_summary || "",
      sourceTicketId: row.source_ticket_id || null,
      createdBy: row.version_created_by,
      createdByName: row.version_created_by_name,
      createdByRole: row.version_created_by_role,
      submittedAt: row.submitted_at?.toISOString?.() || row.submitted_at || null,
      reviewedBy: row.reviewed_by || null,
      reviewedByName: row.reviewed_by_name || null,
      reviewedAt: row.reviewed_at?.toISOString?.() || row.reviewed_at || null,
      reviewNote: row.review_note || "",
      publishedAt: row.published_at?.toISOString?.() || row.published_at || null,
      createdAt: row.version_created_at?.toISOString?.() || row.version_created_at || null,
      updatedAt: row.version_updated_at?.toISOString?.() || row.version_updated_at || null,
    } : null,
  };
}

function actorValues(session) {
  return {
    id: string(session?.sub || "system", 64),
    name: string(session?.name || "Hệ thống", 200),
    role: string(session?.role || "system", 30),
  };
}

async function tableExists(pool) {
  const result = await pool.request().query("SELECT CASE WHEN OBJECT_ID(N'helpdesk.playbook_procedures', N'U') IS NULL THEN 0 ELSE 1 END AS ready");
  return Boolean(result.recordset?.[0]?.ready);
}

export async function isPlaybookGovernanceReady() {
  if (config.dbProvider !== "sqlserver" || !config.playbookGovernanceEnabled) return false;
  try { return await tableExists(await getSqlServerPool()); } catch { return false; }
}

async function addEvent(executor, { procedureId, versionId = null, action, actor, detail = {} }) {
  const req = executor.request();
  req.input("id", sql.NVarChar(64), id("pbe"))
    .input("procedure_id", sql.NVarChar(64), procedureId)
    .input("version_id", sql.NVarChar(64), versionId)
    .input("action", sql.NVarChar(50), action)
    .input("actor_id", sql.NVarChar(64), actor.id)
    .input("actor_name", sql.NVarChar(200), actor.name)
    .input("actor_role", sql.NVarChar(30), actor.role)
    .input("detail_json", sql.NVarChar(sql.MAX), JSON.stringify(detail || {}))
    .input("created_at", sql.DateTime2(3), new Date());
  await req.query(`INSERT INTO helpdesk.playbook_events(id,procedure_id,version_id,action,actor_id,actor_name,actor_role,detail_json,created_at)
    VALUES(@id,@procedure_id,@version_id,@action,@actor_id,@actor_name,@actor_role,@detail_json,@created_at)`);
}

async function nextVersionNumber(executor, procedureId) {
  const req = executor.request();
  req.input("procedure_id", sql.NVarChar(64), procedureId);
  const result = await req.query("SELECT ISNULL(MAX(version_number),0)+1 AS next_version FROM helpdesk.playbook_versions WITH (UPDLOCK,HOLDLOCK) WHERE procedure_id=@procedure_id");
  return Number(result.recordset?.[0]?.next_version || 1);
}

async function findVersion(executor, versionId) {
  const req = executor.request();
  req.input("version_id", sql.NVarChar(64), versionId);
  const result = await req.query(`
    SELECT v.*, p.code, p.title AS procedure_title, p.lifecycle_status, p.owner_id
    FROM helpdesk.playbook_versions v
    JOIN helpdesk.playbook_procedures p ON p.id=v.procedure_id
    WHERE v.id=@version_id`);
  return result.recordset?.[0] || null;
}

function canEditVersion(session, row) {
  return session.role === "admin" || (session.role === "technician" && row.created_by === session.sub);
}

export async function createPlaybookDraft(session, payload = {}) {
  if (!['admin', 'technician'].includes(session.role)) throw httpError("Staff authentication required", 403);
  const actor = actorValues(session);
  const content = validatePlaybookContent(normalizePlaybookContent(payload, { code: payload.code, title: payload.title }));
  const procedureId = id("pbp");
  const versionId = id("pbv");
  const code = string(payload.code || content.id || `PB-${Date.now()}`, 100).toUpperCase().replace(/[^A-Z0-9_-]+/g, "-");
  content.id = code;
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const existsReq = transaction.request();
    existsReq.input("code", sql.NVarChar(100), code);
    const exists = await existsReq.query("SELECT id FROM helpdesk.playbook_procedures WHERE code=@code");
    if (exists.recordset.length) throw httpError("Mã procedure đã tồn tại", 409);

    const at = new Date();
    const procReq = transaction.request();
    procReq.input("id", sql.NVarChar(64), procedureId)
      .input("code", sql.NVarChar(100), code)
      .input("title", sql.NVarChar(220), content.title)
      .input("category", sql.NVarChar(50), content.category)
      .input("audience", sql.NVarChar(30), content.audience)
      .input("owner_id", sql.NVarChar(64), actor.id)
      .input("owner_name", sql.NVarChar(200), actor.name)
      .input("created_by", sql.NVarChar(64), actor.id)
      .input("created_by_name", sql.NVarChar(200), actor.name)
      .input("created_at", sql.DateTime2(3), at)
      .input("updated_at", sql.DateTime2(3), at);
    await procReq.query(`INSERT INTO helpdesk.playbook_procedures(id,code,title,category,audience,lifecycle_status,current_version_id,owner_id,owner_name,created_by,created_by_name,created_at,updated_at)
      VALUES(@id,@code,@title,@category,@audience,N'active',NULL,@owner_id,@owner_name,@created_by,@created_by_name,@created_at,@updated_at)`);

    const verReq = transaction.request();
    verReq.input("id", sql.NVarChar(64), versionId)
      .input("procedure_id", sql.NVarChar(64), procedureId)
      .input("content_json", sql.NVarChar(sql.MAX), JSON.stringify(content))
      .input("change_summary", sql.NVarChar(1000), string(payload.changeSummary || "Tạo procedure mới", 1000))
      .input("source_ticket_id", sql.NVarChar(64), string(payload.sourceTicketId, 64) || null)
      .input("created_by", sql.NVarChar(64), actor.id)
      .input("created_by_name", sql.NVarChar(200), actor.name)
      .input("created_by_role", sql.NVarChar(30), actor.role)
      .input("created_at", sql.DateTime2(3), at)
      .input("updated_at", sql.DateTime2(3), at);
    await verReq.query(`INSERT INTO helpdesk.playbook_versions(id,procedure_id,version_number,status,content_json,change_summary,source_ticket_id,created_by,created_by_name,created_by_role,created_at,updated_at)
      VALUES(@id,@procedure_id,1,N'draft',@content_json,@change_summary,@source_ticket_id,@created_by,@created_by_name,@created_by_role,@created_at,@updated_at)`);
    await addEvent(transaction, { procedureId, versionId, action: "draft_created", actor, detail: { code, sourceTicketId: payload.sourceTicketId || null } });
    await transaction.commit();
    return getPlaybookProcedure(procedureId);
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

export async function createPlaybookVersion(session, procedureId, payload = {}) {
  if (!['admin', 'technician'].includes(session.role)) throw httpError("Staff authentication required", 403);
  const actor = actorValues(session);
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const procReq = transaction.request();
    procReq.input("procedure_id", sql.NVarChar(64), procedureId);
    const procResult = await procReq.query(`SELECT p.*, v.content_json FROM helpdesk.playbook_procedures p LEFT JOIN helpdesk.playbook_versions v ON v.id=p.current_version_id WHERE p.id=@procedure_id`);
    const proc = procResult.recordset?.[0];
    if (!proc) throw httpError("Không tìm thấy procedure", 404);
    const source = payload.content || parseJson(proc.content_json, {});
    const content = validatePlaybookContent(normalizePlaybookContent({ ...source, ...payload }, { code: proc.code, title: proc.title }));
    content.id = proc.code;
    const versionId = id("pbv");
    const versionNumber = await nextVersionNumber(transaction, procedureId);
    const at = new Date();
    const req = transaction.request();
    req.input("id", sql.NVarChar(64), versionId)
      .input("procedure_id", sql.NVarChar(64), procedureId)
      .input("version_number", sql.Int, versionNumber)
      .input("content_json", sql.NVarChar(sql.MAX), JSON.stringify(content))
      .input("change_summary", sql.NVarChar(1000), string(payload.changeSummary || `Tạo bản nháp v${versionNumber}`, 1000))
      .input("source_ticket_id", sql.NVarChar(64), string(payload.sourceTicketId, 64) || null)
      .input("created_by", sql.NVarChar(64), actor.id)
      .input("created_by_name", sql.NVarChar(200), actor.name)
      .input("created_by_role", sql.NVarChar(30), actor.role)
      .input("created_at", sql.DateTime2(3), at)
      .input("updated_at", sql.DateTime2(3), at);
    await req.query(`INSERT INTO helpdesk.playbook_versions(id,procedure_id,version_number,status,content_json,change_summary,source_ticket_id,created_by,created_by_name,created_by_role,created_at,updated_at)
      VALUES(@id,@procedure_id,@version_number,N'draft',@content_json,@change_summary,@source_ticket_id,@created_by,@created_by_name,@created_by_role,@created_at,@updated_at)`);
    await addEvent(transaction, { procedureId, versionId, action: "version_created", actor, detail: { versionNumber } });
    await transaction.commit();
    return getPlaybookProcedure(procedureId);
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

export async function updatePlaybookDraft(session, versionId, payload = {}) {
  const actor = actorValues(session);
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const row = await findVersion(transaction, versionId);
    if (!row) throw httpError("Không tìm thấy phiên bản", 404);
    if (!['draft', 'rejected'].includes(row.status)) throw httpError("Chỉ có thể sửa bản nháp hoặc bản bị từ chối", 409);
    if (!canEditVersion(session, row)) throw httpError("Bạn không có quyền sửa bản nháp này", 403);
    const current = parseJson(row.content_json, {});
    const content = validatePlaybookContent(normalizePlaybookContent({ ...current, ...payload }, { code: row.code, title: row.procedure_title }));
    content.id = row.code;
    const req = transaction.request();
    req.input("id", sql.NVarChar(64), versionId)
      .input("content_json", sql.NVarChar(sql.MAX), JSON.stringify(content))
      .input("change_summary", sql.NVarChar(1000), string(payload.changeSummary ?? row.change_summary, 1000))
      .input("updated_at", sql.DateTime2(3), new Date());
    await req.query("UPDATE helpdesk.playbook_versions SET status=N'draft',content_json=@content_json,change_summary=@change_summary,review_note=N'',updated_at=@updated_at WHERE id=@id");
    await addEvent(transaction, { procedureId: row.procedure_id, versionId, action: "draft_updated", actor, detail: { fields: Object.keys(payload) } });
    await transaction.commit();
    return getPlaybookProcedure(row.procedure_id);
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

export async function submitPlaybookVersion(session, versionId) {
  const actor = actorValues(session);
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const row = await findVersion(transaction, versionId);
    if (!row) throw httpError("Không tìm thấy phiên bản", 404);
    if (!['draft', 'rejected'].includes(row.status)) throw httpError("Phiên bản không ở trạng thái có thể gửi duyệt", 409);
    if (!canEditVersion(session, row)) throw httpError("Bạn không có quyền gửi bản nháp này", 403);
    validatePlaybookContent(normalizePlaybookContent(parseJson(row.content_json, {}), { code: row.code, title: row.procedure_title }));
    const req = transaction.request();
    req.input("id", sql.NVarChar(64), versionId).input("at", sql.DateTime2(3), new Date());
    await req.query("UPDATE helpdesk.playbook_versions SET status=N'submitted',submitted_at=@at,updated_at=@at WHERE id=@id");
    await addEvent(transaction, { procedureId: row.procedure_id, versionId, action: "submitted", actor });
    await transaction.commit();
    return getPlaybookProcedure(row.procedure_id);
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

export async function publishPlaybookVersion(session, versionId, { reviewNote = "" } = {}) {
  if (session.role !== "admin") throw httpError("Chỉ quản trị viên được phê duyệt và phát hành", 403);
  const actor = actorValues(session);
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const row = await findVersion(transaction, versionId);
    if (!row) throw httpError("Không tìm thấy phiên bản", 404);
    if (!['submitted', 'draft', 'rejected'].includes(row.status)) throw httpError("Phiên bản không thể phát hành", 409);
    const content = validatePlaybookContent(normalizePlaybookContent(parseJson(row.content_json, {}), { code: row.code, title: row.procedure_title }), { publishing: true });
    content.id = row.code;
    content.approved = true;
    content.active = true;
    content.version = String(row.version_number);
    const at = new Date();

    const supersede = transaction.request();
    supersede.input("procedure_id", sql.NVarChar(64), row.procedure_id).input("at", sql.DateTime2(3), at);
    await supersede.query("UPDATE helpdesk.playbook_versions SET status=N'superseded',updated_at=@at WHERE procedure_id=@procedure_id AND status=N'published'");

    const req = transaction.request();
    req.input("id", sql.NVarChar(64), versionId)
      .input("content_json", sql.NVarChar(sql.MAX), JSON.stringify(content))
      .input("reviewed_by", sql.NVarChar(64), actor.id)
      .input("reviewed_by_name", sql.NVarChar(200), actor.name)
      .input("review_note", sql.NVarChar(1000), string(reviewNote, 1000))
      .input("at", sql.DateTime2(3), at);
    await req.query(`UPDATE helpdesk.playbook_versions SET status=N'published',content_json=@content_json,reviewed_by=@reviewed_by,reviewed_by_name=@reviewed_by_name,reviewed_at=@at,review_note=@review_note,published_at=@at,updated_at=@at WHERE id=@id`);

    const procReq = transaction.request();
    procReq.input("procedure_id", sql.NVarChar(64), row.procedure_id)
      .input("version_id", sql.NVarChar(64), versionId)
      .input("title", sql.NVarChar(220), content.title)
      .input("category", sql.NVarChar(50), content.category)
      .input("audience", sql.NVarChar(30), content.audience)
      .input("at", sql.DateTime2(3), at);
    await procReq.query("UPDATE helpdesk.playbook_procedures SET title=@title,category=@category,audience=@audience,lifecycle_status=N'active',current_version_id=@version_id,updated_at=@at WHERE id=@procedure_id");
    await addEvent(transaction, { procedureId: row.procedure_id, versionId, action: "published", actor, detail: { versionNumber: row.version_number, reviewNote } });
    await transaction.commit();
    return getPlaybookProcedure(row.procedure_id);
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

export async function rejectPlaybookVersion(session, versionId, { reviewNote = "" } = {}) {
  if (session.role !== "admin") throw httpError("Chỉ quản trị viên được từ chối phiên bản", 403);
  if (!string(reviewNote, 1000)) throw httpError("Cần ghi rõ lý do từ chối", 422);
  const actor = actorValues(session);
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const row = await findVersion(transaction, versionId);
    if (!row) throw httpError("Không tìm thấy phiên bản", 404);
    if (row.status !== "submitted") throw httpError("Chỉ bản đã gửi duyệt mới có thể bị từ chối", 409);
    const req = transaction.request();
    req.input("id", sql.NVarChar(64), versionId)
      .input("reviewed_by", sql.NVarChar(64), actor.id)
      .input("reviewed_by_name", sql.NVarChar(200), actor.name)
      .input("review_note", sql.NVarChar(1000), string(reviewNote, 1000))
      .input("at", sql.DateTime2(3), new Date());
    await req.query("UPDATE helpdesk.playbook_versions SET status=N'rejected',reviewed_by=@reviewed_by,reviewed_by_name=@reviewed_by_name,reviewed_at=@at,review_note=@review_note,updated_at=@at WHERE id=@id");
    await addEvent(transaction, { procedureId: row.procedure_id, versionId, action: "rejected", actor, detail: { reviewNote } });
    await transaction.commit();
    return getPlaybookProcedure(row.procedure_id);
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

export async function setProcedureLifecycle(session, procedureId, lifecycleStatus, note = "") {
  if (session.role !== "admin") throw httpError("Chỉ quản trị viên được thay đổi vòng đời procedure", 403);
  if (!PROCEDURE_STATUSES.has(lifecycleStatus)) throw httpError("Trạng thái vòng đời không hợp lệ", 422);
  const actor = actorValues(session);
  const pool = await getSqlServerPool();
  const req = pool.request();
  req.input("id", sql.NVarChar(64), procedureId)
    .input("status", sql.NVarChar(30), lifecycleStatus)
    .input("at", sql.DateTime2(3), new Date());
  const result = await req.query("UPDATE helpdesk.playbook_procedures SET lifecycle_status=@status,updated_at=@at WHERE id=@id; SELECT @@ROWCOUNT AS affected");
  if (!Number(result.recordset?.[0]?.affected || 0)) throw httpError("Không tìm thấy procedure", 404);
  await addEvent(pool, { procedureId, action: lifecycleStatus, actor, detail: { note: string(note, 1000) } });
  return getPlaybookProcedure(procedureId);
}

export async function rollbackPlaybookVersion(session, historicalVersionId, { reviewNote = "Rollback phiên bản" } = {}) {
  if (session.role !== "admin") throw httpError("Chỉ quản trị viên được rollback", 403);
  const pool = await getSqlServerPool();
  const row = await findVersion(pool, historicalVersionId);
  if (!row) throw httpError("Không tìm thấy phiên bản", 404);
  const created = await createPlaybookVersion(session, row.procedure_id, {
    ...parseJson(row.content_json, {}),
    changeSummary: `Rollback từ v${row.version_number}: ${string(reviewNote, 800)}`,
  });
  const draft = created.versions.find((version) => version.status === "draft" && version.createdBy === session.sub);
  if (!draft) throw httpError("Không tạo được bản rollback", 500);
  return publishPlaybookVersion(session, draft.id, { reviewNote });
}

export async function getPlaybookProcedure(procedureId) {
  const pool = await getSqlServerPool();
  const req = pool.request();
  req.input("procedure_id", sql.NVarChar(64), procedureId);
  const procedureResult = await req.query("SELECT * FROM helpdesk.playbook_procedures WHERE id=@procedure_id");
  const procedure = procedureResult.recordset?.[0];
  if (!procedure) throw httpError("Không tìm thấy procedure", 404);
  const versionsReq = pool.request();
  versionsReq.input("procedure_id", sql.NVarChar(64), procedureId);
  const versionsResult = await versionsReq.query("SELECT * FROM helpdesk.playbook_versions WHERE procedure_id=@procedure_id ORDER BY version_number DESC");
  const eventsReq = pool.request();
  eventsReq.input("procedure_id", sql.NVarChar(64), procedureId);
  const eventsResult = await eventsReq.query("SELECT TOP (100) * FROM helpdesk.playbook_events WHERE procedure_id=@procedure_id ORDER BY created_at DESC");
  return {
    id: procedure.id,
    code: procedure.code,
    title: procedure.title,
    category: procedure.category,
    audience: procedure.audience,
    lifecycleStatus: procedure.lifecycle_status,
    currentVersionId: procedure.current_version_id || null,
    ownerId: procedure.owner_id || "",
    ownerName: procedure.owner_name || "",
    createdBy: procedure.created_by,
    createdByName: procedure.created_by_name,
    createdAt: procedure.created_at?.toISOString?.() || procedure.created_at,
    updatedAt: procedure.updated_at?.toISOString?.() || procedure.updated_at,
    versions: versionsResult.recordset.map((row) => ({
      id: row.id,
      procedureId: row.procedure_id,
      versionNumber: Number(row.version_number),
      status: row.status,
      content: parseJson(row.content_json, {}),
      changeSummary: row.change_summary || "",
      sourceTicketId: row.source_ticket_id || null,
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      createdByRole: row.created_by_role,
      submittedAt: row.submitted_at?.toISOString?.() || row.submitted_at || null,
      reviewedBy: row.reviewed_by || null,
      reviewedByName: row.reviewed_by_name || null,
      reviewedAt: row.reviewed_at?.toISOString?.() || row.reviewed_at || null,
      reviewNote: row.review_note || "",
      publishedAt: row.published_at?.toISOString?.() || row.published_at || null,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
      updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
    })),
    events: eventsResult.recordset.map((row) => ({
      id: row.id, action: row.action, versionId: row.version_id || null,
      actorId: row.actor_id, actorName: row.actor_name, actorRole: row.actor_role,
      detail: parseJson(row.detail_json, {}), createdAt: row.created_at?.toISOString?.() || row.created_at,
    })),
  };
}

export async function listPlaybookProcedures({ query = "", status = "", lifecycle = "", limit = 300 } = {}) {
  const pool = await getSqlServerPool();
  const req = pool.request();
  req.input("query", sql.NVarChar(300), `%${string(query, 250)}%`)
    .input("status", sql.NVarChar(30), VERSION_STATUSES.has(status) ? status : "")
    .input("lifecycle", sql.NVarChar(30), PROCEDURE_STATUSES.has(lifecycle) ? lifecycle : "")
    .input("limit", sql.Int, Math.max(1, Math.min(Number(limit) || 300, 1000)));
  const result = await req.query(`
    WITH latest AS (
      SELECT v.*, ROW_NUMBER() OVER (PARTITION BY v.procedure_id ORDER BY
        CASE v.status WHEN N'submitted' THEN 1 WHEN N'draft' THEN 2 WHEN N'rejected' THEN 3 WHEN N'published' THEN 4 ELSE 5 END,
        v.version_number DESC) AS rn
      FROM helpdesk.playbook_versions v
      WHERE (@status=N'' OR v.status=@status)
    )
    SELECT TOP (@limit) p.*, v.id AS version_id, v.version_number, v.status AS version_status,
      v.content_json, v.change_summary, v.source_ticket_id, v.created_by AS version_created_by,
      v.created_by_name AS version_created_by_name, v.created_by_role AS version_created_by_role,
      v.submitted_at, v.reviewed_by, v.reviewed_by_name, v.reviewed_at, v.review_note,
      v.published_at, v.created_at AS version_created_at, v.updated_at AS version_updated_at
    FROM helpdesk.playbook_procedures p
    LEFT JOIN latest v ON v.procedure_id=p.id AND v.rn=1
    WHERE (@lifecycle=N'' OR p.lifecycle_status=@lifecycle)
      AND (@status=N'' OR v.id IS NOT NULL)
      AND (@query=N'%%' OR p.code LIKE @query OR p.title LIKE @query OR v.content_json LIKE @query)
    ORDER BY CASE WHEN v.status=N'submitted' THEN 0 WHEN v.status=N'draft' THEN 1 ELSE 2 END, p.updated_at DESC`);
  return result.recordset.map(mapProcedure);
}

export async function getPlaybookGovernanceStatus() {
  if (!(await isPlaybookGovernanceReady())) return { enabled: false, ready: false, error: "Playbook lifecycle tables are not installed" };
  const pool = await getSqlServerPool();
  const counts = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM helpdesk.playbook_procedures) AS procedures,
      (SELECT COUNT(*) FROM helpdesk.playbook_procedures WHERE lifecycle_status=N'active') AS active_procedures,
      (SELECT COUNT(*) FROM helpdesk.playbook_versions WHERE status=N'draft') AS drafts,
      (SELECT COUNT(*) FROM helpdesk.playbook_versions WHERE status=N'submitted') AS submitted,
      (SELECT COUNT(*) FROM helpdesk.playbook_versions WHERE status=N'rejected') AS rejected,
      (SELECT COUNT(*) FROM helpdesk.playbook_versions WHERE status=N'published') AS published`);
  const index = await pool.request().query("SELECT * FROM helpdesk.playbook_index_state WHERE state_id=1");
  const c = counts.recordset?.[0] || {};
  const i = index.recordset?.[0] || {};
  return {
    enabled: true,
    ready: true,
    counts: {
      procedures: Number(c.procedures || 0), activeProcedures: Number(c.active_procedures || 0),
      drafts: Number(c.drafts || 0), submitted: Number(c.submitted || 0), rejected: Number(c.rejected || 0), published: Number(c.published || 0),
    },
    workflow: ["draft", "submitted", "published", "superseded"],
    technicianCanPublish: false,
    index: {
      status: i.status || "idle", requestedAt: i.requested_at?.toISOString?.() || i.requested_at || null,
      requestedBy: i.requested_by || "", startedAt: i.started_at?.toISOString?.() || i.started_at || null,
      completedAt: i.completed_at?.toISOString?.() || i.completed_at || null,
      sourceFingerprint: i.source_fingerprint || "", indexedEntries: Number(i.indexed_entries || 0),
      error: i.error_message || "", updatedAt: i.updated_at?.toISOString?.() || i.updated_at || null,
    },
    checkedAt: nowIso(),
  };
}

export async function updatePlaybookIndexState(status, detail = {}) {
  if (!(await isPlaybookGovernanceReady())) return;
  const pool = await getSqlServerPool();
  const req = pool.request();
  const now = new Date();
  req.input("status", sql.NVarChar(30), status)
    .input("requested_by", sql.NVarChar(200), string(detail.requestedBy, 200))
    .input("source_fingerprint", sql.NVarChar(128), string(detail.sourceFingerprint, 128))
    .input("indexed_entries", sql.Int, Number(detail.indexedEntries || 0))
    .input("error_message", sql.NVarChar(2000), string(detail.error, 2000))
    .input("now", sql.DateTime2(3), now);
  await req.query(`UPDATE helpdesk.playbook_index_state SET
    status=@status,
    requested_at=CASE WHEN @status=N'queued' THEN @now ELSE requested_at END,
    requested_by=CASE WHEN @requested_by=N'' THEN requested_by ELSE @requested_by END,
    started_at=CASE WHEN @status=N'building' THEN @now ELSE started_at END,
    completed_at=CASE WHEN @status IN (N'ready',N'failed') THEN @now ELSE completed_at END,
    source_fingerprint=CASE WHEN @source_fingerprint=N'' THEN source_fingerprint ELSE @source_fingerprint END,
    indexed_entries=CASE WHEN @status=N'ready' THEN @indexed_entries ELSE indexed_entries END,
    error_message=@error_message,
    updated_at=@now WHERE state_id=1`);
}

export async function loadPublishedManagedPlaybook() {
  if (!(await isPlaybookGovernanceReady())) return null;
  const pool = await getSqlServerPool();
  const result = await pool.request().query(`
    SELECT p.code, p.updated_at, v.version_number, v.content_json, v.updated_at AS version_updated_at
    FROM helpdesk.playbook_procedures p
    JOIN helpdesk.playbook_versions v ON v.id=p.current_version_id AND v.status=N'published'
    WHERE p.lifecycle_status=N'active'
    ORDER BY p.code`);
  if (!result.recordset.length) return null;
  const entries = result.recordset.map((row) => {
    const content = normalizePlaybookContent(parseJson(row.content_json, {}), { code: row.code });
    content.id = row.code;
    content.approved = true;
    content.active = true;
    content.version = String(row.version_number);
    content.sourceType = content.sourceType || "managed-playbook";
    return content;
  });
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(entries)).digest("hex");
  return {
    metadata: {
      name: "Enterprise Playbook – Managed Lifecycle",
      version: `sql-${result.recordset.length}`,
      description: "Published procedures managed in SQL Server",
      security: { workflow: "draft-review-publish", technicianDirectPublish: false },
    },
    entries,
    fingerprint,
    loadedAt: nowIso(),
    source: "sqlserver-governance",
  };
}

export async function seedManagedPlaybookFromFile(session = { sub: "seed", name: "Baseline Seeder", role: "admin" }) {
  if (!(await isPlaybookGovernanceReady())) throw httpError("Playbook lifecycle tables are not installed", 503);
  const raw = JSON.parse(await fs.readFile(config.playbookFile, "utf8"));
  const entries = (Array.isArray(raw) ? raw : raw.entries || []);
  const actor = actorValues(session);
  const pool = await getSqlServerPool();
  let inserted = 0;
  let skipped = 0;
  for (const source of entries) {
    const content = validatePlaybookContent(normalizePlaybookContent(source, { code: source.id, title: source.title }));
    const code = string(source.id || content.id, 100);
    content.id = code; content.approved = true; content.active = source.active !== false;
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const check = transaction.request(); check.input("code", sql.NVarChar(100), code);
      const exists = await check.query("SELECT id FROM helpdesk.playbook_procedures WHERE code=@code");
      if (exists.recordset.length) { skipped += 1; await transaction.rollback(); continue; }
      const procedureId = id("pbp"); const versionId = id("pbv"); const at = new Date();
      const procReq = transaction.request();
      procReq.input("id", sql.NVarChar(64), procedureId).input("code", sql.NVarChar(100), code)
        .input("title", sql.NVarChar(220), content.title).input("category", sql.NVarChar(50), content.category)
        .input("audience", sql.NVarChar(30), content.audience).input("current_version_id", sql.NVarChar(64), versionId)
        .input("owner_id", sql.NVarChar(64), actor.id).input("owner_name", sql.NVarChar(200), actor.name)
        .input("created_by", sql.NVarChar(64), actor.id).input("created_by_name", sql.NVarChar(200), actor.name)
        .input("at", sql.DateTime2(3), at);
      await procReq.query(`INSERT INTO helpdesk.playbook_procedures(id,code,title,category,audience,lifecycle_status,current_version_id,owner_id,owner_name,created_by,created_by_name,created_at,updated_at)
        VALUES(@id,@code,@title,@category,@audience,N'active',NULL,@owner_id,@owner_name,@created_by,@created_by_name,@at,@at)`);
      const verReq = transaction.request();
      verReq.input("id", sql.NVarChar(64), versionId).input("procedure_id", sql.NVarChar(64), procedureId)
        .input("content_json", sql.NVarChar(sql.MAX), JSON.stringify(content)).input("created_by", sql.NVarChar(64), actor.id)
        .input("created_by_name", sql.NVarChar(200), actor.name).input("created_by_role", sql.NVarChar(30), actor.role)
        .input("at", sql.DateTime2(3), at);
      await verReq.query(`INSERT INTO helpdesk.playbook_versions(id,procedure_id,version_number,status,content_json,change_summary,created_by,created_by_name,created_by_role,reviewed_by,reviewed_by_name,reviewed_at,published_at,created_at,updated_at)
        VALUES(@id,@procedure_id,1,N'published',@content_json,N'Imported baseline enterprise playbook',@created_by,@created_by_name,@created_by_role,@created_by,@created_by_name,@at,@at,@at,@at)`);
      const currentReq = transaction.request(); currentReq.input("procedure_id", sql.NVarChar(64), procedureId).input("version_id", sql.NVarChar(64), versionId);
      await currentReq.query("UPDATE helpdesk.playbook_procedures SET current_version_id=@version_id WHERE id=@procedure_id");
      await addEvent(transaction, { procedureId, versionId, action: "baseline_seeded", actor, detail: { code } });
      await transaction.commit(); inserted += 1;
    } catch (error) { await transaction.rollback().catch(() => undefined); throw error; }
  }
  return { inserted, skipped, total: entries.length };
}

export function draftPayloadFromTicket(ticket, messages = []) {
  const technicianMessages = messages.filter((item) => item.role === "technician").map((item) => item.body).filter(Boolean);
  const resolution = string(redactSensitiveText(ticket.resolution || technicianMessages.at(-1) || ""), 2000);
  const title = string(ticket.title || "Procedure từ ticket", 220);
  const symptoms = [ticket.description, ...messages.filter((item) => item.role === "user").map((item) => item.body)]
    .map((item) => string(redactSensitiveText(item), 700)).filter(Boolean).slice(0, 8);
  const steps = resolution
    ? resolution.split(/\r?\n|\d+[.)]\s+/).map((item) => string(item, 800)).filter((item) => item.length > 5).slice(0, 20)
    : ["Kỹ thuật viên bổ sung các bước đã xác minh trong quá trình xử lý ticket."];
  const keywordTokens = normalizeText(`${title} ${ticket.description || ""}`).split(/\s+/).filter((item) => item.length > 3);
  return {
    code: `DRAFT-${ticket.code}`,
    title,
    category: CATEGORIES.has(ticket.category) ? ticket.category : "other",
    audience: "technician",
    risk: RISKS.has(ticket.risk) ? ticket.risk : "medium",
    priority: PRIORITIES.has(ticket.priority) ? ticket.priority : "normal",
    autoEligible: false,
    summary: `Bản nháp được tạo từ ${ticket.code}. Cần kỹ thuật viên chuẩn hóa và quản trị viên phê duyệt trước khi AI sử dụng.`,
    symptoms,
    requiredQuestions: [],
    steps,
    forbiddenSteps: [],
    keywords: [...new Set(keywordTokens)].slice(0, 15),
    sourceRefs: [{ document: ticket.code, section: "resolved-ticket", title: title }],
    notes: `Nguồn ticket: ${ticket.code}. Resolution gốc: ${resolution}`,
    sourceTicketId: ticket.id,
    changeSummary: `Đề xuất từ ticket đã xử lý ${ticket.code}`,
  };
}
