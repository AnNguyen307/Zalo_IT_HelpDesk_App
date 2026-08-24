import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

test("overview uses the supplied animated HelpDesk workflow as the complete banner", async () => {
  const [html, css, asset] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
    stat(publicFile("assets/helpdesk-workflow-v5165.gif")),
  ]);

  assert.match(html, /class="operations-workflow-banner"/);
  assert.match(html, /src="\/assets\/helpdesk-workflow-v5165\.gif"/);
  assert.match(html, /width="1200" height="560" decoding="async"/);
  assert.match(html, /alt="Quy trình IT HelpDesk:/);
  assert.doesNotMatch(html, /class="signal-banner-copy"/);
  assert.doesNotMatch(html, /helpdesk-operations-v5165\.webp/);
  assert.match(css, /\.operations-workflow-banner img\{/);
  assert.match(css, /\.operations-workflow-banner\{[^}]*width:min\(100%,980px\);[^}]*margin:14px auto 18px;/s);
  assert.match(css, /aspect-ratio:15\/7/);
  assert.ok(asset.size < 1024 * 1024, `overview animation is ${asset.size} bytes`);
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
