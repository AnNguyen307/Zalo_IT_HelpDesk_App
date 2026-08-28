import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

test("v5.18.3 account menu stays above Overview, Playbook and AI workspaces", async () => {
  const [html, css, script] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
  ]);

  const releaseOverride = css.lastIndexOf("v5.18.3 — keep the expanded account menu");
  assert.ok(releaseOverride > css.lastIndexOf(".main-header{position:static"), "the account-menu layer fix must win over legacy mobile header rules");
  const layerCss = css.slice(releaseOverride);

  assert.match(layerCss, /\.main-header\.account-menu-open\{z-index:100;overflow:visible\}/);
  assert.match(layerCss, /\.account-menu\{z-index:110\}/);
  assert.match(layerCss, /@media\(max-width:680px\)[\s\S]*?\.main-header\{position:relative;overflow:visible\}/);
  assert.match(layerCss, /\.account-menu\{[\s\S]*?position:absolute;[\s\S]*?top:calc\(100% \+ 8px\);[\s\S]*?z-index:120;/);
  assert.match(script, /document\.querySelector\("\.main-header"\)\?\.classList\.toggle\("account-menu-open", Boolean\(open\)\)/);
  assert.match(html, /admin\.css\?v=5\.18\.4/);
  assert.match(html, /admin\.js\?v=5\.18\.4/);
});

test("v5.18.3 health metadata advertises the account-menu layer hotfix", async () => {
  const serverSource = await readFile(new URL("../src/server.mjs", import.meta.url), "utf8");
  assert.match(serverSource, /version: "5\.18\.4"/);
  assert.match(serverSource, /"admin-account-menu-layer-v5183"/);
});
