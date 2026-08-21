import { config } from "./config.mjs";
import { createAiDecisionRecord } from "./ai-quality.mjs";
import { getAiProviderStatus, getAiRoute, requestAiProviderDecision } from "./ai-router.mjs";
import { parseModelJson } from "./ai-json.mjs";
import { searchKnowledgeBase } from "./kb.mjs";
import { searchPlaybook } from "./playbook.mjs";
import { clamp, normalizeText, nowIso } from "./utils.mjs";

const CATEGORIES = ["network", "printer", "windows", "office", "account", "software", "hardware", "other"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const RISKS = ["low", "medium", "high"];
const OUTCOMES = ["need_info", "guide_user", "escalate", "likely_resolved"];

const CATEGORY_RULES = [
  ["printer", ["printer", "may in", "ricoh", "print", "scan", "ket giay"]],
  ["network", ["internet", "wifi", "mang", "dns", "gateway", "lan", "packet"]],
  ["account", ["password", "mat khau", "tai khoan", "account", "login", "otp"]],
  ["office", ["office", "excel", "word", "outlook", "powerpoint", "mail"]],
  ["windows", ["windows", "blue screen", "bsod", "may cham", "treo may", "startup"]],
  ["software", ["phan mem", "software", "install", "cai dat", "license"]],
  ["hardware", ["hardware", "ban phim", "chuot", "man hinh", "o cung", "ram", "nguon"]],
];

const HIGH_RISK = [
  "mat khau", "password", "otp", "account locked", "tai khoan bi khoa", "ransomware", "virus",
  "phishing", "mat du lieu", "data loss", "format", "blue screen", "bsod", "bios", "server",
  "switch", "firewall", "domain controller", "admin account", "chay dien", "khoi", "mui khet",
];

const URGENT = ["toan cong ty", "nhieu nguoi", "khong the lam viec", "server down", "mat mang ca", "production", "khach hang dang cho"];
const RISK_RANK = { low: 0, medium: 1, high: 2 };
const PRIORITY_RANK = { low: 0, normal: 1, high: 2, urgent: 3 };
const SECRET_REQUEST_PATTERNS = [
  /gửi\s+(mật khẩu|password|otp|mã xác minh)/iu,
  /cung cấp\s+(mật khẩu|password|otp|mã xác minh)/iu,
  /tắt\s+(antivirus|windows defender|firewall)/iu,
  /dùng\s+(crack|key lạ|kms)/iu,
  /format\s+(ổ|disk|máy)/iu,
];

const ESCALATION_MESSAGES = {
  no_playbook_match: {
    summary: "Không tìm thấy quy trình đủ phù hợp trong Playbook doanh nghiệp.",
    reply: "Yêu cầu này chưa có quy trình đã được phê duyệt đủ phù hợp trong Playbook doanh nghiệp. Ticket đã được chuyển ngay đến kỹ thuật viên để kiểm tra trực tiếp. Bạn không cần thử thêm các thao tác chưa được HelpDesk xác nhận.",
  },
  playbook_not_auto_eligible: {
    summary: "Playbook xác định tình huống này cần kỹ thuật viên xử lý.",
    reply: "Tình huống đã được đối chiếu với Playbook nhưng không thuộc nhóm được phép tự hướng dẫn. Ticket đã được chuyển ngay đến kỹ thuật viên. Vui lòng giữ nguyên hiện trạng và không tự thay đổi cấu hình, tài khoản hoặc thiết bị.",
  },
  low_confidence: {
    summary: "Agent chưa đạt độ chắc chắn tối thiểu để hướng dẫn an toàn.",
    reply: "Agent chưa đủ chắc chắn để đưa ra hướng dẫn chính xác theo Playbook. Ticket đã được chuyển ngay đến kỹ thuật viên thay vì cung cấp các gợi ý suy đoán.",
  },
  agent_unavailable: {
    summary: "AI provider hiện không sẵn sàng.",
    reply: "AI provider hiện không sẵn sàng nên hệ thống không đưa ra hướng dẫn thay thế thiếu căn cứ. Ticket đã được chuyển ngay đến kỹ thuật viên.",
  },
  policy_blocked: {
    summary: "Chính sách an toàn yêu cầu kỹ thuật viên tiếp nhận.",
    reply: "Đây là tình huống cần kỹ thuật viên xử lý theo chính sách an toàn. Ticket đã được chuyển ngay đến HelpDesk. Không gửi mật khẩu, OTP hoặc dữ liệu nhạy cảm trong nội dung trao đổi.",
  },
};

function categoryMatchesPlaybook(baseCategory, entry) {
  if (!entry) return false;
  if (!baseCategory || baseCategory === "other") return entry.category === "other";
  return entry.category === baseCategory || entry.category === "other";
}

function relevantPlaybookMatches(baseCategory, matches = []) {
  return matches.filter((entry) => Number(entry.score || 0) >= config.playbookAutoMinScore && categoryMatchesPlaybook(baseCategory, entry));
}

function classifyRule(text) {
  const normalized = normalizeText(text);
  const category = CATEGORY_RULES.find(([, terms]) => terms.some((term) => normalized.includes(normalizeText(term))))?.[0] || "other";
  const highRiskMatched = HIGH_RISK.some((term) => normalized.includes(normalizeText(term)));
  const urgentMatched = URGENT.some((term) => normalized.includes(normalizeText(term)));
  const risk = highRiskMatched ? "high" : "low";
  const priority = urgentMatched ? "urgent" : risk === "high" ? "high" : "normal";
  return { category, risk, priority, priorityDetermined: urgentMatched || highRiskMatched };
}

function maxRisk(...values) {
  return values.filter((value) => RISKS.includes(value)).sort((a, b) => RISK_RANK[b] - RISK_RANK[a])[0] || "low";
}

function maxPriority(...values) {
  return values.filter((value) => PRIORITIES.includes(value)).sort((a, b) => PRIORITY_RANK[b] - PRIORITY_RANK[a])[0] || "normal";
}

function compactText(value, max = 4000) {
  return String(value || "").trim().replace(/\u0000/g, "").slice(0, max);
}

function escalationAnalysis({
  ticket,
  base,
  code,
  playbookMatches = [],
  kbIds = [],
  model = null,
  source = "policy-escalation",
  latencyMs = 0,
  reason = "",
  priorityDetermined,
  providerTelemetry = null,
}) {
  const template = ESCALATION_MESSAGES[code] || ESCALATION_MESSAGES.policy_blocked;
  const best = playbookMatches[0];
  const risk = maxRisk(base?.risk, best?.risk);
  return {
    source,
    model,
    generatedAt: nowIso(),
    latencyMs,
    outcome: "escalate",
    category: best?.category || base?.category || classifyRule(`${ticket?.title || ""} ${ticket?.description || ""}`).category,
    priority: maxPriority(base?.priority, best?.priority, risk === "high" ? "high" : "normal"),
    priorityDetermined: typeof priorityDetermined === "boolean"
      ? priorityDetermined
      : Boolean(PRIORITIES.includes(best?.priority) || base?.priorityDetermined),
    risk,
    confidence: 0,
    kbIds,
    playbookIds: playbookMatches.map((item) => item.id),
    playbookSources: playbookMatches.map((item) => ({
      id: item.id, title: item.title, version: item.version, score: item.score, sourceType: item.sourceType,
    })),
    summary: template.summary,
    reply: template.reply,
    steps: [],
    questions: [],
    canAutoHandle: false,
    escalated: true,
    escalationCode: code,
    reason: reason || template.summary,
    providerTelemetry,
  };
}


function safeReply(reply, fallback) {
  const text = compactText(reply, 2500);
  if (!text) return fallback;
  if (SECRET_REQUEST_PATTERNS.some((pattern) => pattern.test(text))) return fallback;
  return text;
}

function ruleReply({ best, risk, canAutoHandle }) {
  if (canAutoHandle && best) {
    return `Tôi đã đối chiếu yêu cầu với Playbook doanh nghiệp “${best.title}”. Các bước bên dưới được lấy trực tiếp từ quy trình đã phê duyệt.`;
  }
  return risk === "high"
    ? ESCALATION_MESSAGES.policy_blocked.reply
    : ESCALATION_MESSAGES.low_confidence.reply;
}

export function analyzeWithRules(ticket, entries, context = {}, playbookMatches = []) {
  const latest = compactText(context.latestUserMessage || "", 2500);
  const fullText = `${ticket.title}
${ticket.description}
${latest}`;
  const base = classifyRule(fullText);
  const matches = searchKnowledgeBase(fullText, entries, 3);
  const relevant = relevantPlaybookMatches(base.category, playbookMatches);
  const bestPlaybook = relevant[0];

  if (config.agentStrictEscalation && config.agentRequirePlaybook && !bestPlaybook) {
    return escalationAnalysis({ ticket, base, code: "no_playbook_match", kbIds: matches.map((item) => item.id) });
  }

  if (bestPlaybook && (!bestPlaybook.autoEligible || bestPlaybook.risk === "high")) {
    return escalationAnalysis({ ticket, base, code: "playbook_not_auto_eligible", playbookMatches: relevant, kbIds: matches.map((item) => item.id) });
  }

  const best = bestPlaybook || (!config.agentRequirePlaybook ? matches[0] : null);
  const confidence = best ? clamp(0.45 + Number(best.score || 0) * 0.5, 0, 0.97) : 0;
  const risk = maxRisk(base.risk, best?.risk);
  const requiredConfidence = Math.max(config.autoResolveThreshold, config.agentMinConfidence);
  const canAutoHandle = Boolean(best && best.autoEligible && risk !== "high" && confidence >= requiredConfidence);

  if (!canAutoHandle && config.agentStrictEscalation) {
    return escalationAnalysis({
      ticket, base, code: best ? "low_confidence" : "no_playbook_match", playbookMatches: relevant, kbIds: matches.map((item) => item.id),
    });
  }

  const analysis = {
    source: bestPlaybook ? "playbook-rules" : "rules-local",
    model: null,
    generatedAt: nowIso(),
    latencyMs: 0,
    outcome: canAutoHandle ? "guide_user" : "escalate",
    category: best?.category || base.category,
    priority: maxPriority(base.priority, best?.priority, risk === "high" ? "high" : "normal"),
    priorityDetermined: Boolean(PRIORITIES.includes(best?.priority) || base.priorityDetermined),
    risk,
    confidence,
    kbIds: matches.map((match) => match.id),
    playbookIds: relevant.map((match) => match.id),
    playbookSources: relevant.map((match) => ({ id: match.id, title: match.title, version: match.version, score: match.score, sourceType: match.sourceType })),
    summary: best?.summary || "Ticket cần kỹ thuật viên tiếp nhận.",
    steps: canAutoHandle ? (best?.steps || []) : [],
    questions: [],
    canAutoHandle,
    escalated: !canAutoHandle,
    escalationCode: canAutoHandle ? null : "low_confidence",
    reason: canAutoHandle
      ? "Có quy trình Playbook đã duyệt, đúng phân loại, được phép tự hướng dẫn và đạt ngưỡng tin cậy."
      : "Không đạt điều kiện hướng dẫn tự động.",
  };
  analysis.reply = ruleReply({ best, risk, canAutoHandle });
  return analysis;
}

const providerDecisionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: { type: "string", enum: CATEGORIES },
    priority: { type: "string", enum: PRIORITIES },
    priorityDetermined: { type: "boolean" },
    risk: { type: "string", enum: RISKS },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    outcome: { type: "string", enum: OUTCOMES },
    summary: { type: "string" },
    reply: { type: "string" },
    questions: { type: "array", items: { type: "string" }, maxItems: 4 },
    canAutoHandle: { type: "boolean" },
    reason: { type: "string" },
    kbIds: { type: "array", items: { type: "string" }, maxItems: 5 },
    playbookIds: { type: "array", items: { type: "string" }, maxItems: 5 },
    selectedSteps: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceId: { type: "string" },
          stepNumbers: { type: "array", items: { type: "integer", minimum: 1, maximum: 30 }, maxItems: 8 },
        },
        required: ["sourceId", "stepNumbers"],
      },
    },
  },
  required: ["category", "priority", "priorityDetermined", "risk", "confidence", "outcome", "summary", "reply", "questions", "canAutoHandle", "reason", "kbIds", "playbookIds", "selectedSteps"],
};

