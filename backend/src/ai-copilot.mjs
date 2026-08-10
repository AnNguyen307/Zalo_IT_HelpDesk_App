import { getAiModelOptions, requestAiProviderDecision, resolveAiProviderSelection } from "./ai-router.mjs";
import { config } from "./config.mjs";
import { searchPlaybook } from "./playbook.mjs";
import { readDb, updateDb } from "./store.mjs";
import { id, nowIso } from "./utils.mjs";

const MAX_CONVERSATION_MESSAGES = 24;
const MAX_PLAYBOOK_MATCHES = 6;
const UNSAFE_COPILOT_ACTIONS = [
  /(?:hãy|vui lòng|yêu cầu người dùng)\s+(?:gửi|cung cấp|chia sẻ|nhập).{0,40}(?:mật khẩu|password|otp|token|secret)/iu,
  /^(?:hãy\s+)?(?:thực hiện\s+|chạy\s+|dùng\s+)?(?:format\b|diskpart\s+clean\b|rm\s+-rf\b|remove-item\b.+-recurse\b|drop\s+database\b)/iu,
  /^(?!không\b)(?:hãy\s+)?(?:tắt|vô hiệu hóa|bypass|vượt qua).{0,40}(?:antivirus|defender|firewall|xác thực|bảo mật)/iu,
];

const copilotSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    attemptedSteps: { type: "array", items: { type: "string" }, maxItems: 8 },
    missingInformation: { type: "array", items: { type: "string" }, maxItems: 8 },
    likelyCauses: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          basis: { type: "string", enum: ["playbook", "ai_inference"] },
          playbookId: { type: "string" },
        },
        required: ["description", "confidence", "basis", "playbookId"],
      },
    },
    playbookActions: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceId: { type: "string" },
          stepNumbers: { type: "array", items: { type: "integer", minimum: 1, maximum: 40 }, maxItems: 10 },
        },
        required: ["sourceId", "stepNumbers"],
      },
    },
    playbookAssessment: {
      type: "object",
      additionalProperties: false,
      properties: {
        fit: { type: "string", enum: ["matched", "partial", "none"] },
        explanation: { type: "string" },
      },
      required: ["fit", "explanation"],
    },
    independentAnalysis: {
      type: "object",
      additionalProperties: false,
      properties: {
        reasoningSummary: { type: "string" },
        hypotheses: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              description: { type: "string" },
              rationale: { type: "string" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              verificationSteps: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
            },
            required: ["description", "rationale", "confidence", "verificationSteps"],
          },
        },
        solutionPaths: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              rationale: { type: "string" },
              steps: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
              successSignal: { type: "string" },
              stopCondition: { type: "string" },
              risk: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["title", "rationale", "steps", "successSignal", "stopCondition", "risk"],
          },
        },
      },
      required: ["reasoningSummary", "hypotheses", "solutionPaths"],
    },
    diagnosticSuggestions: { type: "array", items: { type: "string" }, maxItems: 8 },
    risks: { type: "array", items: { type: "string" }, maxItems: 8 },
    draftReply: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["summary", "attemptedSteps", "missingInformation", "likelyCauses", "playbookActions", "playbookAssessment", "independentAnalysis", "diagnosticSuggestions", "risks", "draftReply", "confidence"],
};

function compactText(value, max = 2000) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function compactStrings(values, maxItems = 8, maxChars = 800) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => compactText(value, maxChars)).filter(Boolean).slice(0, maxItems);
}

