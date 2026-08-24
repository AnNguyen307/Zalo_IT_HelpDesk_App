import { config } from "./config.mjs";
import { redactSensitiveData } from "./ai-redaction.mjs";
import { nowIso } from "./utils.mjs";

const PROVIDERS = {
  rules: { id: "rules-local", dataBoundary: "local", capability: 0, family: "rules" },
  gemini: { id: "gemini-cloud", dataBoundary: "external", capability: 100, family: "gemini" },
  groq: { id: "groq-cloud", dataBoundary: "external", capability: 90, family: "gpt-oss" },
  openrouter: { id: "openrouter-cloud", dataBoundary: "external", capability: 90, family: "gpt-oss" },
  sambanova: { id: "sambanova-cloud", dataBoundary: "external", capability: 85, family: "deepseek" },
};

const runtimeState = new Map();
let statusCache = null;
let statusCacheAt = 0;

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function stateFor(name) {
  let state = runtimeState.get(name);
  const today = dayKey();
  if (!state || state.day !== today) {
    state = {
      day: today,
      requestsUsed: 0,
      tokensUsed: 0,
      reportedRemainingRequests: null,
      reportedRemainingTokens: null,
      providerQuota: null,
      consecutiveFailures: 0,
      openUntil: 0,
      lastError: null,
      lastErrorCode: null,
      lastHttpStatus: null,
      lastSuccessAt: null,
    };
    runtimeState.set(name, state);
  }
  return state;
}

function providerDefinition(name) {
  return PROVIDERS[name] || PROVIDERS.rules;
}

function providerSettings(name) {
  const common = { name, ...providerDefinition(name) };
  if (name === "gemini") return {
    ...common,
    enabled: config.geminiEnabled,
    baseUrl: config.geminiBaseUrl,
    apiKey: config.geminiApiKey,
    model: config.geminiModel,
    timeoutMs: config.geminiTimeoutMs,
    temperature: config.geminiTemperature,
    maxOutputTokens: config.geminiMaxOutputTokens,
    dailyRequestLimit: config.geminiDailyRequestLimit,
    dailyTokenLimit: config.geminiDailyTokenLimit,
  };
  if (name === "groq") return {
    ...common,
    enabled: config.groqEnabled,
    baseUrl: config.groqBaseUrl,
    apiKey: config.groqApiKey,
    model: config.groqModel,
    timeoutMs: config.groqTimeoutMs,
    temperature: config.groqTemperature,
    maxOutputTokens: config.groqMaxOutputTokens,
    dailyRequestLimit: config.groqDailyRequestLimit,
    dailyTokenLimit: config.groqDailyTokenLimit,
  };
  if (name === "openrouter") return {
    ...common,
    family: config.openrouterModel === "openrouter/free"
      ? "openrouter-free"
      : config.openrouterModel.includes("gpt-oss") ? "gpt-oss" : "openrouter",
    enabled: config.openrouterEnabled,
    baseUrl: config.openrouterBaseUrl,
    apiKey: config.openrouterApiKey,
    model: config.openrouterModel,
    timeoutMs: config.openrouterTimeoutMs,
    temperature: config.openrouterTemperature,
    maxOutputTokens: config.openrouterMaxOutputTokens,
    dailyRequestLimit: config.openrouterDailyRequestLimit,
    dailyTokenLimit: config.openrouterDailyTokenLimit,
  };
  if (name === "sambanova") return {
    ...common,
    enabled: config.sambanovaEnabled,
    baseUrl: config.sambanovaBaseUrl,
    apiKey: config.sambanovaApiKey,
    model: config.sambanovaModel,
    timeoutMs: config.sambanovaTimeoutMs,
    temperature: config.sambanovaTemperature,
    maxOutputTokens: config.sambanovaMaxOutputTokens,
    dailyRequestLimit: config.sambanovaDailyRequestLimit,
    dailyTokenLimit: config.sambanovaDailyTokenLimit,
  };
  return {
    ...common,
    enabled: true,
    baseUrl: null,
    apiKey: "",
    model: null,
    timeoutMs: 0,
    temperature: 0,
    maxOutputTokens: 0,
    dailyRequestLimit: 0,
    dailyTokenLimit: 0,
  };
}