function validateProviderDecision(content) {
  let parsed;
  try {
    parsed = parseModelJson(content);
  } catch (error) {
    const failure = new Error(`Provider trả JSON không hợp lệ: ${error.message}`);
    failure.reasonCode = "invalid_json";
    throw failure;
  }
  const valid = parsed
    && typeof parsed === "object"
    && CATEGORIES.includes(parsed.category)
    && PRIORITIES.includes(parsed.priority)
    && typeof parsed.priorityDetermined === "boolean"
    && RISKS.includes(parsed.risk)
    && Number.isFinite(Number(parsed.confidence))
    && OUTCOMES.includes(parsed.outcome)
    && typeof parsed.summary === "string"
    && typeof parsed.reply === "string"
    && Array.isArray(parsed.questions)
    && typeof parsed.canAutoHandle === "boolean"
    && typeof parsed.reason === "string"
    && Array.isArray(parsed.kbIds)
    && Array.isArray(parsed.playbookIds)
    && Array.isArray(parsed.selectedSteps);
  if (!valid) {
    const failure = new Error("Provider trả quyết định không đúng schema HelpDesk");
    failure.reasonCode = "schema_mismatch";
    throw failure;
  }
  if (Number(parsed.confidence) < config.agentMinConfidence) {
    const failure = new Error(`Provider chỉ đạt confidence ${Number(parsed.confidence).toFixed(2)}`);
    failure.reasonCode = "low_confidence";
    throw failure;
  }
  return parsed;
}

