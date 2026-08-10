import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../src/config.mjs";
import { getAiModelOptions, requestAiProviderDecision, resetAiRouterStateForTest } from "../src/ai-router.mjs";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: { confidence: { type: "number" }, provider: { type: "string" } },
  required: ["confidence", "provider"],
};

function configureRouter(context) {
  const keys = [
    "aiRouterEnabled", "aiCloudEnabled", "aiProviderOrder", "aiRoutingPolicy", "aiProviderRetries",
    "geminiEnabled", "geminiApiKey", "geminiModel", "geminiTimeoutMs", "geminiDailyRequestLimit", "geminiDailyTokenLimit",
    "groqEnabled", "groqApiKey", "groqModel", "groqTimeoutMs", "groqDailyRequestLimit", "groqDailyTokenLimit",
    "openrouterEnabled", "openrouterApiKey", "openrouterModel", "openrouterTimeoutMs", "openrouterDailyRequestLimit", "openrouterDailyTokenLimit",
    "sambanovaEnabled", "sambanovaApiKey", "sambanovaModel", "sambanovaTimeoutMs", "sambanovaDailyRequestLimit", "sambanovaDailyTokenLimit",
  ];
  const original = Object.fromEntries(keys.map((key) => [key, config[key]]));
  const originalFetch = globalThis.fetch;
  context.after(() => {
    Object.assign(config, original);
    globalThis.fetch = originalFetch;
    resetAiRouterStateForTest();
  });
  Object.assign(config, {
    aiRouterEnabled: true,
    aiCloudEnabled: true,
    aiProviderOrder: ["gemini", "groq", "openrouter", "sambanova"],
    aiRoutingPolicy: "capability_then_free_quota",
    aiProviderRetries: 0,
    geminiEnabled: true,
    geminiApiKey: "gemini-test-key",
    geminiModel: "gemini-test",
    geminiTimeoutMs: 1000,
    geminiDailyRequestLimit: 0,
    geminiDailyTokenLimit: 0,
    groqEnabled: true,
    groqApiKey: "groq-test-key",
    groqModel: "groq-test",
    groqTimeoutMs: 1000,
    groqDailyRequestLimit: 1000,
    groqDailyTokenLimit: 200000,
    openrouterEnabled: false,
    sambanovaEnabled: false,
  });
  resetAiRouterStateForTest();
}