function providerConfigured(settings) {
  if (settings.name === "rules") return true;
  if (!settings.enabled || !settings.baseUrl || !settings.model) return false;
  if (settings.dataBoundary === "external") return Boolean(config.aiCloudEnabled && settings.apiKey);
  return true;
}

function remainingBudget(settings, state = stateFor(settings.name)) {
  const configuredRequests = settings.dailyRequestLimit > 0
    ? Math.max(0, settings.dailyRequestLimit - state.requestsUsed)
    : null;
  const configuredTokens = settings.dailyTokenLimit > 0
    ? Math.max(0, settings.dailyTokenLimit - state.tokensUsed)
    : null;
  return {
    requests: state.reportedRemainingRequests ?? configuredRequests,
    tokens: state.reportedRemainingTokens ?? configuredTokens,
  };
}

function budgetCounter(limit, used, remaining) {
  return {
    limit: limit > 0 ? limit : null,
    used,
    remaining: limit > 0 ? remaining : null,
  };
}

function quotaSnapshot(settings, state) {
  const remaining = remainingBudget(settings, state);
  return {
    scope: "backend-process-utc-day",
    dailyRequestLimit: settings.dailyRequestLimit || null,
    dailyTokenLimit: settings.dailyTokenLimit || null,
    requests: remaining.requests,
    tokens: remaining.tokens,
    requestsUsed: state.requestsUsed,
    tokensUsed: state.tokensUsed,
    appBudget: {
      requests: budgetCounter(settings.dailyRequestLimit, state.requestsUsed, remaining.requests),
      tokens: budgetCounter(settings.dailyTokenLimit, state.tokensUsed, remaining.tokens),
    },
    providerReported: state.providerQuota,
  };
}

function budgetExhausted(settings, state = stateFor(settings.name)) {
  const remaining = remainingBudget(settings, state);
  return remaining.requests === 0 || remaining.tokens === 0;
}

function routeKeys() {
  if (!config.aiRouterEnabled) return config.aiProvider === "rules" ? [] : [config.aiProvider];
  const keys = config.aiProviderOrder.filter((name) => name !== "rules" && PROVIDERS[name]);
  if (config.aiRoutingPolicy === "fixed") return keys;
  const order = new Map(keys.map((name, index) => [name, index]));
  return [...keys].sort((left, right) => {
    const a = providerSettings(left);
    const b = providerSettings(right);
    if (b.capability !== a.capability) return b.capability - a.capability;
    const aRemaining = remainingBudget(a).requests;
    const bRemaining = remainingBudget(b).requests;
    const aValue = aRemaining == null ? Number.MAX_SAFE_INTEGER : aRemaining;
    const bValue = bRemaining == null ? Number.MAX_SAFE_INTEGER : bRemaining;
    if (bValue !== aValue) return bValue - aValue;
    return order.get(left) - order.get(right);
  });
}

export function resolveAiProviderSelection(value) {
  const providerKey = String(value || "auto").trim().toLowerCase() || "auto";
  if (providerKey === "auto") return { providerKey: "auto", model: null };
  if (!PROVIDERS[providerKey] || providerKey === "rules") {
    throw Object.assign(new Error("Model Copilot không hợp lệ"), { status: 400, code: "INVALID_COPILOT_MODEL" });
  }
  if (!routeKeys().includes(providerKey)) {
    throw Object.assign(new Error("Model Copilot không nằm trong route đã được Admin cho phép"), { status: 400, code: "COPILOT_MODEL_NOT_ALLOWED" });
  }
  const settings = providerSettings(providerKey);
  if (!providerConfigured(settings)) {
    throw Object.assign(new Error("Model Copilot đã chọn chưa được cấu hình hoặc đang bị tắt"), { status: 409, code: "COPILOT_MODEL_NOT_CONFIGURED" });
  }
  return { providerKey, model: settings.model };
}

