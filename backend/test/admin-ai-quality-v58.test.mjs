import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

test("Admin AI workspace exposes quality metrics, provider routing and review controls", async () => {
  const [html, script] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
  ]);

  assert.match(html, /TRẠNG THÁI AI/);
  assert.match(html, /id="aiQualityMetrics"/);
  assert.match(html, /id="aiProviderQuality"/);
  assert.match(html, /id="agentProviderStatus"/);
  assert.match(html, /<span class="card-kicker">PROVIDER<\/span>/);
  assert.match(html, /id="aiReviewRows"/);
  assert.match(script, /\/api\/admin\/ai-quality\?days=/);
  assert.match(script, /\/api\/admin\/tickets\/\$\{ticket\.id\}\/ai-review/);
  assert.match(script, /id="aiReviewCorrectBtn"/);
  assert.match(script, /result: "incorrect"/);
  assert.match(script, /Provider không công bố token còn lại qua API/);
  assert.match(script, /providerReasonLabels/);
});

test("v5.17.1 Admin assets are cache-busted", async () => {
  const html = await readFile(publicFile("admin.html"), "utf8");
  assert.match(html, /\/admin\.css\?v=5\.17\.1/);
  assert.match(html, /\/admin\.js\?v=5\.17\.1/);
  assert.match(html, /<span>v5\.17\.1<\/span>/);
});