export async function getAgentStatus({ force = false } = {}) {
  const provider = await getAiProviderStatus({ force });
  return {
    ...provider,
    policy: {
      strictEscalation: config.agentStrictEscalation,
      requirePlaybook: config.agentRequirePlaybook,
      minimumConfidence: config.agentMinConfidence,
      playbookMinimumScore: config.playbookAutoMinScore,
    },
  };
}

function compactConversation(messages = []) {
  return messages
    .filter((item) => ["user", "assistant", "technician"].includes(item.role))
    .slice(-config.agentHistoryMessages)
    .map((item) => ({
      role: item.role === "technician" ? "assistant" : item.role,
      author: compactText(item.authorName, 120),
      content: compactText(item.body, 1800),
    }));
}

function compactKnowledge(matches) {
  return matches.map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    risk: item.risk,
    autoEligible: Boolean(item.autoEligible),
    summary: item.summary,
    steps: (item.steps || []).map((step, index) => ({ number: index + 1, text: step })),
  }));
}

function compactPlaybook(matches) {
  return matches.map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    risk: item.risk,
    priority: item.priority,
    audience: item.audience,
    version: item.version,
    sourceType: item.sourceType,
    score: Number(item.score || 0),
    autoEligible: Boolean(item.autoEligible),
    summary: item.summary,
    requiredQuestions: (item.requiredQuestions || []).slice(0, 6),
    forbiddenSteps: (item.forbiddenSteps || []).slice(0, 6),
    steps: (item.steps || []).map((step, index) => ({ number: index + 1, text: step })),
  }));
}

