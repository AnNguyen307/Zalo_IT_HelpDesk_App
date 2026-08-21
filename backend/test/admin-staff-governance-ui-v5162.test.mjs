import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

test("Admin header identifies the signed-in HelpDesk account and role", async () => {
  const [html, script, css] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
  ]);

  assert.match(html, /id="headerIdentity" class="header-identity"/);
  assert.match(html, /id="headerIdentityName"/);
  assert.match(html, /id="headerIdentityRole"/);
  assert.match(script, /const staffRoleLabels = \{ admin: "Quản trị viên", technician: "Kỹ thuật viên", viewer: "Chỉ xem" \}/);
  assert.match(script, /Đang đăng nhập: \$\{displayName\}, \$\{accountContext\}/);
  assert.match(script, /headerIdentityRole"\)\.textContent = accountContext/);
  assert.match(css, /\.header-identity\{/);
  assert.match(css, /\.header-identity-copy strong\{[^}]*font-size:13px/);
});

test("HelpDesk accounts use readable summaries and neutral secondary actions", async () => {
  const [html, script, css] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
  ]);

  assert.match(html, /QUẢN LÝ TRUY CẬP/);
  assert.match(script, /class="staff-summary-item active"/);
  assert.match(script, /Toàn quyền quản trị/);
  assert.match(script, /Theo dõi, không chỉnh sửa/);
  assert.match(script, /class="button staff-secondary-button compact"/);
  assert.match(css, /\.staff-summary\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /\.staff-name-line strong\{[^}]*font-size:15px/);
  assert.match(css, /\.staff-secondary-button\{[\s\S]*?background:#f8f6f1/);
  assert.match(css, /\.staff-card\.inactive\{opacity:1/);
});

test("Playbook governance uses a five-item summary without an empty sixth cell", async () => {
  const [html, script, css] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
  ]);

  assert.match(html, /class="governance-workflow"/);
  assert.match(html, /Bản nháp[\s\S]*Gửi duyệt[\s\S]*Quản trị duyệt[\s\S]*Đã phát hành[\s\S]*Cập nhật chỉ mục/);
  assert.match(html, /id="governanceStats" class="governance-summary"/);
  assert.doesNotMatch(html, /id="governanceStats" class="stats-grid governance-stats"/);
  assert.match(script, /class="governance-summary-item \$\{style\}"/);
  assert.match(script, /Chỉ mục: \$\{indexLabels/);
  assert.match(script, /Chưa có procedure để hiển thị/);
  assert.match(css, /\.governance-summary\{[\s\S]*?grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /\.governance-workflow\{[\s\S]*?background:var\(--surface\)/);
});