function okOpenAi(provider, confidence = 0.95) {
  return new Response(JSON.stringify({
    id: `response-${provider}`,
    model: `${provider}-model`,
    choices: [{ message: { content: JSON.stringify({ provider, confidence }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("Router V2 falls through quota failure to the next cloud provider", async (context) => {
  configureRouter(context);
  const called = [];
  globalThis.fetch = async (url) => {
    called.push(String(url));
    if (String(url).includes("generativelanguage")) {
      return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
        status: 429,
        headers: { "Content-Type": "application/json", "retry-after": "60" },
      });
    }
    if (String(url).includes("api.groq.com")) return okOpenAi("groq");
    throw new Error(`Không được gọi fallback sau Groq: ${url}`);
  };

  const result = await requestAiProviderDecision({
    system: "test",
    payload: { ticket: "mock" },
    schema,
    validate: (content) => JSON.parse(content),
  });

  assert.equal(result.validated.provider, "groq");
  assert.deepEqual(result.telemetry.attempts.map((item) => [item.providerKey, item.status]), [
    ["gemini", "failed"],
    ["groq", "success"],
  ]);
  assert.equal(called.length, 2);
});

test("staff-selected model is honored without cloud failover", async (context) => {
  configureRouter(context);
  const called = [];
  globalThis.fetch = async (url) => {
    called.push(String(url));
    if (String(url).includes("api.groq.com")) return okOpenAi("groq");
    throw new Error(`Không được gọi provider ngoài model đã chọn: ${url}`);
  };

  const result = await requestAiProviderDecision({
    system: "test",
    payload: { ticket: "mock" },
    schema,
    providerKey: "groq",
    validate: (content) => JSON.parse(content),
  });

  assert.equal(result.validated.provider, "groq");
  assert.equal(result.telemetry.routingPolicy, "staff_selected");
  assert.equal(result.telemetry.requestedProviderKey, "groq");
  assert.equal(result.telemetry.requestedModel, "groq-test");
  assert.deepEqual(result.telemetry.attempts.map((item) => item.providerKey), ["groq"]);
  assert.equal(called.length, 1);
  assert.match(called[0], /api\.groq\.com/);
});

test("model options expose readiness but never provider credentials", async (context) => {
  configureRouter(context);
  const result = await getAiModelOptions();
  const gemini = result.options.find((item) => item.providerKey === "gemini");
  assert.equal(result.defaultProviderKey, "auto");
  assert.equal(gemini.model, "gemini-test");
  assert.equal(gemini.ready, true);
  assert.equal("apiKey" in gemini, false);
  assert.equal("baseUrl" in gemini, false);
  assert.doesNotMatch(JSON.stringify(result), /gemini-test-key|groq-test-key/);
});

test("missing Gemini quota headers mean unknown quota instead of zero remaining", async (context) => {
  configureRouter(context);
  globalThis.fetch = async () => new Response(JSON.stringify({
    responseId: "gemini-no-quota-headers",
    modelVersion: "gemini-test",
    candidates: [{ content: { parts: [{ text: JSON.stringify({ provider: "gemini", confidence: 0.95 }) }] } }],
    usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4, totalTokenCount: 12 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  await requestAiProviderDecision({
    system: "test",
    payload: {},
    schema,
    providerKey: "gemini",
    validate: (content) => JSON.parse(content),
  });
  const options = await getAiModelOptions();
  const gemini = options.options.find((item) => item.providerKey === "gemini");
  assert.equal(gemini.ready, true);
  assert.equal(gemini.reasonCode, "eligible");
  assert.equal(gemini.quota.tokensUsed, 12);
  assert.equal(gemini.quota.tokens, null);
  assert.equal(gemini.quota.requests, null);
  assert.equal(gemini.quota.providerReported, null);
});

test("model options expose provider quota periods and app-observed token usage", async (context) => {
  configureRouter(context);
  config.geminiEnabled = false;
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "response-groq-quota",
    model: "groq-test",
    choices: [{ message: { content: JSON.stringify({ provider: "groq", confidence: 0.95 }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "x-ratelimit-limit-requests": "1000",
      "x-ratelimit-remaining-requests": "997",
      "x-ratelimit-reset-requests": "10h",
      "x-ratelimit-limit-tokens": "8000",
      "x-ratelimit-remaining-tokens": "7900",
      "x-ratelimit-reset-tokens": "7s",
    },
  });

  await requestAiProviderDecision({
    system: "test",
    payload: {},
    schema,
    providerKey: "groq",
    validate: (content) => JSON.parse(content),
  });
  const options = await getAiModelOptions();
  const groq = options.options.find((item) => item.providerKey === "groq");
  assert.equal(groq.quota.tokensUsed, 15);
  assert.equal(groq.quota.appBudget.tokens.remaining, 199985);
  assert.deepEqual(groq.quota.providerReported.tokens, { limit: 8000, remaining: 7900, reset: "7s", period: "minute" });
  assert.deepEqual(groq.quota.providerReported.requests, { limit: 1000, remaining: 997, reset: "10h", period: "day" });
  assert.equal(groq.reasonCode, "eligible");
  assert.equal("apiKey" in groq, false);
});

test("quota failure explains why a configured model is temporarily unavailable", async (context) => {
  configureRouter(context);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
    status: 429,
    headers: { "Content-Type": "application/json", "retry-after": "60" },
  });

  await assert.rejects(
    requestAiProviderDecision({ system: "test", payload: {}, schema, providerKey: "gemini" }),
    /Không có AI provider nào trả về quyết định hợp lệ/,
  );
  const options = await getAiModelOptions();
  const gemini = options.options.find((item) => item.providerKey === "gemini");
  assert.equal(gemini.configured, true);
  assert.equal(gemini.ready, false);
  assert.equal(gemini.reasonCode, "circuit_open");
  assert.equal(gemini.lastErrorCode, "quota_or_rate_limit");
  assert.equal(gemini.lastHttpStatus, 429);
  assert.equal(gemini.lastError, "quota exceeded");
  assert.equal(gemini.circuit.open, true);
  assert.equal("apiKey" in gemini, false);
});

test("failed staff-selected model does not silently call another cloud provider", async (context) => {
  configureRouter(context);
  const called = [];
  globalThis.fetch = async (url) => {
    called.push(String(url));
    return new Response(JSON.stringify({ error: { message: "selected provider unavailable" } }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  };

  await assert.rejects(
    requestAiProviderDecision({ system: "test", payload: {}, schema, providerKey: "groq" }),
    (error) => {
      assert.equal(error.reasonCode, "all_providers_unavailable");
      assert.equal(error.providerTelemetry.requestedProviderKey, "groq");
      assert.deepEqual(error.providerTelemetry.attempts.map((item) => item.providerKey), ["groq"]);
      return true;
    },
  );
  assert.equal(called.length, 1);
  assert.match(called[0], /api\.groq\.com/);
});

test("Router V2 rejects low-confidence output and tries a different model family", async (context) => {
  configureRouter(context);
  globalThis.fetch = async (url) => {
    if (String(url).includes("generativelanguage")) {
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ provider: "gemini", confidence: 0.4 }) }] } }],
        usageMetadata: { totalTokenCount: 12 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (String(url).includes("api.groq.com")) return okOpenAi("groq", 0.91);
    throw new Error(`Unexpected URL ${url}`);
  };

  const result = await requestAiProviderDecision({
    system: "test",
    payload: { ticket: "mock" },
    schema,
    validate(content) {
      const parsed = JSON.parse(content);
      if (parsed.confidence < 0.8) {
        const error = new Error("confidence thấp");
        error.reasonCode = "low_confidence";
        throw error;
      }
      return parsed;
    },
  });

  assert.equal(result.validated.provider, "groq");
  assert.deepEqual(result.telemetry.attempts.map((item) => item.status), ["rejected", "success"]);
  assert.equal(result.telemetry.attempts[0].reasonCode, "low_confidence");
});

test("low-confidence GPT-OSS skips the same family on OpenRouter", async (context) => {
  configureRouter(context);
  Object.assign(config, {
    geminiEnabled: false,
    openrouterEnabled: true,
    openrouterApiKey: "openrouter-test-key",
    openrouterModel: "openai/gpt-oss-120b:free",
    openrouterTimeoutMs: 1000,
    sambanovaEnabled: true,
    sambanovaApiKey: "sambanova-test-key",
    sambanovaModel: "DeepSeek-V3.2",
    sambanovaTimeoutMs: 1000,
  });
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.groq.com")) return okOpenAi("groq", 0.3);
    if (String(url).includes("openrouter.ai")) throw new Error("OpenRouter cùng GPT-OSS không được gọi");
    if (String(url).includes("api.sambanova.ai")) return okOpenAi("sambanova", 0.92);
    throw new Error(`Unexpected URL ${url}`);
  };

  const result = await requestAiProviderDecision({
    system: "test",
    payload: { ticket: "mock" },
    schema,
    validate(content) {
      const parsed = JSON.parse(content);
      if (parsed.confidence < 0.8) {
        const error = new Error("confidence thấp");
        error.reasonCode = "low_confidence";
        throw error;
      }
      return parsed;
    },
  });

  assert.equal(result.validated.provider, "sambanova");
  assert.deepEqual(result.telemetry.attempts.map((item) => [item.providerKey, item.status, item.reasonCode || null]), [
    ["gemini", "skipped", "feature_disabled"],
    ["groq", "rejected", "low_confidence"],
    ["openrouter", "skipped", "family_rejected"],
    ["sambanova", "success", null],
  ]);
});

test("all-provider failure returns attempt telemetry for safe Rules handoff", async (context) => {
  configureRouter(context);
  config.geminiEnabled = false;
  config.groqEnabled = false;
  globalThis.fetch = async (url) => { throw new Error(`Unexpected URL ${url}`); };

  await assert.rejects(
    requestAiProviderDecision({ system: "test", payload: {}, schema }),
    (error) => {
      assert.equal(error.reasonCode, "all_providers_unavailable");
      assert.equal(error.providerTelemetry.provider, "ai-router-v2");
      assert.deepEqual(error.providerTelemetry.attempts.map((item) => item.providerKey), [
        "gemini", "groq", "openrouter", "sambanova",
      ]);
      return true;
    },
  );
});
