import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);
const miniFile = (name) => new URL(`../../miniapp/src/${name}`, import.meta.url);

test("Admin uses Warm Industrial tokens and a three-zone ticket workspace", async () => {
  const [html, css, script] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
  ]);

  assert.match(html, /class="operations-workflow-banner"/);
  assert.match(html, /helpdesk-workflow-v5165\.gif/);
  assert.doesNotMatch(html, /<h2>Hoạt động HelpDesk<\/h2>/);
  assert.doesNotMatch(html, /Mỗi yêu cầu đều có/);
  assert.match(css, /--canvas:#f7f5f0/);
  assert.match(css, /\.smart-queue\.active\{[\s\S]*background:#eaf1ff;[\s\S]*color:var\(--brand2\);[\s\S]*box-shadow:inset 0 -3px 0 var\(--brand\)/);
  assert.match(css, /grid-template-columns:245px minmax\(420px,1fr\) 370px/);
  assert.match(script, /class="workbench-queue"/);
  assert.match(script, /class="workbench-signal-strip"/);
  assert.match(script, /BƯỚC TIẾP THEO/);
  assert.match(script, /data-workbench-ticket/);
});

test("Mini App exposes Signal System without internal AI provider details", async () => {
  const [layout, card, detail, styles] = await Promise.all([
    readFile(miniFile("components/Layout.tsx"), "utf8"),
    readFile(miniFile("components/TicketCard.tsx"), "utf8"),
    readFile(miniFile("pages/TicketDetailPage.tsx"), "utf8"),
    readFile(miniFile("styles.css"), "utf8"),
  ]);

  assert.match(layout, /label: "Thông báo"/);
  assert.match(layout, /label: "Yêu cầu"/);
  assert.match(card, /ticket-signal-grid/);
  assert.match(card, /ticket-stage-mini/);
  assert.match(detail, /ticket-signal-board/);
  assert.match(detail, /Đã đối chiếu quy trình được phê duyệt/);
  assert.doesNotMatch(detail, /ai\.model/);
  assert.doesNotMatch(detail, /ai\.confidence/);
  assert.match(styles, /--warm-ivory: #f7f5f0/);
  assert.match(styles, /\.filter-chips button\.active \{[\s\S]*background: #eaf1ff;[\s\S]*color: var\(--deep-blue\);[\s\S]*box-shadow: inset 0 -3px 0 var\(--signal-blue\)/);
  assert.match(styles, /\.ticket-stage-tracker/);
});