function parseJsonContent(content) {
  const text = String(content || "").trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(text);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateCopilotDecision(content) {
  let parsed;
  try {
    parsed = parseJsonContent(content);
  } catch (error) {
    const failure = new Error(`Copilot trả JSON không hợp lệ: ${error.message}`);
    failure.reasonCode = "invalid_json";
    throw failure;
  }
  const hypotheses = parsed?.independentAnalysis?.hypotheses;
  const solutionPaths = parsed?.independentAnalysis?.solutionPaths;
  const valid = parsed
    && typeof parsed === "object"
    && typeof parsed.summary === "string"
    && Array.isArray(parsed.attemptedSteps)
    && Array.isArray(parsed.missingInformation)
    && Array.isArray(parsed.likelyCauses)
    && Array.isArray(parsed.playbookActions)
    && parsed.playbookAssessment
    && ["matched", "partial", "none"].includes(parsed.playbookAssessment.fit)
    && hasText(parsed.playbookAssessment.explanation)
    && parsed.independentAnalysis
    && hasText(parsed.independentAnalysis.reasoningSummary)
    && Array.isArray(hypotheses)
    && hypotheses.length >= 2
    && hypotheses.every((item) => hasText(item?.description)
      && hasText(item?.rationale)
      && Number.isFinite(Number(item?.confidence))
      && Array.isArray(item?.verificationSteps)
      && item.verificationSteps.some(hasText))
    && Array.isArray(solutionPaths)
    && solutionPaths.length >= 2
    && solutionPaths.every((item) => hasText(item?.title)
      && hasText(item?.rationale)
      && Array.isArray(item?.steps)
      && item.steps.some(hasText)
      && hasText(item?.successSignal)
      && hasText(item?.stopCondition)
      && ["low", "medium", "high"].includes(item?.risk))
    && Array.isArray(parsed.diagnosticSuggestions)
    && Array.isArray(parsed.risks)
    && typeof parsed.draftReply === "string"
    && Number.isFinite(Number(parsed.confidence));
  if (!valid) {
    const failure = new Error("Copilot trả kết quả không đúng schema nội bộ");
    failure.reasonCode = "schema_mismatch";
    throw failure;
  }
  const generatedActions = [
    ...solutionPaths.flatMap((item) => item.steps),
    ...parsed.diagnosticSuggestions,
    parsed.draftReply,
  ].map((value) => compactText(value, 1200));
  if (generatedActions.some((value) => UNSAFE_COPILOT_ACTIONS.some((pattern) => pattern.test(value)))) {
    const failure = new Error("Copilot đề xuất thao tác không đạt guardrail an toàn");
    failure.reasonCode = "unsafe_output";
    throw failure;
  }
  return parsed;
}

function normalizePlaybookAssessment(value, matches) {
  const bestScore = Math.max(0, Math.min(1, Number(matches[0]?.score || 0)));
  const requestedFit = ["matched", "partial", "none"].includes(value?.fit) ? value.fit : "none";
  const fit = !matches.length || requestedFit === "none"
    ? "none"
    : requestedFit === "matched" && bestScore >= config.playbookAutoMinScore ? "matched" : "partial";
  const defaultExplanation = fit === "none"
    ? "Không có procedure nào giải thích đủ sát triệu chứng; Copilot chuyển sang phân tích độc lập cho Helpdesk."
    : fit === "matched"
      ? "Có procedure đủ mạnh để làm căn cứ, nhưng Copilot vẫn phân tích các khả năng ngoài Playbook."
      : "Playbook chỉ bao phủ một phần triệu chứng; các khoảng trống cần được kiểm tra bằng phân tích độc lập.";
  return {
    fit,
    explanation: fit === requestedFit ? compactText(value?.explanation, 1200) || defaultExplanation : defaultExplanation,
    bestScore,
  };
}

function normalizeIndependentAnalysis(value) {
  const hypotheses = (Array.isArray(value?.hypotheses) ? value.hypotheses : [])
    .map((item) => ({
      description: compactText(item?.description, 800),
      rationale: compactText(item?.rationale, 1200),
      confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0)),
      verificationSteps: compactStrings(item?.verificationSteps, 5, 700),
    }))
    .filter((item) => item.description && item.rationale && item.verificationSteps.length)
    .slice(0, 4);
  const solutionPaths = (Array.isArray(value?.solutionPaths) ? value.solutionPaths : [])
    .map((item) => ({
      title: compactText(item?.title, 300),
      rationale: compactText(item?.rationale, 1200),
      steps: compactStrings(item?.steps, 6, 800),
      successSignal: compactText(item?.successSignal, 700),
      stopCondition: compactText(item?.stopCondition, 700),
      risk: ["low", "medium", "high"].includes(item?.risk) ? item.risk : "medium",
    }))
    .filter((item) => item.title && item.rationale && item.steps.length && item.successSignal && item.stopCondition)
    .slice(0, 4);
  return {
    available: hypotheses.length > 0 && solutionPaths.length > 0,
    reasoningSummary: compactText(value?.reasoningSummary, 1800),
    hypotheses,
    solutionPaths,
  };
}

