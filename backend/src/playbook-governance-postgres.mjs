import crypto from "node:crypto";
import fs from "node:fs/promises";
import { config } from "./config.mjs";
import { getPostgresPool } from "./store-postgres.mjs";
import {
  PROCEDURE_STATUSES,
  VERSION_STATUSES,
  actorValues,
  boundedString,
  httpError,
  normalizePlaybookContent,
  parseJson,
  validatePlaybookContent,
} from "./playbook-governance-core.mjs";
import { id, nowIso } from "./utils.mjs";

const GOVERNANCE_LOCK_ID = 51700;
const INDEX_STATUSES = new Set(["idle", "queued", "building", "ready", "failed"]);

function iso(value) {
  return value?.toISOString?.() || value || null;
}

function canEditVersion(session, row) {
  return session.role === "admin" || (session.role === "technician" && row.created_by === session.sub);
}

function mapVersion(row) {
  return {
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
    submittedAt: iso(row.submitted_at),
    reviewedBy: row.reviewed_by || null,
    reviewedByName: row.reviewed_by_name || null,
    reviewedAt: iso(row.reviewed_at),
    reviewNote: row.review_note || "",
    publishedAt: iso(row.published_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapProcedureSummary(row) {
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
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    version: row.version_id ? mapVersion({
      id: row.version_id,
      procedure_id: row.id,
      version_number: row.version_number,
      status: row.version_status,
      content_json: row.content_json,
      change_summary: row.change_summary,
      source_ticket_id: row.source_ticket_id,
      created_by: row.version_created_by,
      created_by_name: row.version_created_by_name,
      created_by_role: row.version_created_by_role,
      submitted_at: row.submitted_at,
      reviewed_by: row.reviewed_by,
      reviewed_by_name: row.reviewed_by_name,
      reviewed_at: row.reviewed_at,
      review_note: row.review_note,
      published_at: row.published_at,
      created_at: row.version_created_at,
      updated_at: row.version_updated_at,
    }) : null,
  };
}

export async function withGovernanceTransaction(targetPool, taskBody, { attempts = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = await targetPool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await client.query("SELECT pg_advisory_xact_lock($1)", [GOVERNANCE_LOCK_ID]);
      const result = await taskBody(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      lastError = error;
      await client.query("ROLLBACK").catch(() => undefined);
      if (!["40001", "40P01"].includes(error?.code) || attempt === attempts) throw error;
    } finally {
      client.release();
    }
  }
  throw lastError;
}

async function addEvent(executor, { procedureId, versionId = null, action, actor, detail = {} }) {
  await executor.query(`INSERT INTO public.helpdesk_playbook_events
    (id,procedure_id,version_id,action,actor_id,actor_name,actor_role,detail_json,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW())`,
  [id("pbe"), procedureId, versionId, action, actor.id, actor.name, actor.role, JSON.stringify(detail || {})]);
}

async function findVersion(executor, versionId, { lock = false } = {}) {
  const result = await executor.query(`SELECT v.*, p.code, p.title AS procedure_title, p.lifecycle_status, p.owner_id
    FROM public.helpdesk_playbook_versions v
    JOIN public.helpdesk_playbook_procedures p ON p.id=v.procedure_id
    WHERE v.id=$1${lock ? " FOR UPDATE OF v, p" : ""}`, [versionId]);
  return result.rows?.[0] || null;
}

export function createPostgresPlaybookGovernanceRepository(targetPool) {
  async function isReady() {
    try {
      const result = await targetPool.query(`SELECT
        to_regclass('public.helpdesk_playbook_procedures') IS NOT NULL
        AND to_regclass('public.helpdesk_playbook_versions') IS NOT NULL
        AND to_regclass('public.helpdesk_playbook_events') IS NOT NULL
        AND to_regclass('public.helpdesk_playbook_index_state') IS NOT NULL AS ready`);
      return Boolean(result.rows?.[0]?.ready);
    } catch { return false; }
  }

  async function getProcedure(procedureId) {
    const procedureResult = await targetPool.query("SELECT * FROM public.helpdesk_playbook_procedures WHERE id=$1", [procedureId]);
    const procedure = procedureResult.rows?.[0];
    if (!procedure) throw httpError("Không tìm thấy procedure", 404);
    const [versionsResult, eventsResult] = await Promise.all([
      targetPool.query("SELECT * FROM public.helpdesk_playbook_versions WHERE procedure_id=$1 ORDER BY version_number DESC", [procedureId]),
      targetPool.query("SELECT * FROM public.helpdesk_playbook_events WHERE procedure_id=$1 ORDER BY created_at DESC LIMIT 100", [procedureId]),
    ]);
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
      createdAt: iso(procedure.created_at),
      updatedAt: iso(procedure.updated_at),
      versions: versionsResult.rows.map(mapVersion),
      events: eventsResult.rows.map((row) => ({
        id: row.id,
        action: row.action,
        versionId: row.version_id || null,
        actorId: row.actor_id,
        actorName: row.actor_name,
        actorRole: row.actor_role,
        detail: parseJson(row.detail_json, {}),
        createdAt: iso(row.created_at),
      })),
    };
  }

  async function createDraft(session, payload = {}) {
    if (!["admin", "technician"].includes(session.role)) throw httpError("Staff authentication required", 403);
    const actor = actorValues(session);
    const content = validatePlaybookContent(normalizePlaybookContent(payload, { code: payload.code, title: payload.title }));
    const procedureId = id("pbp"); const versionId = id("pbv");
    const code = boundedString(payload.code || content.id || `PB-${Date.now()}`, 100).toUpperCase().replace(/[^A-Z0-9_-]+/g, "-");
    content.id = code;
    await withGovernanceTransaction(targetPool, async (client) => {
      const exists = await client.query("SELECT id FROM public.helpdesk_playbook_procedures WHERE code=$1", [code]);
      if (exists.rows.length) throw httpError("Mã procedure đã tồn tại", 409);
      const at = new Date();
      await client.query(`INSERT INTO public.helpdesk_playbook_procedures
        (id,code,title,category,audience,lifecycle_status,current_version_id,owner_id,owner_name,created_by,created_by_name,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,'active',NULL,$6,$7,$8,$9,$10,$10)`,
      [procedureId, code, content.title, content.category, content.audience, actor.id, actor.name, actor.id, actor.name, at]);
      await client.query(`INSERT INTO public.helpdesk_playbook_versions
        (id,procedure_id,version_number,status,content_json,change_summary,source_ticket_id,created_by,created_by_name,created_by_role,created_at,updated_at)
        VALUES($1,$2,1,'draft',$3::jsonb,$4,$5,$6,$7,$8,$9,$9)`,
      [versionId, procedureId, JSON.stringify(content), boundedString(payload.changeSummary || "Tạo procedure mới", 1000), boundedString(payload.sourceTicketId, 64) || null, actor.id, actor.name, actor.role, at]);
      await addEvent(client, { procedureId, versionId, action: "draft_created", actor, detail: { code, sourceTicketId: payload.sourceTicketId || null } });
    });
    return getProcedure(procedureId);
  }

  async function createVersion(session, procedureId, payload = {}) {
    if (!["admin", "technician"].includes(session.role)) throw httpError("Staff authentication required", 403);
    const actor = actorValues(session);
    let versionId;
    await withGovernanceTransaction(targetPool, async (client) => {
      const procResult = await client.query(`SELECT p.*, v.content_json FROM public.helpdesk_playbook_procedures p
        LEFT JOIN public.helpdesk_playbook_versions v ON v.id=p.current_version_id WHERE p.id=$1 FOR UPDATE OF p`, [procedureId]);
      const proc = procResult.rows?.[0];
      if (!proc) throw httpError("Không tìm thấy procedure", 404);
      const source = payload.content || parseJson(proc.content_json, {});
      const content = validatePlaybookContent(normalizePlaybookContent({ ...source, ...payload }, { code: proc.code, title: proc.title }));
      content.id = proc.code;
      const versionResult = await client.query("SELECT COALESCE(MAX(version_number),0)+1 AS next_version FROM public.helpdesk_playbook_versions WHERE procedure_id=$1", [procedureId]);
      const versionNumber = Number(versionResult.rows?.[0]?.next_version || 1);
      versionId = id("pbv"); const at = new Date();
      await client.query(`INSERT INTO public.helpdesk_playbook_versions
        (id,procedure_id,version_number,status,content_json,change_summary,source_ticket_id,created_by,created_by_name,created_by_role,created_at,updated_at)
        VALUES($1,$2,$3,'draft',$4::jsonb,$5,$6,$7,$8,$9,$10,$10)`,
      [versionId, procedureId, versionNumber, JSON.stringify(content), boundedString(payload.changeSummary || `Tạo bản nháp v${versionNumber}`, 1000), boundedString(payload.sourceTicketId, 64) || null, actor.id, actor.name, actor.role, at]);
      await addEvent(client, { procedureId, versionId, action: "version_created", actor, detail: { versionNumber } });
    });
    return getProcedure(procedureId);
  }

  async function updateDraft(session, versionId, payload = {}) {
    const actor = actorValues(session); let procedureId;
    await withGovernanceTransaction(targetPool, async (client) => {
      const row = await findVersion(client, versionId, { lock: true });
      if (!row) throw httpError("Không tìm thấy phiên bản", 404);
      if (!["draft", "rejected"].includes(row.status)) throw httpError("Chỉ có thể sửa bản nháp hoặc bản bị từ chối", 409);
      if (!canEditVersion(session, row)) throw httpError("Bạn không có quyền sửa bản nháp này", 403);
      procedureId = row.procedure_id;
      const content = validatePlaybookContent(normalizePlaybookContent({ ...parseJson(row.content_json, {}), ...payload }, { code: row.code, title: row.procedure_title }));
      content.id = row.code;
      await client.query(`UPDATE public.helpdesk_playbook_versions SET status='draft',content_json=$2::jsonb,
        change_summary=$3,review_note='',updated_at=NOW() WHERE id=$1`,
      [versionId, JSON.stringify(content), boundedString(payload.changeSummary ?? row.change_summary, 1000)]);
      await addEvent(client, { procedureId, versionId, action: "draft_updated", actor, detail: { fields: Object.keys(payload) } });
    });
    return getProcedure(procedureId);
  }

  async function submitVersion(session, versionId) {
    const actor = actorValues(session); let procedureId;
    await withGovernanceTransaction(targetPool, async (client) => {
      const row = await findVersion(client, versionId, { lock: true });
      if (!row) throw httpError("Không tìm thấy phiên bản", 404);
      if (!["draft", "rejected"].includes(row.status)) throw httpError("Phiên bản không ở trạng thái có thể gửi duyệt", 409);
      if (!canEditVersion(session, row)) throw httpError("Bạn không có quyền gửi bản nháp này", 403);
      validatePlaybookContent(normalizePlaybookContent(parseJson(row.content_json, {}), { code: row.code, title: row.procedure_title }));
      procedureId = row.procedure_id;
      await client.query("UPDATE public.helpdesk_playbook_versions SET status='submitted',submitted_at=NOW(),updated_at=NOW() WHERE id=$1", [versionId]);
      await addEvent(client, { procedureId, versionId, action: "submitted", actor });
    });
    return getProcedure(procedureId);
  }

  async function publishVersion(session, versionId, { reviewNote = "" } = {}) {
    if (session.role !== "admin") throw httpError("Chỉ quản trị viên được phê duyệt và phát hành", 403);
    const actor = actorValues(session); let procedureId;
    await withGovernanceTransaction(targetPool, async (client) => {
      const row = await findVersion(client, versionId, { lock: true });
      if (!row) throw httpError("Không tìm thấy phiên bản", 404);
      if (!["submitted", "draft", "rejected"].includes(row.status)) throw httpError("Phiên bản không thể phát hành", 409);
      const content = validatePlaybookContent(normalizePlaybookContent(parseJson(row.content_json, {}), { code: row.code, title: row.procedure_title }), { publishing: true });
      content.id = row.code; content.approved = true; content.active = true; content.version = String(row.version_number);
      procedureId = row.procedure_id;
      await client.query("UPDATE public.helpdesk_playbook_versions SET status='superseded',updated_at=NOW() WHERE procedure_id=$1 AND status='published'", [procedureId]);
      await client.query(`UPDATE public.helpdesk_playbook_versions SET status='published',content_json=$2::jsonb,
        reviewed_by=$3,reviewed_by_name=$4,reviewed_at=NOW(),review_note=$5,published_at=NOW(),updated_at=NOW() WHERE id=$1`,
      [versionId, JSON.stringify(content), actor.id, actor.name, boundedString(reviewNote, 1000)]);
      await client.query(`UPDATE public.helpdesk_playbook_procedures SET title=$2,category=$3,audience=$4,
        lifecycle_status='active',current_version_id=$5,updated_at=NOW() WHERE id=$1`,
      [procedureId, content.title, content.category, content.audience, versionId]);
      await addEvent(client, { procedureId, versionId, action: "published", actor, detail: { versionNumber: row.version_number, reviewNote } });
    });
    return getProcedure(procedureId);
  }

  async function rejectVersion(session, versionId, { reviewNote = "" } = {}) {
    if (session.role !== "admin") throw httpError("Chỉ quản trị viên được từ chối phiên bản", 403);
    if (!boundedString(reviewNote, 1000)) throw httpError("Cần ghi rõ lý do từ chối", 422);
    const actor = actorValues(session); let procedureId;
    await withGovernanceTransaction(targetPool, async (client) => {
      const row = await findVersion(client, versionId, { lock: true });
      if (!row) throw httpError("Không tìm thấy phiên bản", 404);
      if (row.status !== "submitted") throw httpError("Chỉ bản đã gửi duyệt mới có thể bị từ chối", 409);
      procedureId = row.procedure_id;
      await client.query(`UPDATE public.helpdesk_playbook_versions SET status='rejected',reviewed_by=$2,
        reviewed_by_name=$3,reviewed_at=NOW(),review_note=$4,updated_at=NOW() WHERE id=$1`,
      [versionId, actor.id, actor.name, boundedString(reviewNote, 1000)]);
      await addEvent(client, { procedureId, versionId, action: "rejected", actor, detail: { reviewNote } });
    });
    return getProcedure(procedureId);
  }

  async function setLifecycle(session, procedureId, lifecycleStatus, note = "") {
    if (session.role !== "admin") throw httpError("Chỉ quản trị viên được thay đổi vòng đời procedure", 403);
    if (!PROCEDURE_STATUSES.has(lifecycleStatus)) throw httpError("Trạng thái vòng đời không hợp lệ", 422);
    const actor = actorValues(session);
    await withGovernanceTransaction(targetPool, async (client) => {
      const result = await client.query("UPDATE public.helpdesk_playbook_procedures SET lifecycle_status=$2,updated_at=NOW() WHERE id=$1 RETURNING id", [procedureId, lifecycleStatus]);
      if (!result.rows.length) throw httpError("Không tìm thấy procedure", 404);
      await addEvent(client, { procedureId, action: lifecycleStatus, actor, detail: { note: boundedString(note, 1000) } });
    });
    return getProcedure(procedureId);
  }

  async function rollbackVersion(session, historicalVersionId, { reviewNote = "Rollback phiên bản" } = {}) {
    if (session.role !== "admin") throw httpError("Chỉ quản trị viên được rollback", 403);
    const row = await findVersion(targetPool, historicalVersionId);
    if (!row) throw httpError("Không tìm thấy phiên bản", 404);
    const created = await createVersion(session, row.procedure_id, {
      ...parseJson(row.content_json, {}),
      changeSummary: `Rollback từ v${row.version_number}: ${boundedString(reviewNote, 800)}`,
    });
    const draft = created.versions.find((version) => version.status === "draft" && version.createdBy === session.sub);
    if (!draft) throw httpError("Không tạo được bản rollback", 500);
    return publishVersion(session, draft.id, { reviewNote });
  }

  async function listProcedures({ query = "", status = "", lifecycle = "", limit = 300 } = {}) {
    const normalizedStatus = VERSION_STATUSES.has(status) ? status : "";
    const normalizedLifecycle = PROCEDURE_STATUSES.has(lifecycle) ? lifecycle : "";
    const normalizedQuery = boundedString(query, 250);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 300, 1000));
    const result = await targetPool.query(`WITH latest AS (
      SELECT v.*, ROW_NUMBER() OVER (PARTITION BY v.procedure_id ORDER BY
        CASE v.status WHEN 'submitted' THEN 1 WHEN 'draft' THEN 2 WHEN 'rejected' THEN 3 WHEN 'published' THEN 4 ELSE 5 END,
        v.version_number DESC) AS rn
      FROM public.helpdesk_playbook_versions v WHERE ($1='' OR v.status=$1)
    )
    SELECT p.*, v.id AS version_id, v.version_number, v.status AS version_status,
      v.content_json, v.change_summary, v.source_ticket_id, v.created_by AS version_created_by,
      v.created_by_name AS version_created_by_name, v.created_by_role AS version_created_by_role,
      v.submitted_at, v.reviewed_by, v.reviewed_by_name, v.reviewed_at, v.review_note,
      v.published_at, v.created_at AS version_created_at, v.updated_at AS version_updated_at
    FROM public.helpdesk_playbook_procedures p LEFT JOIN latest v ON v.procedure_id=p.id AND v.rn=1
    WHERE ($2='' OR p.lifecycle_status=$2) AND ($1='' OR v.id IS NOT NULL)
      AND ($3='' OR p.code ILIKE '%'||$3||'%' OR p.title ILIKE '%'||$3||'%' OR v.content_json::text ILIKE '%'||$3||'%')
    ORDER BY CASE WHEN v.status='submitted' THEN 0 WHEN v.status='draft' THEN 1 ELSE 2 END, p.updated_at DESC
    LIMIT $4`, [normalizedStatus, normalizedLifecycle, normalizedQuery, safeLimit]);
    return result.rows.map(mapProcedureSummary);
  }

  async function getStatus() {
    if (!(await isReady())) return { enabled: false, ready: false, provider: "postgres", schemaVersion: 1, error: "PostgreSQL Playbook lifecycle tables are not installed" };
    const [countsResult, indexResult] = await Promise.all([
      targetPool.query(`SELECT
        COUNT(*)::int AS procedures,
        COUNT(*) FILTER (WHERE lifecycle_status='active')::int AS active_procedures,
        (SELECT COUNT(*)::int FROM public.helpdesk_playbook_versions WHERE status='draft') AS drafts,
        (SELECT COUNT(*)::int FROM public.helpdesk_playbook_versions WHERE status='submitted') AS submitted,
        (SELECT COUNT(*)::int FROM public.helpdesk_playbook_versions WHERE status='rejected') AS rejected,
        (SELECT COUNT(*)::int FROM public.helpdesk_playbook_versions WHERE status='published') AS published
        FROM public.helpdesk_playbook_procedures`),
      targetPool.query("SELECT * FROM public.helpdesk_playbook_index_state WHERE state_id=1"),
    ]);
    const c = countsResult.rows?.[0] || {}; const i = indexResult.rows?.[0] || {};
    return {
      enabled: true, ready: true, provider: "postgres", schemaVersion: 1,
      counts: {
        procedures: Number(c.procedures || 0), activeProcedures: Number(c.active_procedures || 0),
        drafts: Number(c.drafts || 0), submitted: Number(c.submitted || 0), rejected: Number(c.rejected || 0), published: Number(c.published || 0),
      },
      workflow: ["draft", "submitted", "published", "superseded"], technicianCanPublish: false,
      index: {
        status: i.status || "idle", requestedAt: iso(i.requested_at), requestedBy: i.requested_by || "",
        startedAt: iso(i.started_at), completedAt: iso(i.completed_at), sourceFingerprint: i.source_fingerprint || "",
        indexedEntries: Number(i.indexed_entries || 0), error: i.error_message || "", updatedAt: iso(i.updated_at),
      },
      checkedAt: nowIso(),
    };
  }

  async function updateIndexState(status, detail = {}) {
    if (!INDEX_STATUSES.has(status) || !(await isReady())) return;
    await targetPool.query(`UPDATE public.helpdesk_playbook_index_state SET
      status=$1,
      requested_at=CASE WHEN $1='queued' THEN NOW() ELSE requested_at END,
      requested_by=CASE WHEN $2='' THEN requested_by ELSE $2 END,
      started_at=CASE WHEN $1='building' THEN NOW() ELSE started_at END,
      completed_at=CASE WHEN $1 IN ('ready','failed') THEN NOW() ELSE completed_at END,
      source_fingerprint=CASE WHEN $3='' THEN source_fingerprint ELSE $3 END,
      indexed_entries=CASE WHEN $1='ready' THEN $4 ELSE indexed_entries END,
      error_message=$5,updated_at=NOW() WHERE state_id=1`,
    [status, boundedString(detail.requestedBy, 200), boundedString(detail.sourceFingerprint, 128), Number(detail.indexedEntries || 0), boundedString(detail.error, 2000)]);
  }

  async function loadPublished() {
    if (!(await isReady())) return null;
    const result = await targetPool.query(`SELECT p.code, p.updated_at, v.version_number, v.content_json, v.updated_at AS version_updated_at
      FROM public.helpdesk_playbook_procedures p JOIN public.helpdesk_playbook_versions v
      ON v.id=p.current_version_id AND v.status='published' WHERE p.lifecycle_status='active' ORDER BY p.code`);
    if (!result.rows.length) return null;
    const entries = result.rows.map((row) => {
      const content = normalizePlaybookContent(parseJson(row.content_json, {}), { code: row.code });
      content.id = row.code; content.approved = true; content.active = true; content.version = String(row.version_number);
      content.sourceType = content.sourceType || "managed-playbook";
      return content;
    });
    return {
      metadata: {
        name: "Enterprise Playbook – Managed Lifecycle", version: `postgres-${result.rows.length}`,
        description: "Published procedures managed in PostgreSQL",
        security: { workflow: "draft-review-publish", technicianDirectPublish: false },
      },
      entries,
      fingerprint: crypto.createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
      loadedAt: nowIso(), source: "postgres-governance",
    };
  }

  async function seedFromFile(session = { sub: "seed", name: "Baseline Seeder", role: "admin" }) {
    if (!(await isReady())) throw httpError("PostgreSQL Playbook lifecycle tables are not installed", 503);
    const raw = JSON.parse(await fs.readFile(config.playbookFile, "utf8"));
    const sources = Array.isArray(raw) ? raw : raw.entries || [];
    const actor = actorValues(session);
    const result = await withGovernanceTransaction(targetPool, async (client) => {
      let inserted = 0; let skipped = 0;
      const existingResult = await client.query("SELECT code FROM public.helpdesk_playbook_procedures");
      const existing = new Set(existingResult.rows.map((row) => row.code));
      for (const source of sources) {
        const content = validatePlaybookContent(normalizePlaybookContent(source, { code: source.id, title: source.title }));
        const code = boundedString(source.id || content.id, 100);
        if (existing.has(code)) { skipped += 1; continue; }
        content.id = code; content.approved = true; content.active = source.active !== false;
        const procedureId = id("pbp"); const versionId = id("pbv"); const at = new Date();
        await client.query(`INSERT INTO public.helpdesk_playbook_procedures
          (id,code,title,category,audience,lifecycle_status,current_version_id,owner_id,owner_name,created_by,created_by_name,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,'active',NULL,$6,$7,$8,$9,$10,$10)`,
        [procedureId, code, content.title, content.category, content.audience, actor.id, actor.name, actor.id, actor.name, at]);
        await client.query(`INSERT INTO public.helpdesk_playbook_versions
          (id,procedure_id,version_number,status,content_json,change_summary,created_by,created_by_name,created_by_role,reviewed_by,reviewed_by_name,reviewed_at,published_at,created_at,updated_at)
          VALUES($1,$2,1,'published',$3::jsonb,'Imported baseline enterprise playbook',$4,$5,$6,$4,$5,$7,$7,$7,$7)`,
        [versionId, procedureId, JSON.stringify(content), actor.id, actor.name, actor.role, at]);
        await client.query("UPDATE public.helpdesk_playbook_procedures SET current_version_id=$2 WHERE id=$1", [procedureId, versionId]);
        await addEvent(client, { procedureId, versionId, action: "baseline_seeded", actor, detail: { code } });
        existing.add(code); inserted += 1;
      }
      return { inserted, skipped };
    });
    return { ...result, total: sources.length };
  }

  return {
    isReady, createDraft, createVersion, updateDraft, submitVersion, publishVersion, rejectVersion,
    setLifecycle, rollbackVersion, getProcedure, listProcedures, getStatus, updateIndexState,
    loadPublished, seedFromFile,
  };
}