function selectedSafeSteps(parsed, allowed, fallback) {
  const result = [];
  const seen = new Set();
  const selections = Array.isArray(parsed.selectedSteps) ? parsed.selectedSteps : [];
  for (const selection of selections) {
    const kb = allowed.get(selection?.sourceId);
    if (!kb || !Array.isArray(selection.stepNumbers)) continue;
    for (const number of selection.stepNumbers) {
      const step = kb.steps?.[Number(number) - 1];
      if (!step || seen.has(step)) continue;
      seen.add(step);
      result.push(step);
      if (result.length >= 8) return result;
    }
  }
  return result.length ? result : fallback.steps;
}

async function analyzeWithModelProvider(ticket, matches, playbookMatches, fallback, context) {
  const allowed = new Map([...playbookMatches, ...matches].map((match) => [match.id, match]));
  const playbook = compactPlaybook(playbookMatches);
  const knowledgeBase = compactKnowledge(matches);
  const conversation = compactConversation(context.messages || []);
  const attachments = (context.attachments || []).slice(0, 12).map((item) => ({
    fileName: compactText(item.fileName, 240),
    mimeType: compactText(item.mimeType, 100),
    size: Number(item.size) || 0,
  }));

  const system = [
    "Bạn là AI Agent IT HelpDesk nội bộ, trả lời tiếng Việt rõ ràng và thực tế.",
    "Bạn phải dùng ngữ cảnh hội thoại để tránh lặp lại những bước người dùng đã thử.",
    "Thứ tự nguồn bắt buộc: quy tắc an toàn > Enterprise Playbook > Knowledge Base > suy luận hội thoại.",
    "Bạn chỉ được chọn thao tác kỹ thuật từ Enterprise Playbook được cung cấp bằng selectedSteps/sourceId; không tự phát minh lệnh, registry, BIOS, reset, format hoặc thay đổi hạ tầng.",
    "Nếu không có Playbook phù hợp, còn thiếu chắc chắn, cần hỏi thêm thông tin hoặc không biết câu trả lời chính xác: phải canAutoHandle=false, outcome=escalate, không đưa gợi ý chẩn đoán mơ hồ.",
    "Mọi ticket bắt đầu ở priority=normal. Chỉ đặt priorityDetermined=true khi có đủ dữ kiện để quyết định rõ low, normal, high hoặc urgent; nếu chưa chắc thì đặt false và giữ priority=normal.",
    "Nội dung Playbook nội bộ thắng kiến thức chung của model.",
    "Không tiết lộ procedure audience=technician cho người dùng; payload hiện chỉ chứa các mục audience=employee.",
    "Phần reply là lời phản hồi hội thoại ngắn, cá nhân hóa: xác nhận điều đã hiểu, giải thích bước tiếp theo hoặc câu hỏi cần bổ sung. Không lặp nguyên checklist vào reply vì checklist được hiển thị riêng.",
    "Không bao giờ yêu cầu mật khẩu, OTP, mã xác minh, secret, ảnh giấy tờ hoặc dữ liệu nhạy cảm.",
    "Tài khoản, bảo mật, mất dữ liệu, BSOD, BIOS, phần cứng có mùi khét, server, switch, firewall, quyền admin hoặc sự cố ảnh hưởng nhiều người phải canAutoHandle=false và outcome=escalate.",
    "Chỉ canAutoHandle=true khi có ít nhất một playbookId phù hợp, nguồn Playbook được duyệt có autoEligible=true, risk không high, confidence đủ cao và outcome không phải need_info/escalate.",
    "Khi người dùng nói đã xử lý được, outcome=likely_resolved và hỏi họ xác nhận đóng ticket; không tự đóng ticket.",
    "Trả về đúng JSON schema, không markdown ngoài JSON.",
  ].join(" ");

  const payload = {
    ticket: {
      title: compactText(ticket.title, 200),
      description: compactText(ticket.description, 5000),
      location: compactText(ticket.location, 200),
      device: compactText(ticket.device, 200),
      status: ticket.status || "",
    },
    latestUserMessage: compactText(context.latestUserMessage, 2500),
    conversation,
    attachments,
    playbook,
    knowledgeBase,
    policy: {
      autoResolveThreshold: config.autoResolveThreshold,
      minimumConfidence: config.agentMinConfidence,
      playbookMinimumScore: config.playbookAutoMinScore,
      strictEscalation: config.agentStrictEscalation,
      requirePlaybook: config.agentRequirePlaybook,
      note: "Chỉ chọn sourceId và stepNumbers tồn tại trong Enterprise Playbook. Không có Playbook hoặc không chắc chắn thì escalate ngay.",
    },
  };

  const providerResult = await requestAiProviderDecision({
    system,
    payload,
    schema: providerDecisionSchema,
    validate: validateProviderDecision,
  });
  const telemetry = providerResult.telemetry;
  const parsed = providerResult.validated || validateProviderDecision(providerResult.content);

    const kbIdSet = new Set(matches.map((item) => item.id));
    const playbookIdSet = new Set(playbookMatches.map((item) => item.id));
    const kbIds = Array.isArray(parsed.kbIds) ? parsed.kbIds.filter((value) => kbIdSet.has(value)).slice(0, 5) : [];
    const playbookIds = Array.isArray(parsed.playbookIds) ? parsed.playbookIds.filter((value) => playbookIdSet.has(value)).slice(0, 5) : [];
    const selectedPlaybooks = playbookIds.map((value) => allowed.get(value)).filter(Boolean);
    const best = selectedPlaybooks[0] || playbookMatches[0];
    const risk = maxRisk(fallback.risk, parsed.risk, best?.risk);
    const confidence = clamp(Number(parsed.confidence) || 0, 0, 1);
    const priorityDetermined = Boolean(
      parsed.priorityDetermined
      && PRIORITIES.includes(parsed.priority)
      && confidence >= config.agentMinConfidence
    );
    const outcome = OUTCOMES.includes(parsed.outcome) ? parsed.outcome : "escalate";
    const safeByPolicy = Boolean(
      best
      && best.autoEligible
      && Number(best.score || 0) >= config.playbookAutoMinScore
      && risk !== "high"
      && confidence >= Math.max(config.autoResolveThreshold, config.agentMinConfidence)
      && !["need_info", "escalate"].includes(outcome)
    );
    const canAutoHandle = Boolean(parsed.canAutoHandle && safeByPolicy && playbookIds.length);

    if (!canAutoHandle && config.agentStrictEscalation) {
      const code = !playbookIds.length
        ? "no_playbook_match"
        : (!best?.autoEligible || risk === "high")
          ? "playbook_not_auto_eligible"
          : "low_confidence";
      return escalationAnalysis({
        ticket,
        base: { category: CATEGORIES.includes(parsed.category) ? parsed.category : fallback.category, priority: maxPriority(fallback.priority, parsed.priority), risk },
        code,
        playbookMatches: playbookIds.length ? selectedPlaybooks : playbookMatches,
        kbIds,
        model: telemetry.model,
        source: `${telemetry.provider}+strict-escalation`,
        latencyMs: telemetry.latencyMs,
        reason: compactText(parsed.reason || ESCALATION_MESSAGES[code]?.summary, 1200),
        priorityDetermined,
        providerTelemetry: telemetry,
      });
    }

    const questions = [];
    const steps = selectedSafeSteps(parsed, new Map(playbookMatches.map((match) => [match.id, match])), { steps: [] });
    const fallbackReply = ruleReply({ best, risk, canAutoHandle });

    return {
      ...fallback,
      source: `${telemetry.provider}+playbook-rag`,
      model: telemetry.model,
      generatedAt: nowIso(),
      latencyMs: telemetry.latencyMs,
      outcome: canAutoHandle ? outcome : "escalate",
      category: CATEGORIES.includes(parsed.category) ? parsed.category : fallback.category,
      priority: maxPriority(fallback.priority, parsed.priority, risk === "high" ? "high" : "normal"),
      priorityDetermined,
      risk,
      confidence,
      kbIds,
      playbookIds,
      playbookSources: playbookIds.map((id) => {
        const item = allowed.get(id) || playbookMatches.find((entry) => entry.id === id);
        return item ? { id: item.id, title: item.title, version: item.version, score: item.score, sourceType: item.sourceType } : { id };
      }),
      summary: compactText(parsed.summary || fallback.summary, 1200),
      reply: safeReply(parsed.reply, fallbackReply),
      steps,
      questions,
      canAutoHandle,
      escalated: !canAutoHandle,
      escalationCode: canAutoHandle ? null : "low_confidence",
      reason: canAutoHandle
        ? "AI sử dụng ngữ cảnh hội thoại; mọi bước kỹ thuật đều lấy từ Enterprise Playbook đã duyệt."
        : compactText(parsed.reason || fallback.reason, 1200),
      providerTelemetry: telemetry,
    };
}

