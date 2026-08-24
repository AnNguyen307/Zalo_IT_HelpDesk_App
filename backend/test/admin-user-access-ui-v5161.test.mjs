import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

test("employee invite administration has a readable information hierarchy", async () => {
  const [html, script, css] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
  ]);

  assert.match(html, /<span class="overline">MINI APP<\/span>/);
  assert.match(html, /Mã còn hiệu lực và lịch sử xác nhận/);
  assert.match(html, /Nhân viên đã xác nhận và phiên đang hoạt động/);
  assert.match(html, /class="access-summary"/);
  assert.match(script, /class="access-summary-item"/);
  assert.match(script, /class="access-name-line"/);
  assert.match(css, /\.access-name-line strong\{[\s\S]*font-size:15px/);
  assert.match(css, /\.access-identity p\{[\s\S]*font-size:13px/);
  assert.match(css, /\.access-identity small\{[\s\S]*font-size:12px/);
  assert.match(css, /@media\(max-width:1180px\)\{[\s\S]*\.access-grid\{grid-template-columns:1fr\}/);
});

test("device logout uses the same neutral secondary action language as invite revocation", async () => {
  const [script, css] = await Promise.all([
    readFile(publicFile("admin.js"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
  ]);

  assert.match(script, /access-secondary-button compact[^`]+data-invite-revoke/);
  assert.match(script, /access-secondary-button compact[^`]+data-user-revoke/);
  assert.match(script, />Đăng xuất thiết bị<\/button>/);
  assert.doesNotMatch(script, /danger-button compact" data-user-revoke/);
  assert.match(css, /\.access-secondary-button\{[\s\S]*background:#f8f6f1;[\s\S]*color:var\(--ink\)/);
});
