import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

test("Admin sidebar groups operations, knowledge and administration", async () => {
  const html = await readFile(publicFile("admin.html"), "utf8");

  assert.match(html, /<span class="nav-label">VẬN HÀNH<\/span>/);
  assert.match(html, /<span class="nav-label">TRI THỨC<\/span>/);
  assert.match(html, /<span class="nav-label">QUẢN TRỊ<\/span>/);
  assert.match(html, /data-tab="governance"[^>]*>[\s\S]*?<strong>Quy trình<\/strong>/);
  assert.match(html, /data-tab="agent"[^>]*>[\s\S]*?<strong>Hệ thống &amp; AI<\/strong>/);
  assert.doesNotMatch(html, /<span>Vòng đời<\/span>/);
});

test("Admin sidebar supports persistent compact navigation and accessible active state", async () => {
  const [html, script, css] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
  ]);

  assert.match(html, /id="sidebarToggle"[^>]*aria-expanded="true"/);
  assert.match(html, /data-tab="tickets"[^>]*aria-current="page"/);
  assert.match(html, /class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24">/);
  assert.match(html, /class="nav-copy"><strong>Tổng quan<\/strong><small>Ticket &amp; SLA<\/small>/);
  assert.match(html, /class="sidebar-health-title">TRẠNG THÁI HỆ THỐNG<\/span>/);
  assert.match(script, /SIDEBAR_STORAGE_KEY = "hd_admin_sidebar_compact"/);
  assert.match(script, /layout\.classList\.toggle\("sidebar-compact", Boolean\(compact\)\)/);
  assert.match(script, /item\.setAttribute\("aria-current", "page"\)/);
  assert.match(css, /\.admin-layout\.sidebar-compact\{grid-template-columns:82px minmax\(0,1fr\)\}/);
  assert.match(css, /@media\(max-width:680px\)[\s\S]*scroll-snap-type:x proximity/);
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

test("Admin asset URLs are cache-busted for v5.18.3", async () => {
  const html = await readFile(publicFile("admin.html"), "utf8");

  assert.match(html, /\/admin\.css\?v=5\.18\.3/);
  assert.match(html, /\/admin\.js\?v=5\.18\.3/);
});