function compactPlaybook(matches) {
  return matches.map((item) => ({
    id: item.id,
    title: compactText(item.title, 240),
    category: item.category,
    audience: item.audience,
    risk: item.risk,
    priority: item.priority,
    version: item.version,
    score: Number(item.score || 0),
    summary: compactText(item.summary, 1200),
    requiredQuestions: compactStrings(item.requiredQuestions, 8, 500),
    forbiddenSteps: compactStrings(item.forbiddenSteps, 8, 500),
    steps: (item.steps || []).slice(0, 40).map((step, index) => ({ number: index + 1, text: compactText(step, 800) })),
  }));
}

function exactPlaybookActions(selections, matchMap) {
  const actions = [];
  const seen = new Set();
  for (const selection of Array.isArray(selections) ? selections : []) {
    const match = matchMap.get(selection?.sourceId);
    if (!match || !Array.isArray(selection.stepNumbers)) continue;
    for (const stepNumber of selection.stepNumbers) {
      const step = compactText(match.steps?.[Number(stepNumber) - 1], 1000);
      const key = `${match.id}:${stepNumber}`;
      if (!step || seen.has(key)) continue;
      seen.add(key);
      actions.push({
        text: step,
        basis: "playbook",
        playbookId: match.id,
        playbookTitle: compactText(match.title, 240),
        stepNumber: Number(stepNumber),
      });
      if (actions.length >= 10) return actions;
    }
  }
  return actions;
}

function normalizeSuggestion(parsed, matches) {
  const matchMap = new Map(matches.map((match) => [match.id, match]));
  const playbookAssessment = normalizePlaybookAssessment(parsed.playbookAssessment, matches);
  const independentAnalysis = normalizeIndependentAnalysis(parsed.independentAnalysis);
  const playbookApplicable = playbookAssessment.fit !== "none";
  const likelyCauses = (Array.isArray(parsed.likelyCauses) ? parsed.likelyCauses : [])
    .map((item) => {
      const requestedPlaybook = compactText(item?.playbookId, 120);
      const supportedByPlaybook = playbookApplicable && item?.basis === "playbook" && matchMap.has(requestedPlaybook);
      const matchedPlaybook = supportedByPlaybook ? matchMap.get(requestedPlaybook) : null;
      return {
        description: compactText(matchedPlaybook?.summary || matchedPlaybook?.title || item?.description, 1000),
        confidence: Math.max(0, Math.min(1, supportedByPlaybook ? Number(matchedPlaybook?.score || 0) : Number(item?.confidence) || 0)),
        basis: supportedByPlaybook ? "playbook" : "ai_inference",
        playbookId: supportedByPlaybook ? requestedPlaybook : "",
      };
    })
    .filter((item) => item.description)
    .slice(0, 6);

  return {
    summary: compactText(parsed.summary, 2000),
    attemptedSteps: compactStrings(parsed.attemptedSteps),
    missingInformation: compactStrings(parsed.missingInformation),
    likelyCauses,
    playbookActions: playbookApplicable ? exactPlaybookActions(parsed.playbookActions, matchMap) : [],
    playbookAssessment,
    independentAnalysis,
    analysisMode: playbookAssessment.fit === "none" ? "ai_led" : "hybrid",
    diagnosticSuggestions: compactStrings(parsed.diagnosticSuggestions),
    risks: compactStrings(parsed.risks),
    draftReply: compactText(parsed.draftReply, 3000),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    playbookIds: playbookApplicable ? [...new Set([
      ...likelyCauses.map((item) => item.playbookId),
      ...(Array.isArray(parsed.playbookActions) ? parsed.playbookActions.map((item) => item?.sourceId) : []),
    ].filter((value) => matchMap.has(value)))].slice(0, 8) : [],
  };
}

