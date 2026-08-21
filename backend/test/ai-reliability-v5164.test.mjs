import assert from "node:assert/strict";
import test from "node:test";
import { parseModelJson } from "../src/ai-json.mjs";

test("model JSON parser accepts a complete object surrounded by provider prose", () => {
  assert.deepEqual(parseModelJson('Kết quả:\n```json\n{"ok":true,"note":"an toàn"}\n```\nHoàn tất.'), {
    ok: true,
    note: "an toàn",
  });
});

test("model JSON parser never fabricates a missing truncated suffix", () => {
  assert.throws(() => parseModelJson('{"summary":"bị cắt'), /Unterminated string|Unexpected end/);
});

test("legacy Render AI values are normalized for reliable structured output", async () => {
  const original = {
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    GEMINI_MAX_OUTPUT_TOKENS: process.env.GEMINI_MAX_OUTPUT_TOKENS,
    GROQ_MAX_OUTPUT_TOKENS: process.env.GROQ_MAX_OUTPUT_TOKENS,
  };
  process.env.OPENROUTER_MODEL = "openai/gpt-oss-120b:free";
  process.env.GEMINI_MAX_OUTPUT_TOKENS = "2048";
  process.env.GROQ_MAX_OUTPUT_TOKENS = "2048";
  try {
    const moduleUrl = new URL(`../src/config.mjs?v5164=${Date.now()}`, import.meta.url);
    const { config } = await import(moduleUrl.href);
    assert.equal(config.openrouterModel, "openrouter/free");
    assert.equal(config.geminiMaxOutputTokens, 4096);
    assert.equal(config.groqMaxOutputTokens, 4096);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
