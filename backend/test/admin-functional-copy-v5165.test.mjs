import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

test("overview uses a lightweight HelpDesk illustration with accessible motion", async () => {
  const [html, css, asset] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
    stat(publicFile("assets/helpdesk-operations-v5165.webp")),
  ]);

  assert.match(html, /<h2>Hoạt động HelpDesk<\/h2>/);
  assert.match(html, /src="\/assets\/helpdesk-operations-v5165\.webp"/);
  assert.match(html, /width="1200" height="800" decoding="async"/);
  assert.match(css, /@keyframes helpdesk-visual-drift/);
  assert.match(css, /@keyframes helpdesk-visual-scan/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.signal-banner-media\{min-height:176px\}/);
  assert.ok(asset.size < 100 * 1024, `overview illustration is ${asset.size} bytes`);
});

test("Admin tabs use short functional headings instead of slogans", async () => {
  const [html, script] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
  ]);

  for (const title of ["Tổng quan Ticket", "Báo cáo", "Nhân sự", "Kiến thức", "Quy trình", "Playbook", "Hệ thống & AI"]) {
    assert.ok(script.includes(`"${title}"`), `missing tab title: ${title}`);
  }
  assert.match(html, /<h2>Tra cứu Playbook<\/h2>/);
  assert.match(html, /<h2>Giám sát AI Agent<\/h2>/);
  assert.match(html, /<h3>Các bước phát hành procedure<\/h3>/);

  for (const oldCopy of [
    "Đúng tín hiệu",
    "Mỗi yêu cầu đều có",
    "Tra cứu một lần, thấy đúng quy trình",
    "Nhìn thấy sức khỏe AI trước khi người dùng bị ảnh hưởng",
    "AI CONTROL PLANE",
  ]) {
    assert.doesNotMatch(`${html}\n${script}`, new RegExp(oldCopy));
  }
});