function fallbackSuggestion(ticket, matches) {
  const best = matches[0] || null;
  const playbookAssessment = normalizePlaybookAssessment({
    fit: best && Number(best.score || 0) >= config.playbookAutoMinScore ? "matched" : best ? "partial" : "none",
    explanation: "Cloud AI chưa sẵn sàng nên hệ thống chỉ có thể đối chiếu Playbook và đưa checklist khoanh vùng an toàn.",
  }, matches);
  const playbookActions = best
    ? (best.steps || []).slice(0, 5).map((step, index) => ({
      text: compactText(step, 1000),
      basis: "playbook",
      playbookId: best.id,
      playbookTitle: compactText(best.title, 240),
      stepNumber: index + 1,
    }))
    : [];
  return {
    summary: best
      ? `Đã tìm thấy procedure ${best.id} để kỹ thuật viên đối chiếu. Cloud AI chưa tạo được phân tích mở rộng.`
      : "Chưa tìm thấy procedure đủ gần. Kỹ thuật viên cần tiếp tục khoanh vùng sự cố; Cloud AI chưa tạo được phân tích mở rộng.",
    attemptedSteps: [],
    missingInformation: [
      "Mã lỗi hoặc thông báo chính xác đang hiển thị",
      "Phạm vi ảnh hưởng: một người, một thiết bị hay nhiều người dùng",
      "Thời điểm bắt đầu và thay đổi gần nhất trước khi phát sinh lỗi",
    ],
    likelyCauses: best ? [{
      description: compactText(best.summary || best.title, 1000),
      confidence: Math.max(0, Math.min(1, Number(best.score || 0))),
      basis: "playbook",
      playbookId: best.id,
    }] : [],
    playbookActions,
    playbookAssessment,
    independentAnalysis: {
      available: false,
      reasoningSummary: "Không có cloud AI hợp lệ cho lần chạy này; chưa thể tạo phân tích độc lập.",
      hypotheses: [],
      solutionPaths: [],
    },
    analysisMode: "rules_fallback",
    diagnosticSuggestions: ["Xác minh lại triệu chứng, phạm vi ảnh hưởng và các bước người dùng đã thử trước khi thay đổi cấu hình."],
    risks: best ? compactStrings(best.forbiddenSteps, 8, 800) : ["Không thực hiện thay đổi phá hủy hoặc yêu cầu thông tin xác thực khi chưa có procedure được phê duyệt."],
    draftReply: `HelpDesk đã tiếp nhận ${ticket.code || "ticket"}. Vui lòng cung cấp mã lỗi chính xác, phạm vi ảnh hưởng và thời điểm sự cố bắt đầu để kỹ thuật viên tiếp tục kiểm tra.`,
    confidence: best ? Math.max(0, Math.min(1, Number(best.score || 0))) : 0.2,
    playbookIds: best ? [best.id] : [],
  };
}

