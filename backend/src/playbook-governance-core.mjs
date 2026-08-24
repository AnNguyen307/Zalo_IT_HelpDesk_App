import { slug } from "./utils.mjs";

export const VERSION_STATUSES = new Set(["draft", "submitted", "rejected", "published", "superseded", "archived"]);
export const PROCEDURE_STATUSES = new Set(["active", "deprecated", "archived"]);
export const CATEGORIES = new Set(["network", "printer", "windows", "office", "account", "software", "hardware", "other"]);
export const AUDIENCES = new Set(["employee", "technician", "both"]);
export const RISKS = new Set(["low", "medium", "high"]);
export const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

export function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function boundedString(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function stringArray(value, maxItems = 30, maxChars = 500) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => boundedString(item, maxChars)).filter(Boolean).slice(0, maxItems);
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
    document: boundedString(item?.document, 240),
    section: boundedString(item?.section, 160),
    title: boundedString(item?.title, 240),
  })).filter((item) => item.document || item.title);
}

export function normalizePlaybookContent(payload = {}, { code = "", title = "" } = {}) {
  const risk = RISKS.has(payload.risk) ? payload.risk : "medium";
  const audience = AUDIENCES.has(payload.audience) ? payload.audience : "technician";
  let autoEligible = Boolean(payload.autoEligible);
  if (risk === "high" || audience === "technician") autoEligible = false;

  const entry = {
    id: boundedString(payload.id || code || slug(title || payload.title), 100),
    title: boundedString(payload.title || title, 220),
    category: CATEGORIES.has(payload.category) ? payload.category : "other",
    audience,
    risk,
    priority: PRIORITIES.has(payload.priority) ? payload.priority : "normal",
    autoEligible,
    approved: false,
    active: true,
    version: boundedString(payload.version || "1.0", 30),
    sourceType: boundedString(payload.sourceType || "managed-playbook", 80),
    summary: boundedString(payload.summary, 2000),
    symptoms: stringArray(payload.symptoms, 30, 400),
    requiredQuestions: stringArray(payload.requiredQuestions, 30, 500),
    steps: stringArray(payload.steps, 40, 1000),
    commands: stringArray(payload.commands, 20, 1000),
    forbiddenSteps: stringArray(payload.forbiddenSteps, 30, 1000),
    keywords: stringArray(payload.keywords, 50, 200),
    sourceRefs: normalizeSourceRefs(payload.sourceRefs),
    notes: boundedString(payload.notes, 3000),
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

export function parseJson(value, fallback = null) {
  if (value && typeof value === "object") return value;
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export function actorValues(session) {
  return {
    id: boundedString(session?.sub || "system", 64),
    name: boundedString(session?.name || "Hệ thống", 200),
    role: boundedString(session?.role || "system", 30),
  };
}