export async function getAiModelOptions() {
  const options = await Promise.all(routeKeys().map(async (providerKey) => {
    const status = await providerStatus(providerKey);
    return {
      providerKey,
      provider: status.provider,
      family: status.family,
      model: status.model,
      ready: status.ready,
      operationalState: status.operationalState,
      configured: status.configured,
      error: status.error || null,
      reasonCode: status.reasonCode || null,
      quota: status.quota,
      circuit: status.circuit,
      lastError: status.lastError || null,
      lastErrorCode: status.lastErrorCode || null,
      lastHttpStatus: status.lastHttpStatus || null,
      lastSuccessAt: status.lastSuccessAt || null,
    };
  }));
  return {
    defaultProviderKey: "auto",
    options,
  };
}

function baseStatus(settings) {
  const state = stateFor(settings.name);
  const configured = providerConfigured(settings);
  return {
    configured,
    enabled: settings.enabled,
    mode: settings.dataBoundary === "external" ? "cloud" : settings.name,
    provider: settings.id,
    providerKey: settings.name,
    family: settings.family,
    capability: settings.capability,
    dataBoundary: settings.dataBoundary,
    model: settings.model,
    baseUrl: null,
    reachable: settings.name === "rules" ? true : null,
    modelInstalled: settings.name === "rules" ? true : null,
    ready: settings.name === "rules",
    operationalState: settings.name === "rules" ? "healthy" : "unavailable",
    cloudEnabled: config.aiCloudEnabled,
    redactionEnabled: settings.dataBoundary === "external" && config.aiRedactionEnabled,
    quota: quotaSnapshot(settings, state),
    circuit: {
      open: state.openUntil > Date.now(),
      openUntil: state.openUntil > Date.now() ? new Date(state.openUntil).toISOString() : null,
      consecutiveFailures: state.consecutiveFailures,
    },
    lastError: state.lastError,
    lastErrorCode: state.lastErrorCode,
    lastHttpStatus: state.lastHttpStatus,
    lastSuccessAt: state.lastSuccessAt,
    reasonCode: settings.name === "rules" ? "rules_ready" : null,
    error: null,
    checkedAt: nowIso(),
  };
}

async function providerStatus(name) {
  const settings = providerSettings(name);
  const base = baseStatus(settings);
  if (name === "rules") return base;
  if (!base.configured) {
    const feature = settings.enabled ? "thiếu API key/model hoặc AI_CLOUD_ENABLED=false" : "feature flag đang tắt";
    return { ...base, ready: false, operationalState: "unavailable", reasonCode: settings.enabled ? "not_configured" : "feature_disabled", error: `${settings.id}: ${feature}.` };
  }
  if (budgetExhausted(settings)) return { ...base, ready: false, operationalState: "unavailable", reasonCode: "daily_budget_exhausted", error: "Đã chạm ngân sách miễn phí cấu hình trong ngày." };
  if (base.circuit.open) return { ...base, ready: false, operationalState: "unavailable", reasonCode: "circuit_open", error: `Circuit đang tạm mở đến ${base.circuit.openUntil}.` };
  const operationalState = base.circuit.consecutiveFailures > 0
    ? "degraded"
    : base.lastSuccessAt ? "healthy" : "ready";
  return { ...base, reachable: true, modelInstalled: true, ready: true, operationalState, reasonCode: operationalState === "degraded" ? "recent_failures" : "eligible" };
}

export function getAiRoute() {
  if (config.aiRouterEnabled) {
    return {
      providerKey: "router",
      provider: "ai-router-v2",
      dataBoundary: "external",
      model: null,
      order: routeKeys(),
      cloudEnabled: config.aiCloudEnabled,
      redactionEnabled: config.aiRedactionEnabled,
    };
  }
  const settings = providerSettings(config.aiProvider);
  return {
    providerKey: settings.name,
    provider: settings.id,
    dataBoundary: settings.dataBoundary,
    model: settings.model,
    order: settings.name === "rules" ? [] : [settings.name],
    cloudEnabled: config.aiCloudEnabled,
    redactionEnabled: settings.dataBoundary === "external" && config.aiRedactionEnabled,
  };
}