let defaultRepository;
function repository() {
  if (!defaultRepository) defaultRepository = createPostgresPlaybookGovernanceRepository(getPostgresPool());
  return defaultRepository;
}

export const isPlaybookGovernanceReady = (...args) => repository().isReady(...args);
export const createPlaybookDraft = (...args) => repository().createDraft(...args);
export const createPlaybookVersion = (...args) => repository().createVersion(...args);
export const updatePlaybookDraft = (...args) => repository().updateDraft(...args);
export const submitPlaybookVersion = (...args) => repository().submitVersion(...args);
export const publishPlaybookVersion = (...args) => repository().publishVersion(...args);
export const rejectPlaybookVersion = (...args) => repository().rejectVersion(...args);
export const setProcedureLifecycle = (...args) => repository().setLifecycle(...args);
export const rollbackPlaybookVersion = (...args) => repository().rollbackVersion(...args);
export const getPlaybookProcedure = (...args) => repository().getProcedure(...args);
export const listPlaybookProcedures = (...args) => repository().listProcedures(...args);
export const getPlaybookGovernanceStatus = (...args) => repository().getStatus(...args);
export const updatePlaybookIndexState = (...args) => repository().updateIndexState(...args);
export const loadPublishedManagedPlaybook = (...args) => repository().loadPublished(...args);
export const seedManagedPlaybookFromFile = (...args) => repository().seedFromFile(...args);
