import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

test("v5.18.5 login uses concise functional copy", async () => {
  const html = await readFile(publicFile("admin.html"), "utf8");

  assert.match(html, /HỆ THỐNG IT HELPDESK/);
  assert.match(html, /<h1>Quản lý<br\/><span>IT HelpDesk<\/span><\/h1>/);
  assert.match(html, /Tiếp nhận ticket, theo dõi SLA và tra cứu Playbook\./);
  assert.match(html, /<h2>Đăng nhập<\/h2>/);
  assert.match(html, /Dành cho quản trị viên và kỹ thuật viên\./);
  assert.match(html, /id="loginSubmitLabel">Đăng nhập</);
  assert.doesNotMatch(html, /trong một không gian|Chào mừng trở lại|Vào Control Centre/);
});

test("v5.18.5 login focus is neutral and does not draw a nested blue frame", async () => {
  const css = await readFile(publicFile("admin.css"), "utf8");
  const legacyRelease = css.lastIndexOf("v5.18.4 — focused, accessible Admin sign-in workspace");
  const polishRelease = css.lastIndexOf("v5.18.5 — simpler login copy and neutral focus treatment");

  assert.ok(polishRelease > legacyRelease, "the neutral focus override must win over the v5.18.4 blue focus treatment");
  const polishCss = css.slice(polishRelease);
  assert.match(polishCss, /\.login-field \.input-shell:focus-within\{[\s\S]*?border-color:#706b63/);
  assert.match(polishCss, /box-shadow:0 0 0 3px rgba\(32,33,36,\.075\)/);
  assert.match(polishCss, /\.login-field input:focus-visible\{outline:0;outline-offset:0\}/);
  assert.match(polishCss, /\.login-field \.input-shell:focus-within \.login-input-icon\{stroke:#4f5358\}/);
  assert.doesNotMatch(polishCss, /#1769e8|23,105,232|23,105,255/);
});