export async function getAiProviderStatus({ force = false } = {}) {
  const now = Date.now();
  if (!force && statusCache && now - statusCacheAt < config.agentStatusCacheMs) return statusCache;
  if (!config.aiRouterEnabled) {
    statusCache = await providerStatus(config.aiProvider);
    statusCacheAt = Date.now();
    return statusCache;
  }
  const order = routeKeys();
  const providers = await Promise.all(order.map((name) => providerStatus(name)));
  const readyProviders = providers.filter((item) => item.ready);
  const healthyProviders = readyProviders.filter((item) => item.operationalState === "healthy");
  const degradedProviders = readyProviders.filter((item) => item.operationalState === "degraded");
  const operationalState = healthyProviders.length
    ? "healthy"
    : degradedProviders.length ? "degraded" : readyProviders.length ? "ready" : "fallback";
  statusCache = {
    configured: providers.some((item) => item.configured),
    mode: "router",
    provider: "ai-router-v2",
    providerKey: "router",
    dataBoundary: "external",
    model: readyProviders[0]?.model || null,
    ready: readyProviders.length > 0,
    operationalState,
    cloudOperational: healthyProviders.length > 0,
    cloudEnabled: config.aiCloudEnabled,
    redactionEnabled: config.aiRedactionEnabled,
    routingPolicy: config.aiRoutingPolicy,
    order,
    activeProvider: (healthyProviders[0] || readyProviders[0])?.providerKey || null,
    providers,
    error: readyProviders.length ? null : "Không có model provider sẵn sàng; hệ thống sẽ dùng Rules/HelpDesk.",
    checkedAt: nowIso(),
  };
  statusCacheAt = Date.now();
  return statusCache;
}

async function requestGemini({ settings, system, payload, schema, signal }) {
  const model = encodeURIComponent(settings.model);
  const generationConfig = {
    maxOutputTokens: settings.maxOutputTokens,
    responseMimeType: "application/json",
    responseJsonSchema: schema,
  };
  // Gemini 3.x is tuned for its default temperature. Sending the historical
  // 0.1 override can degrade structured output quality, so only older model
  // families receive the explicit compatibility value.
  if (!/^gemini-3(?:\.|-)/i.test(settings.model)) generationConfig.temperature = settings.temperature;
  const response = await fetch(`${settings.baseUrl}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": settings.apiKey,
      "x-goog-api-client": "zalo-helpdesk/5.18.0",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
      generationConfig,
    }),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw providerHttpError(settings, response, body);
  const candidate = body?.candidates?.[0] || {};
  const content = (candidate?.content?.parts || []).map((part) => part?.text || "").join("").trim();
  if (candidate.finishReason === "MAX_TOKENS") {
    const error = providerError("Gemini dừng vì hết ngân sách output trước khi hoàn tất JSON", "output_truncated", true);
    error.headers = response.headers;
    throw error;
  }
  if (!content) {
    const reason = body?.promptFeedback?.blockReason || candidate?.finishReason || "no_candidate";
    throw providerError(`Gemini không trả về quyết định (${reason})`, "empty_response", false);
  }
  const usage = body?.usageMetadata || {};
  return {
    content,
    model: body?.modelVersion || settings.model,
    responseId: body?.responseId || null,
    usage: {
      promptTokens: Number(usage.promptTokenCount || 0) || null,
      outputTokens: Number(usage.candidatesTokenCount || 0) || null,
      totalTokens: Number(usage.totalTokenCount || 0) || null,
    },
    headers: response.headers,
  };
}

async function requestOpenAiCompatible({ settings, system, payload, schema, signal, attemptNumber = 1 }) {
  const retryAsJsonObject = attemptNumber > 1;
  const strict = settings.name === "groq";
  const structuredSystem = retryAsJsonObject
    ? `${system}\nLần trả lời trước không đạt structured output. Chỉ trả một JSON object hoàn chỉnh theo schema sau, không thêm markdown hoặc lời dẫn: ${JSON.stringify(schema)}`
    : system;
  const bodyPayload = {
    model: settings.model,
    messages: [
      { role: "system", content: structuredSystem },
      { role: "user", content: JSON.stringify(payload) },
    ],
    temperature: settings.temperature,
    max_tokens: settings.maxOutputTokens,
    stream: false,
    response_format: retryAsJsonObject
      ? { type: "json_object" }
      : { type: "json_schema", json_schema: { name: "helpdesk_decision", strict, schema } },
  };
  if (settings.name === "openrouter") bodyPayload.provider = { require_parameters: true };
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${settings.apiKey}`,
  };
  if (settings.name === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/AnNguyen307/Zalo_IT_HelpDesk_App";
    headers["X-OpenRouter-Title"] = "Zalo IT HelpDesk";
  }
  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyPayload),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw providerHttpError(settings, response, body);
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw providerError(`${settings.id} không trả về nội dung`, "empty_response", false);
  const usage = body?.usage || {};
  return {
    content,
    model: body?.model || settings.model,
    responseId: body?.id || null,
    usage: {
      promptTokens: Number(usage.prompt_tokens || 0) || null,
      outputTokens: Number(usage.completion_tokens || 0) || null,
      totalTokens: Number(usage.total_tokens || 0) || null,
    },
    headers: response.headers,
  };
}

