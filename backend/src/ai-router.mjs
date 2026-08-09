import { config } from "./config.mjs";
import { redactSensitiveData } from "./ai-redaction.mjs";
import { nowIso } from "./utils.mjs";

const PROVIDERS = {
  rules: { id: "rules-local", dataBoundary: "local" },
  ollama: { id: "ollama-local", dataBoundary: "local" },
  gemini: { id: "gemini-cloud", dataBoundary: "external" },
};

let statusCache = null;
let statusCacheAt = 0;

function providerDefinition(name = config.aiProvider) {
  return PROVIDERS[name] || PROVIDERS.rules;
}

function modelFor(name = config.aiProvider) {
  if (name === "ollama") return config.ollamaModel;
  if (name === "gemini") return config.geminiModel;
  return null;
}

function modelNameMatches(installed, requested) {
  const left = String(installed || "").toLowerCase();
  const right = String(requested || "").toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  if (!right.includes(":")) return left === `${right}:latest` || left.startsWith(`${right}:`);
  return false;
}

function providerBaseStatus(name = config.aiProvider) {
  const definition = providerDefinition(name);
  const configured = name === "rules"
    || (name === "ollama" && Boolean(config.ollamaBaseUrl && config.ollamaModel))
    || (name === "gemini" && Boolean(config.aiCloudEnabled && config.geminiApiKey && config.geminiModel));
  return {
    configured,
    mode: name === "gemini" ? "cloud" : name,
    provider: definition.id,
    providerKey: name,
    dataBoundary: definition.dataBoundary,
    model: modelFor(name),
    baseUrl: name === "ollama" ? config.ollamaBaseUrl : null,
    reachable: name === "rules" ? true : null,
    modelInstalled: name === "rules" ? true : null,
    ready: name === "rules",
    cloudEnabled: config.aiCloudEnabled,
    redactionEnabled: definition.dataBoundary === "external" && config.aiRedactionEnabled,
    error: null,
    checkedAt: nowIso(),
  };
}

export function getAiRoute() {
  const definition = providerDefinition();
  return {
    providerKey: config.aiProvider,
    provider: definition.id,
    dataBoundary: definition.dataBoundary,
    model: modelFor(),
    cloudEnabled: config.aiCloudEnabled,
    redactionEnabled: definition.dataBoundary === "external" && config.aiRedactionEnabled,
  };
}

export async function getAiProviderStatus({ force = false } = {}) {
  const now = Date.now();
  if (!force && statusCache && now - statusCacheAt < config.agentStatusCacheMs) return statusCache;

  const name = config.aiProvider;
  const base = providerBaseStatus(name);
  if (name === "rules") {
    statusCache = base;
    statusCacheAt = now;
    return base;
  }
  if (name === "gemini") {
    statusCache = {
      ...base,
      ready: base.configured,
      error: base.configured ? null : "Gemini staging cần AI_CLOUD_ENABLED=true, GEMINI_API_KEY và GEMINI_MODEL.",
    };
    statusCacheAt = now;
    return statusCache;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(config.ollamaTimeoutMs, 8000));
  try {
    const response = await fetch(`${config.ollamaBaseUrl}/api/tags`, { signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `Ollama HTTP ${response.status}`);
    const installed = Array.isArray(body.models) ? body.models.map((item) => item.name || item.model).filter(Boolean) : [];
    const modelInstalled = installed.some((item) => modelNameMatches(item, config.ollamaModel));
    statusCache = {
      ...base,
      reachable: true,
      modelInstalled,
      ready: modelInstalled,
      installedModels: installed,
      error: modelInstalled ? null : `Chưa tải model ${config.ollamaModel}`,
      checkedAt: nowIso(),
    };
  } catch (error) {
    statusCache = {
      ...base,
      reachable: false,
      modelInstalled: false,
      ready: false,
      error: error?.name === "AbortError" ? "Ollama không phản hồi kịp thời" : String(error?.message || error),
      checkedAt: nowIso(),
    };
  } finally {
    clearTimeout(timer);
    statusCacheAt = Date.now();
  }
  return statusCache;
}

async function requestOllama({ system, payload, schema, signal }) {
  const response = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollamaModel,
      stream: false,
      think: false,
      keep_alive: config.ollamaKeepAlive,
      format: schema,
      options: { temperature: config.ollamaTemperature, num_ctx: config.ollamaNumCtx },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Ollama HTTP ${response.status}`);
  return {
    content: body?.message?.content,
    model: config.ollamaModel,
    usage: {
      promptTokens: Number(body?.prompt_eval_count || 0) || null,
      outputTokens: Number(body?.eval_count || 0) || null,
      totalTokens: Number(body?.prompt_eval_count || 0) + Number(body?.eval_count || 0) || null,
    },
  };
}

async function requestGemini({ system, payload, schema, signal }) {
  if (!config.aiCloudEnabled) throw new Error("Cloud AI đang bị khóa bởi AI_CLOUD_ENABLED=false");
  if (!config.geminiApiKey) throw new Error("Chưa cấu hình GEMINI_API_KEY");
  const model = encodeURIComponent(config.geminiModel);
  const response = await fetch(`${config.geminiBaseUrl}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.geminiApiKey,
      "x-goog-api-client": "zalo-helpdesk/5.8.0",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
      generationConfig: {
        temperature: config.geminiTemperature,
        maxOutputTokens: config.geminiMaxOutputTokens,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    }),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `Gemini HTTP ${response.status}`);
  const content = (body?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || "").join("").trim();
  if (!content) {
    const reason = body?.promptFeedback?.blockReason || body?.candidates?.[0]?.finishReason || "no_candidate";
    throw new Error(`Gemini không trả về quyết định (${reason})`);
  }
  const usage = body?.usageMetadata || {};
  return {
    content,
    model: body?.modelVersion || config.geminiModel,
    responseId: body?.responseId || null,
    usage: {
      promptTokens: Number(usage.promptTokenCount || 0) || null,
      outputTokens: Number(usage.candidatesTokenCount || 0) || null,
      totalTokens: Number(usage.totalTokenCount || 0) || null,
    },
  };
}

export async function requestAiProviderDecision({ system, payload, schema }) {
  const route = getAiRoute();
  if (route.providerKey === "rules") throw new Error("Rules provider does not require a model request");
  const external = route.dataBoundary === "external";
  const prepared = redactSensitiveData(payload, { enabled: external && config.aiRedactionEnabled });
  const controller = new AbortController();
  const timeoutMs = route.providerKey === "gemini" ? config.geminiTimeoutMs : config.ollamaTimeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const result = route.providerKey === "gemini"
      ? await requestGemini({ system, payload: prepared.value, schema, signal: controller.signal })
      : await requestOllama({ system, payload: prepared.value, schema, signal: controller.signal });
    return {
      ...result,
      telemetry: {
        provider: route.provider,
        providerKey: route.providerKey,
        dataBoundary: route.dataBoundary,
        model: result.model || route.model,
        latencyMs: Date.now() - started,
        redaction: prepared.summary,
        usage: result.usage || null,
        responseId: result.responseId || null,
      },
    };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    if (failure.name === "AbortError") failure.message = `${route.provider} không phản hồi trong ${timeoutMs} ms`;
    failure.providerTelemetry = {
      provider: route.provider,
      providerKey: route.providerKey,
      dataBoundary: route.dataBoundary,
      model: route.model,
      latencyMs: Date.now() - started,
      redaction: prepared.summary,
      usage: null,
      responseId: null,
    };
    throw failure;
  } finally {
    clearTimeout(timer);
  }
}
