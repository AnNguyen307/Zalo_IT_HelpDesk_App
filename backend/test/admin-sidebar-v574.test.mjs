import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

test("Admin sidebar uses concise system navigation labels", async () => {
  const html = await readFile(publicFile("admin.html"), "utf8");

  assert.match(html, /<span class="nav-label">HỆ THỐNG<\/span>/);
  assert.match(html, /data-tab="governance"[^>]*>[\s\S]*?<span>Quy trình<\/span>/);
  assert.doesNotMatch(html, /TRÍ TUỆ HỆ THỐNG/);
  assert.doesNotMatch(html, /<span>Vòng đời<\/span>/);
});

test("zero-value ticket and review badges stay out of the sidebar", async () => {
  const [html, script] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
  ]);

  assert.match(html, /id="openTicketBadge" class="hidden" aria-hidden="true"><\/b>/);
  assert.match(html, /id="reviewBadge" class="hidden" aria-hidden="true"><\/b>/);
  assert.match(script, /setNavCountBadge\("#openTicketBadge", openCount\)/);
  assert.match(script, /setNavCountBadge\("#reviewBadge", counts\.submitted\)/);
  assert.match(script, /badge\.textContent = count \? \(count > 99 \? "99\+" : String\(count\)\) : ""/);
  assert.match(script, /badge\.classList\.toggle\("hidden", count === 0\)/);
  assert.match(script, /badge\.setAttribute\("aria-hidden", count === 0 \? "true" : "false"\)/);
});

test("Admin asset URLs are cache-busted for the sidebar release", async () => {
  const html = await readFile(publicFile("admin.html"), "utf8");

  assert.match(html, /\/admin\.css\?v=5\.13\.0/);
  assert.match(html, /\/admin\.js\?v=5\.13\.0/);
});
