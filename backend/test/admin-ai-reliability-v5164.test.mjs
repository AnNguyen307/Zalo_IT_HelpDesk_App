import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

test("Admin distinguishes degraded cloud inference from successful Cloud AI", async () => {
  const [script, styles] = await Promise.all([
    readFile(publicFile("admin.js"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
  ]);

  assert.match(script, /agent\.operationalState === "degraded"/);
  assert.match(script, /Cloud AI suy giảm · failover đang bật/);
  assert.match(script, /DỰ PHÒNG · RULES \+ PLAYBOOK/);
  assert.match(script, /Model đã chọn được gọi trước/);
  assert.match(script, /router tự thử các Cloud provider còn lại/);
  assert.match(styles, /provider-observability-card\.degraded/);
  assert.match(styles, /copilot-run\.fallback/);
  assert.match(styles, /ai-state-chip\.degraded/);
});

test("current health metadata preserves v5.16.4 AI reliability capabilities", async () => {
  const server = await readFile(new URL("../src/server.mjs", import.meta.url), "utf8");
  assert.match(server, /version: "5\.18\.2"/);
  assert.match(server, /"staff-preferred-cloud-failover"/);
  assert.match(server, /"structured-output-retry"/);
  assert.match(server, /"provider-operational-state"/);
  assert.match(server, /"openrouter-free-router"/);
});
