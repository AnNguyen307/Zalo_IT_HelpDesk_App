import test from "node:test";
import assert from "node:assert/strict";
import { getPlaybookStatus, loadPlaybook, rankPlaybookLexical, searchPlaybook } from "../src/playbook.mjs";

test("enterprise playbook loads sanitized entries", async () => {
  const playbook = await loadPlaybook({ force: true });
  assert.ok(playbook.entries.length >= 150);
  assert.ok(playbook.entries.some((entry) => entry.id === "VS-NET-U03"));
  assert.equal(playbook.metadata.security.rawConfigsIndexed, false);
  assert.equal(playbook.metadata.security.secretsRedacted, true);
});

test("employee search prefers safe enterprise procedure", async () => {
  const results = await searchPlaybook("Máy dùng dây LAN có IP nhưng không truy cập được Internet", {
    audience: "employee",
    semantic: false,
    minScore: 0.05,
    limit: 5,
  });
  assert.ok(results.length > 0);
  assert.equal(results[0].audience, "employee");
  assert.ok(results.some((entry) => ["VS-NET-U01", "VS-NET-U03"].includes(entry.id)));
  assert.ok(results.every((entry) => entry.audience !== "technician"));
});

test("technician search can retrieve infrastructure runbook", async () => {
  const results = await searchPlaybook("VLAN80 client nhận DHCP nhưng Guest Wi-Fi không ra Internet", {
    audience: "technician",
    semantic: false,
    minScore: 0.05,
    limit: 10,
  });
  assert.ok(results.some((entry) => entry.id === "VS-INF-009"));
});

test("playbook status reports audience counts", async () => {
  const status = await getPlaybookStatus({ force: true });
  assert.equal(status.ready, true);
  assert.ok(status.byAudience.employee >= 20);
  assert.ok(status.byAudience.technician >= 100);
  assert.ok(["lexical", "hybrid"].includes(status.retrievalMode));
  assert.ok(["none", "gemini", "ollama"].includes(status.embeddingProvider));
});

test("BM25 lexical ranking rewards coverage instead of a single incidental token", async () => {
  const entries = [
    { id: "target", title: "Ricoh Scan to Folder không hoạt động", category: "printer", keywords: ["scan to folder", "ricoh scan"], summary: "Không gửi file scan", steps: [] },
    { id: "noise", title: "Cài phần mềm scan", category: "software", keywords: ["scan"], summary: "Cài ứng dụng", steps: [] },
  ];
  const scores = rankPlaybookLexical("Ricoh scan to folder không gửi file", entries);
  assert.ok(scores.get("target") > scores.get("noise"));
  assert.ok(scores.get("target") >= 0.72);
});
