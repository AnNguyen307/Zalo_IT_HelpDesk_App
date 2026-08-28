import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

test("v5.18.2 Admin mobile layout keeps navigation fixed and content within the viewport", async () => {
  const [html, css, script] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
  ]);

  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1"/);
  assert.match(html, /class="table-scroll ticket-table-scroll"/);
  assert.match(html, /<table class="ticket-table">/);
  assert.match(html, /admin\.css\?v=5\.18\.6/);
  assert.match(html, /admin\.js\?v=5\.18\.6/);

  const releaseOverride = css.lastIndexOf("v5.18.2 — phone-first Admin Control Center");
  assert.ok(releaseOverride > css.lastIndexOf(".sidebar{position:static"), "the release override must win over the legacy static sidebar rule");
  const mobileCss = css.slice(releaseOverride);
  assert.match(mobileCss, /@media\(max-width:680px\)/);
  assert.match(mobileCss, /\.sidebar,\.sidebar-compact \.sidebar\{[\s\S]*?position:fixed;/);
  assert.match(mobileCss, /height:calc\(76px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(mobileCss, /\.admin-main\{[\s\S]*?padding-bottom:calc\(92px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(mobileCss, /\.ticket-table thead\{display:none\}/);
  assert.match(mobileCss, /\.ticket-table tbody tr\{[\s\S]*?display:grid;/);
  assert.match(mobileCss, /dialog\.ticket-dialog\[open\][\s\S]*?width:100vw;[\s\S]*?height:100dvh;/);
  assert.match(mobileCss, /\.workbench-queue\{display:none\}/);
  assert.match(mobileCss, /font-size:16px/);

  assert.match(script, /function keepActiveMobileTabVisible/);
  assert.match(script, /scrollIntoView\(\{ block: "nearest", inline: "center", behavior: "smooth" \}\)/);
});

test("current health metadata preserves the v5.18.2 responsive Admin capability", async () => {
  const serverSource = await readFile(new URL("../src/server.mjs", import.meta.url), "utf8");
  assert.match(serverSource, /version: "5\.18\.6"/);
  assert.match(serverSource, /"admin-mobile-responsive-v5182"/);
});