export async function analyzeCopilot({ ticket, messages = [], attachments = [], playbookMatches = [], providerKey = "auto" }) {
  const conversation = messages
    .filter((message) => ["user", "assistant", "technician"].includes(message.role))
    .slice(-MAX_CONVERSATION_MESSAGES)
    .map((message) => ({ role: message.role, author: compactText(message.authorName, 120), content: compactText(message.body, 2400) }));
  const playbook = compactPlaybook(playbookMatches);
  const system = [
    "Bạn là AI Copilot nội bộ cho kỹ thuật viên IT HelpDesk; luôn trả lời tiếng Việt và đúng JSON schema.",
    "Nội dung này tuyệt đối không được gửi trực tiếp cho người dùng và chỉ là gợi ý để kỹ thuật viên kiểm tra, duyệt rồi mới phản hồi.",
    "Playbook là căn cứ nội bộ, không phải giới hạn tư duy: trong mọi lần phân tích, ngoài việc đối chiếu Playbook, bắt buộc tạo phân tích độc lập của AI.",
    "Đánh giá playbookAssessment.fit là matched, partial hoặc none theo mức Playbook thật sự giải thích được triệu chứng; không ép lỗi vào procedure chỉ vì có từ khóa gần giống.",
    "Chỉ đưa thao tác từ Playbook qua playbookActions/sourceId/stepNumbers; hệ thống sẽ ánh xạ lại nguyên văn bước được duyệt.",
    "Trong independentAnalysis, đưa 2-3 giả thuyết khác nhau và 2-3 hướng giải quyết ngắn gọn theo thứ tự ưu tiên; mỗi giả thuyết phải có lý do, cách kiểm chứng và confidence; mỗi hướng phải có các bước, tín hiệu thành công, điều kiện dừng và mức rủi ro.",
    "Khi Playbook không khớp, đặt fit=none, để playbookActions rỗng và chủ động đề xuất hướng khoanh vùng/giải quyết bằng kiến thức chuyên môn của model; không trả lời máy móc rằng không có Playbook.",
    "Khi Playbook có khớp, vẫn phải xem xét nguyên nhân ngoài Playbook, dữ kiện phản bác và ít nhất một hướng xử lý bổ sung có thể kiểm chứng.",
    "Mọi diagnosticSuggestions, independentAnalysis và nguyên nhân không có Playbook đều là ai_inference, không khẳng định chắc chắn hay giả mạo nguồn nội bộ.",
    "Không xuất chain-of-thought hoặc độc thoại suy nghĩ bí mật; reasoningSummary và rationale chỉ là lập luận chẩn đoán ngắn gọn, có thể kiểm chứng bởi Helpdesk.",
    "Tóm tắt những gì người dùng đã thử, thông tin còn thiếu, nguyên nhân có thể, rủi ro và một bản nháp phản hồi ngắn.",
    "Ưu tiên kiểm tra quan sát được, log, so sánh A/B, khoanh vùng phạm vi, thay đổi có thể hoàn tác và phương án ít ảnh hưởng trước.",
    "Không yêu cầu mật khẩu, OTP, token, secret; không đề xuất format, xóa dữ liệu, bypass bảo mật hoặc thay đổi phá hủy. Với quyền admin, security, dữ liệu, server/network core hoặc tác động diện rộng, chỉ nêu hướng kiểm chứng và điều kiện chuyển cấp/phê duyệt.",
    "Nếu không có Playbook phù hợp, phải giảm confidence tổng thể và ghi rõ đâu là giả thuyết AI cần Helpdesk xác minh.",
  ].join(" ");
  const payload = {
    channel: "staff_only_copilot",
    ticket: {
      code: compactText(ticket.code, 80),
      title: compactText(ticket.title, 240),
      description: compactText(ticket.description, 5000),
      category: ticket.category,
      priority: ticket.priority,
      risk: ticket.risk,
      status: ticket.status,
      location: compactText(ticket.location, 200),
      device: compactText(ticket.device, 200),
    },
    conversation,
    attachments: attachments.slice(0, 16).map((item) => ({
      fileName: compactText(item.fileName, 240),
      mimeType: compactText(item.mimeType, 120),
      size: Number(item.size || 0),
    })),
    playbook,
    policy: {
      audience: "staff_only",
      directSendAllowed: false,
      independentReasoningRequired: true,
      minimumIndependentHypotheses: 2,
      minimumSolutionPaths: 2,
      note: "Playbook là nguồn đã phê duyệt; phân tích riêng của model là giả thuyết chẩn đoán cần kỹ thuật viên xác minh, không phải chain-of-thought hay lệnh tự động.",
    },
  };

  try {
    const result = await requestAiProviderDecision({
      system,
      payload,
      schema: copilotSchema,
      validate: validateCopilotDecision,
      providerKey,
    });
    const suggestion = normalizeSuggestion(result.validated || validateCopilotDecision(result.content), playbookMatches);
    return {
      suggestion,
      provider: result.telemetry?.provider || "ai-router-v2",
      model: result.telemetry?.model || result.model || null,
      telemetry: result.telemetry || null,
    };
  } catch (error) {
    return {
      suggestion: fallbackSuggestion(ticket, playbookMatches),
      provider: "rules-local",
      model: null,
      telemetry: error?.providerTelemetry || { reasonCode: error?.reasonCode || "copilot_fallback", error: compactText(error?.message, 500) },
    };
  }
}

export function publicCopilotRun(run) {
  return {
    id: run.id,
    ticketId: run.ticketId,
    trigger: run.trigger,
    requestedProviderKey: run.requestedProviderKey || "auto",
    requestedModel: run.requestedModel || null,
    provider: run.provider || null,
    model: run.model || null,
    suggestion: run.suggestion || null,
    playbookIds: run.playbookIds || [],
    confidence: Number.isFinite(Number(run.confidence)) ? Number(run.confidence) : null,
    status: run.status,
    error: run.error || "",
    requestedBy: run.requestedBy,
    requestedByName: run.requestedByName,
    createdAt: run.createdAt,
    startedAt: run.startedAt || null,
    completedAt: run.completedAt || null,
  };
}

export async function getCopilotModelOptions() {
  return getAiModelOptions();
}

