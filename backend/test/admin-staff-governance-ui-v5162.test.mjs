import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

test("Admin header opens compact account settings and an expandable action menu", async () => {
  const [html, script, css, server] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
    readFile(new URL("../src/server.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="headerIdentity" class="header-account-trigger"/);
  assert.match(html, /<strong>Tài khoản<\/strong>/);
  assert.match(html, /id="accountMenuToggle"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
  assert.match(html, /id="accountMenu" class="account-menu hidden" role="menu"/);
  assert.match(html, /data-settings-view="app"/);
  assert.match(html, /data-settings-view="account"/);
  assert.match(html, /id="switchAccountBtn"/);
  assert.match(html, /id="logoutBtn"/);
  assert.match(html, /id="settingsDialog" class="form-dialog settings-dialog"/);
  assert.match(script, /const staffRoleLabels = \{ admin: "Quản trị viên", technician: "Kỹ thuật viên", viewer: "Chỉ xem" \}/);
  assert.match(script, /headerIdentity"\)\.onclick = \(\) => openSettings\("account"\)/);
  assert.match(script, /function setAccountMenuOpen\(open\)/);
  assert.match(script, /function endStaffSession\(\{ switchAccount = false \} = \{\}\)/);
  assert.match(script, /state\.autoRefreshEnabled/);
  assert.match(css, /\.header-account-trigger\{/);
  assert.match(css, /\.account-menu\{/);
  assert.match(css, /\.settings-dialog-body\{/);
  assert.match(server, /"compact-account-menu"/);
});

test("HelpDesk accounts use readable summaries and neutral secondary actions", async () => {
  const [html, script, css] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
  ]);

  assert.match(html, /<span class="overline">TÀI KHOẢN<\/span>/);
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
