import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

async function adminAssets() {
  return Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
  ]);
}

test("Overview uses the supplied workflow GIF without the previous copy or runtime overlays", async () => {
  const [html, css, script] = await adminAssets();

  assert.match(html, /class="operations-workflow-banner"/);
  assert.doesNotMatch(html, /id="overviewAgentSignal"/);
  assert.doesNotMatch(html, /id="overviewPlaybookSignal"/);
  assert.doesNotMatch(html, /id="overviewSlaSignal"/);
  assert.doesNotMatch(html, /VẬN HÀNH CÓ KIỂM SOÁT/);
  assert.doesNotMatch(html, /class="policy-banner"/);
  assert.doesNotMatch(html, /class="signal-banner-copy"/);
  assert.match(html, /helpdesk-workflow-v5165\.gif/);
  assert.match(css, /\.operations-workflow-banner img\{/);
  assert.doesNotMatch(script, /function renderOverviewSignals\(\)/);
});

test("Playbook is organized as command, readiness, search and ranked-result zones", async () => {
  const [html, css, script] = await adminAssets();

  assert.match(html, /class="playbook-command-deck"/);
  assert.match(html, /class="playbook-readiness-panel"/);
  assert.match(html, /class="playbook-search-workspace"/);
  assert.match(html, /class="playbook-result-panel"/);
  assert.match(html, /id="playbookHeroState"/);
  assert.match(html, /id="playbookHeroCount"/);
  assert.match(css, /\.playbook-search-workspace\{display:grid/);
  assert.match(css, /\.playbook-status-grid\{grid-template-columns:repeat\(5/);
  assert.match(script, /playbookHeroMode/);
  assert.match(script, /Cập nhật semantic index/);
});

test("AI control plane prioritizes readiness, provider health, decision quality and sandbox", async () => {
  const [html, css, script] = await adminAssets();

  assert.match(html, /class="ai-command-deck"/);
  assert.match(html, /class="ai-readiness-grid"/);
  assert.match(html, /class="ai-quality-section"/);
  assert.match(html, /class="ai-sandbox-section"/);
  assert.match(html, /id="aiHeroState"/);
  assert.match(html, /id="aiHeroRoute"/);
  assert.match(css, /\.ai-readiness-grid\{display:grid/);
  assert.match(css, /@keyframes ai-route/);
  assert.match(script, /Provider chưa sẵn sàng; HelpDesk fallback vẫn hoạt động/);
});

test("Rigid principle and account-transition panels are removed", async () => {
  const [html, , script] = await adminAssets();

  assert.doesNotMatch(html, /Nguyên tắc an toàn/);
  assert.doesNotMatch(html, /<strong>Nguyên tắc:<\/strong>/);
  assert.doesNotMatch(html, /Chuyển đổi tài khoản an toàn/);
  assert.doesNotMatch(html, /id="legacyLoginNotice"/);
  assert.doesNotMatch(script, /#legacyLoginNotice/);
});
