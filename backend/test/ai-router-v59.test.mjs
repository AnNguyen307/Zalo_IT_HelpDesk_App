import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../src/config.mjs";
import { requestAiProviderDecision, resetAiRouterStateForTest } from "../src/ai-router.mjs";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: { confidence: { type: "number" }, provider: { type: "string" } },
  required: ["confidence", "provider"],
};

function configureRouter(context) {
  const keys = [
    "aiRouterEnabled", "aiCloudEnabled", "aiProviderOrder", "aiRoutingPolicy", "aiProviderRetries",
    "geminiEnabled", "geminiApiKey", "geminiModel", "geminiTimeoutMs",
    "groqEnabled", "groqApiKey", "groqModel", "groqTimeoutMs",
    "openrouterEnabled", "openrouterApiKey", "openrouterModel", "openrouterTimeoutMs",
    "sambanovaEnabled", "sambanovaApiKey", "sambanovaModel", "sambanovaTimeoutMs",
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
    groqEnabled: true,
    groqApiKey: "groq-test-key",
    groqModel: "groq-test",
    groqTimeoutMs: 1000,
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
