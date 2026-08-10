import { config } from "./config.mjs";

function providerConfig() {
  if (config.playbookEmbedProvider === "gemini") {
    return {
      provider: "gemini",
      model: config.playbookEmbedModel,
      baseUrl: config.geminiBaseUrl,
      timeoutMs: config.playbookEmbedTimeoutMs,
      configured: Boolean(config.aiCloudEnabled && config.geminiEnabled && config.geminiApiKey && config.playbookEmbedModel),
    };
  }
  return { provider: "none", model: "none", baseUrl: null, timeoutMs: 0, configured: true };
}

export function getEmbeddingIdentity() {
  const settings = providerConfig();
  return `${settings.provider}:${settings.model}`;
}

export function getEmbeddingProviderStatus() {
  const settings = providerConfig();
  return {
    provider: settings.provider,
    model: settings.model,
    configured: settings.configured,
    enabled: settings.provider !== "none",
    dataBoundary: settings.provider === "gemini" ? "external" : "local",
  };
}

async function geminiEmbed(inputs, settings, signal) {
  const response = await fetch(`${settings.baseUrl}/openai/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.geminiApiKey}`,
      "x-goog-api-client": "zalo-helpdesk-rag/5.13.0",
    },
    body: JSON.stringify({ model: settings.model, input: inputs }),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `Gemini embeddings HTTP ${response.status}`);
  const ordered = Array.isArray(body.data)
    ? [...body.data].sort((left, right) => Number(left.index || 0) - Number(right.index || 0))
    : [];
  const embeddings = ordered.map((item) => item.embedding);
  if (embeddings.length !== inputs.length || embeddings.some((item) => !Array.isArray(item) || !item.length)) {
    throw new Error("Gemini không trả về đủ embeddings hợp lệ");
  }
  return embeddings;
}

export async function embedTexts(inputs) {
  if (!Array.isArray(inputs) || !inputs.length) return [];
  const settings = providerConfig();
  if (settings.provider === "none") throw new Error("Embedding provider đang tắt; dùng BM25 lexical fallback");
  if (!settings.configured) throw new Error(`${settings.provider} embedding chưa được cấu hình đầy đủ`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    return await geminiEmbed(inputs, settings, controller.signal);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${settings.provider} embedding timeout sau ${settings.timeoutMs} ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