export async function listCopilotRuns(ticketId) {
  const db = await readDb();
  if (!db.tickets.some((ticket) => ticket.id === ticketId)) throw Object.assign(new Error("Không tìm thấy ticket"), { status: 404 });
  return db.aiCopilotRuns
    .filter((run) => run.ticketId === ticketId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(publicCopilotRun);
}

async function executeCopilotRun(runId) {
  try {
    const startedAt = nowIso();
    await updateDb((db) => {
      const run = db.aiCopilotRuns.find((item) => item.id === runId);
      if (run) { run.status = "running"; run.startedAt = startedAt; }
    });
    const db = await readDb();
    const run = db.aiCopilotRuns.find((item) => item.id === runId);
    const ticket = run && db.tickets.find((item) => item.id === run.ticketId);
    if (!run || !ticket) throw new Error("Ticket hoặc Copilot run không còn tồn tại");
    const messages = db.messages.filter((item) => item.ticketId === ticket.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const attachments = db.attachments.filter((item) => item.ticketId === ticket.id);
    const searchText = `${ticket.title}\n${ticket.description}\n${messages.slice(-12).map((item) => item.body).join("\n")}`;
    const playbookMatches = await searchPlaybook(searchText, {
      audience: "all",
      category: ticket.category,
      limit: MAX_PLAYBOOK_MATCHES,
      minScore: 0.12,
    });
    const result = await analyzeCopilot({
      ticket,
      messages,
      attachments,
      playbookMatches,
      providerKey: run.requestedProviderKey || "auto",
    });
    const completedAt = nowIso();
    await updateDb((target) => {
      const current = target.aiCopilotRuns.find((item) => item.id === runId);
      if (!current) return;
      current.provider = result.provider;
      current.model = result.model;
      current.suggestion = result.suggestion;
      current.playbookIds = result.suggestion.playbookIds || [];
      current.confidence = result.suggestion.confidence;
      current.telemetry = result.telemetry;
      current.status = "completed";
      current.error = "";
      current.completedAt = completedAt;
    });
  } catch (error) {
    const completedAt = nowIso();
    await updateDb((db) => {
      const run = db.aiCopilotRuns.find((item) => item.id === runId);
      if (!run) return;
      run.status = "failed";
      run.error = compactText(error?.message || error, 1000);
      run.completedAt = completedAt;
    }).catch(() => undefined);
  }
}

export async function queueCopilotRun({ ticketId, trigger = "manual", requestedBy, requestedByName, providerKey = "auto", deduplicate = false }) {
  const selection = resolveAiProviderSelection(providerKey);
  const createdAt = nowIso();
  const run = await updateDb((db) => {
    const ticket = db.tickets.find((item) => item.id === ticketId);
    if (!ticket) throw Object.assign(new Error("Không tìm thấy ticket"), { status: 404 });
    if (deduplicate) {
      const existing = db.aiCopilotRuns.find((item) => item.ticketId === ticketId && item.trigger === trigger && ["queued", "running"].includes(item.status));
      if (existing) return existing;
    }
    const created = {
      id: id("cop"),
      ticketId,
      trigger: compactText(trigger, 80) || "manual",
      requestedProviderKey: selection.providerKey,
      requestedModel: selection.model,
      provider: "",
      model: null,
      suggestion: null,
      playbookIds: [],
      confidence: null,
      telemetry: null,
      status: "queued",
      error: "",
      requestedBy: compactText(requestedBy, 64) || "system",
      requestedByName: compactText(requestedByName, 200) || "Hệ thống HelpDesk",
      createdAt,
      startedAt: null,
      completedAt: null,
    };
    db.aiCopilotRuns.push(created);
    return created;
  });
  if (run.status === "queued" && !run.startedAt) void executeCopilotRun(run.id);
  return publicCopilotRun(run);
}

export async function recoverCopilotQueue() {
  const recoveredIds = await updateDb((db) => {
    const recoverable = db.aiCopilotRuns
      .filter((run) => ["queued", "running"].includes(run.status))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, 50);
    for (const run of recoverable) {
      run.status = "queued";
      run.startedAt = null;
      run.error = "";
    }
    return recoverable.map((run) => run.id);
  });
  for (const runId of recoveredIds) void executeCopilotRun(runId);
  return recoveredIds.length;
}