async function analyzeTicketRaw(ticket, entries, context = {}) {
  const searchText = `${ticket.title}
${ticket.description}
${context.latestUserMessage || ""}`;
  const base = classifyRule(searchText);
  let rawPlaybookMatches = [];
  try {
    rawPlaybookMatches = await searchPlaybook(searchText, {
      audience: "employee",
      category: base.category === "other" ? "" : base.category,
      limit: config.playbookTopK,
    });
  } catch (error) {
    console.warn(`[Playbook] Search fallback: ${error.message}`);
  }
  const playbookMatches = relevantPlaybookMatches(base.category, rawPlaybookMatches);
  const matches = searchKnowledgeBase(searchText, entries, 5);

  if (config.agentStrictEscalation && config.agentRequirePlaybook && !playbookMatches.length) {
    return escalationAnalysis({
      ticket, base, code: "no_playbook_match", kbIds: matches.map((item) => item.id), source: "strict-playbook-escalation",
    });
  }

  if (config.agentStrictEscalation && playbookMatches.length && !playbookMatches.some((item) => item.autoEligible && item.risk !== "high")) {
    return escalationAnalysis({
      ticket, base, code: "playbook_not_auto_eligible", playbookMatches, kbIds: matches.map((item) => item.id), source: "strict-playbook-escalation",
    });
  }

  const fallback = analyzeWithRules(ticket, entries, context, playbookMatches);
  if (!config.aiRouterEnabled && config.aiProvider === "rules") return fallback;

  try {
    return await analyzeWithModelProvider(ticket, matches, playbookMatches, fallback, context);
  } catch (error) {
    const route = getAiRoute();
    const telemetry = error?.providerTelemetry || null;
    console.error(`${route.provider} fallback:`, error.message);
    if (config.agentStrictEscalation) {
      return escalationAnalysis({
        ticket, base, code: "agent_unavailable", playbookMatches, kbIds: matches.map((item) => item.id),
        model: telemetry?.model || route.model, source: `${route.provider}-unavailable-escalation`, reason: String(error?.message || error),
        latencyMs: telemetry?.latencyMs || 0, priorityDetermined: false, providerTelemetry: telemetry,
      });
    }
    return {
      ...fallback,
      source: playbookMatches.length ? "playbook-rules-fallback" : "rules-local-fallback",
      model: route.model,
      generatedAt: nowIso(),
      reason: `${fallback.reason} ${route.provider} không khả dụng nên hệ thống tạm dùng playbook/rule engine.`,
      reply: `${fallback.reply}

Hiện AI provider chưa kết nối được; ticket vẫn được lưu và chuyển HelpDesk an toàn.`,
    };
  }
}

export async function analyzeTicket(ticket, entries, context = {}) {
  const analysis = await analyzeTicketRaw(ticket, entries, context);
  return createAiDecisionRecord(analysis, { trigger: context.trigger || "unknown" });
}

export function formatAgentReply(analysis) {
  if (!analysis.canAutoHandle) {
    return "Đã chuyển yêu cầu cho kỹ thuật viên.";
  }
  const reply = compactText(analysis.reply || analysis.summary, 3000);
  const steps = Array.isArray(analysis.steps) && analysis.steps.length
    ? `\n\nCác bước theo Playbook:\n${analysis.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`
    : "";
  const sources = Array.isArray(analysis.playbookSources) && analysis.playbookSources.length
    ? `\n\nNguồn Playbook: ${analysis.playbookSources.map((item) => `${item.id}${item.version ? ` v${item.version}` : ""}`).join(", ")}`
    : "";
  return `${reply}${steps}${sources}\n\nSau khi thử, hãy chọn “Tôi đã xử lý được” hoặc “Tôi vẫn chưa xử lý được”.`.trim();
}
