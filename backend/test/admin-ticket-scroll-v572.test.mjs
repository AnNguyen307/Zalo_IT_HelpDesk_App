import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

test("ticket table lets vertical wheel input continue scrolling the page", async () => {
  const [css, html] = await Promise.all([
    readFile(publicFile("admin.css"), "utf8"),
    readFile(publicFile("admin.html"), "utf8"),
  ]);
  const tableScrollRules = [...css.matchAll(/\.table-scroll\s*\{([^}]+)\}/g)].map((match) => match[1]).join(";");

  assert.match(html, /class="[^"]*table-scroll[^"]*"[^>]*>\s*<table/);
  assert.match(tableScrollRules, /overflow\s*:\s*auto/);
  assert.match(tableScrollRules, /overscroll-behavior-x\s*:\s*contain/);
  assert.match(tableScrollRules, /overscroll-behavior-y\s*:\s*auto/);
  assert.doesNotMatch(tableScrollRules, /overscroll-behavior\s*:\s*contain/);
});

test("ticket rows and their children do not cancel mouse-wheel or touchpad input", async () => {
  const script = await readFile(publicFile("admin.js"), "utf8");

  assert.doesNotMatch(script, /addEventListener\s*\(\s*["'](?:wheel|mousewheel|DOMMouseScroll)["']/i);
  assert.doesNotMatch(script, /\.onwheel\s*=/i);
});