function providerError(message, reasonCode = "provider_error", retryable = true) {
  const error = new Error(message);
  error.reasonCode = reasonCode;
  error.retryable = retryable;
  return error;
}

function providerHttpError(settings, response, body) {
  const message = body?.error?.message || body?.error || body?.message || `${settings.id} HTTP ${response.status}`;
  const providerCode = String(body?.error?.code || body?.code || "");
  const structuredOutputRejected = response.status === 400
    && (providerCode === "failed_generation" || /failed_generation|generated json|json schema/i.test(String(message)));
  const reasonCode = response.status === 429
    ? "quota_or_rate_limit"
    : structuredOutputRejected ? "structured_output_rejected" : `http_${response.status}`;
  const error = providerError(String(message), reasonCode, structuredOutputRejected || response.status === 429 || response.status >= 500);
  error.httpStatus = response.status;
  error.retryAfter = response.headers.get("retry-after") || null;
  error.headers = response.headers;
  return error;
}

function numericHeader(headers, names) {
  for (const name of names) {
    const raw = headers?.get?.(name);
    if (raw == null || String(raw).trim() === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function textHeader(headers, names) {
  for (const name of names) {
    const value = headers?.get?.(name);
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function quotaCounter({ limit = null, remaining = null, reset = null, period = null } = {}) {
  if (limit == null && remaining == null && reset == null) return null;
  return { limit, remaining, reset, period };
}

function providerQuotaFromHeaders(settings, headers) {
  if (!headers?.get) return null;
  const dailyRequests = quotaCounter({
    limit: numericHeader(headers, ["x-ratelimit-limit-requests-day"]),
    remaining: numericHeader(headers, ["x-ratelimit-remaining-requests-day"]),
    reset: textHeader(headers, ["x-ratelimit-reset-requests-day"]),
    period: "day",
  });
  const dailyTokens = quotaCounter({
    limit: numericHeader(headers, ["x-ratelimit-limit-tokens-day"]),
    remaining: numericHeader(headers, ["x-ratelimit-remaining-tokens-day"]),
    reset: textHeader(headers, ["x-ratelimit-reset-tokens-day"]),
    period: "day",
  });
  const genericRequests = quotaCounter({
    limit: numericHeader(headers, ["x-ratelimit-limit-requests", "x-rate-limit-limit"]),
    remaining: numericHeader(headers, ["x-ratelimit-remaining-requests", "x-rate-limit-remaining"]),
    reset: textHeader(headers, ["x-ratelimit-reset-requests", "x-rate-limit-reset"]),
    period: settings.name === "groq" ? "day" : "minute",
  });
  const genericTokens = quotaCounter({
    limit: numericHeader(headers, ["x-ratelimit-limit-tokens"]),
    remaining: numericHeader(headers, ["x-ratelimit-remaining-tokens"]),
    reset: textHeader(headers, ["x-ratelimit-reset-tokens"]),
    period: "minute",
  });
  const platform = quotaCounter({
    limit: numericHeader(headers, ["x-ratelimit-limit"]),
    remaining: numericHeader(headers, ["x-ratelimit-remaining"]),
    reset: textHeader(headers, ["x-ratelimit-reset"]),
    period: "provider-defined",
  });
  if (!dailyRequests && !dailyTokens && !genericRequests && !genericTokens && !platform) return null;
  return {
    source: "response-headers",
    observedAt: nowIso(),
    requests: dailyRequests || genericRequests,
    tokens: dailyTokens || genericTokens,
    platform,
  };
}

function recordHeaders(settings, state, headers) {
  const snapshot = providerQuotaFromHeaders(settings, headers);
  if (!snapshot) return;
  state.providerQuota = snapshot;
  if (snapshot.requests?.period === "day" && snapshot.requests.remaining != null) {
    state.reportedRemainingRequests = snapshot.requests.remaining;
  }
  if (snapshot.tokens?.period === "day" && snapshot.tokens.remaining != null) {
    state.reportedRemainingTokens = snapshot.tokens.remaining;
  }
}

function markSuccess(settings, result) {
  const state = stateFor(settings.name);
  state.consecutiveFailures = 0;
  state.openUntil = 0;
  state.lastError = null;
  state.lastErrorCode = null;
  state.lastHttpStatus = null;
  state.lastSuccessAt = nowIso();
  state.tokensUsed += Number(result?.usage?.totalTokens || 0);
  recordHeaders(settings, state, result?.headers);
  statusCache = null;
  statusCacheAt = 0;
}

function markFailure(settings, error) {
  const state = stateFor(settings.name);
  recordHeaders(settings, state, error?.headers);
  state.consecutiveFailures += 1;
  const rawMessage = String(error?.message || error);
  state.lastError = (settings.apiKey ? rawMessage.split(settings.apiKey).join("<REDACTED>") : rawMessage).slice(0, 700);
  state.lastErrorCode = error?.reasonCode || "provider_error";
  state.lastHttpStatus = Number(error?.httpStatus || 0) || null;
  if (error?.httpStatus === 429 || state.consecutiveFailures >= config.aiCircuitFailureThreshold) {
    const retrySeconds = Number(error?.retryAfter);
    state.openUntil = Date.now() + (Number.isFinite(retrySeconds) ? retrySeconds * 1000 : config.aiCircuitCooldownMs);
  }
  statusCache = null;
  statusCacheAt = 0;
}

function skippedReason(settings) {
  const state = stateFor(settings.name);
  if (!providerConfigured(settings)) return settings.enabled ? "not_configured" : "feature_disabled";
  if (budgetExhausted(settings, state)) return "daily_budget_exhausted";
  if (state.openUntil > Date.now()) return "circuit_open";
  return null;
}

async function callProvider(settings, args) {
  if (settings.name === "gemini") return requestGemini({ settings, ...args });
  return requestOpenAiCompatible({ settings, ...args });
}

function attemptTelemetry(settings, detail = {}) {
  return {
    provider: settings.id,
    providerKey: settings.name,
    family: settings.family,
    model: settings.model,
    dataBoundary: settings.dataBoundary,
    ...detail,
  };
}

export async function requestAiProviderDecision({ system, payload, schema, validate, providerKey = "auto" }) {
  const attempts = [];
  const selection = resolveAiProviderSelection(providerKey);
  const route = routeKeys();
  const candidates = selection.providerKey === "auto" || !config.aiRouterEnabled
    ? selection.providerKey === "auto" ? route : [selection.providerKey]
    : [selection.providerKey, ...route.filter((name) => name !== selection.providerKey)];
  const routingPolicy = selection.providerKey === "auto" ? config.aiRoutingPolicy : config.aiRouterEnabled ? "staff_preferred_with_failover" : "staff_selected";
  const rejectedFamilies = new Set();
  for (const name of candidates) {
    const settings = providerSettings(name);
    if (rejectedFamilies.has(settings.family)) {
      attempts.push(attemptTelemetry(settings, { status: "skipped", reasonCode: "family_rejected", latencyMs: 0 }));
      continue;
    }
    const skip = skippedReason(settings);
    if (skip) {
      attempts.push(attemptTelemetry(settings, { status: "skipped", reasonCode: skip, latencyMs: 0 }));
      continue;
    }

    const external = settings.dataBoundary === "external";
    const prepared = redactSensitiveData(payload, { enabled: external && config.aiRedactionEnabled });
    const maxAttempts = Math.max(1, Math.floor(config.aiProviderRetries) + 1);
    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
      const started = Date.now();
      const state = stateFor(name);
      state.requestsUsed += 1;
      try {
        const result = await callProvider(settings, {
          system,
          payload: prepared.value,
          schema,
          signal: controller.signal,
          attemptNumber,
        });
        const latencyMs = Date.now() - started;
        const telemetry = attemptTelemetry(settings, {
          status: "success",
          attempt: attemptNumber,
          latencyMs,
          redaction: prepared.summary,
          usage: result.usage || null,
          responseId: result.responseId || null,
        });
        let validated = null;
        try {
          validated = typeof validate === "function" ? await validate(result.content, telemetry) : null;
        } catch (error) {
          const failure = error instanceof Error ? error : new Error(String(error));
          failure.reasonCode ||= "invalid_response";
          failure.retryable = false;
          attempts.push({ ...telemetry, status: "rejected", reasonCode: failure.reasonCode, error: failure.message });
          markFailure(settings, failure);
          const retryableValidation = ["invalid_json", "schema_mismatch", "invalid_response"].includes(failure.reasonCode);
          if (retryableValidation && attemptNumber < maxAttempts) continue;
          if (["invalid_json", "schema_mismatch", "low_confidence", "invalid_response", "unsafe_output"].includes(failure.reasonCode)) {
            rejectedFamilies.add(settings.family);
          }
          break;
        }
        attempts.push(telemetry);
        markSuccess(settings, result);
        return {
          ...result,
          validated,
          telemetry: {
            ...telemetry,
            router: config.aiRouterEnabled ? "ai-router-v2" : "single-provider",
            routingPolicy,
            requestedProviderKey: selection.providerKey,
            requestedModel: selection.model,
            attempts,
          },
        };
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        if (failure.name === "AbortError") {
          failure.message = `${settings.id} không phản hồi trong ${settings.timeoutMs} ms`;
          failure.reasonCode = "timeout";
          failure.retryable = true;
        }
        attempts.push(attemptTelemetry(settings, {
          status: "failed",
          attempt: attemptNumber,
          reasonCode: failure.reasonCode || "provider_error",
          error: failure.message,
          latencyMs: Date.now() - started,
          redaction: prepared.summary,
          usage: null,
          responseId: null,
        }));
        markFailure(settings, failure);
        const shouldRetry = failure.retryable !== false && failure.httpStatus !== 429 && attemptNumber < maxAttempts;
        if (!shouldRetry) break;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  const singleSettings = selection.providerKey !== "auto"
    ? providerSettings(selection.providerKey)
    : config.aiRouterEnabled ? null : providerSettings(config.aiProvider);
  const failureRedaction = redactSensitiveData(payload, {
    enabled: Boolean(singleSettings?.dataBoundary === "external" && config.aiRedactionEnabled),
  }).summary;
  const failure = new Error("Không có AI provider nào trả về quyết định hợp lệ");
  failure.reasonCode = "all_providers_unavailable";
  failure.providerTelemetry = {
    provider: selection.providerKey !== "auto"
      ? providerSettings(selection.providerKey).id
      : config.aiRouterEnabled ? "ai-router-v2" : providerSettings(config.aiProvider).id,
    providerKey: selection.providerKey !== "auto"
      ? selection.providerKey
      : config.aiRouterEnabled ? "router" : config.aiProvider,
    dataBoundary: singleSettings?.dataBoundary || "mixed",
    model: singleSettings?.model || null,
    latencyMs: attempts.reduce((sum, item) => sum + Number(item.latencyMs || 0), 0),
    redaction: attempts.findLast((item) => item.redaction)?.redaction || failureRedaction,
    usage: null,
    responseId: null,
    routingPolicy,
    requestedProviderKey: selection.providerKey,
    requestedModel: selection.model,
    attempts,
  };
  throw failure;
}

export function resetAiRouterStateForTest() {
  runtimeState.clear();
  statusCache = null;
  statusCacheAt = 0;
}
