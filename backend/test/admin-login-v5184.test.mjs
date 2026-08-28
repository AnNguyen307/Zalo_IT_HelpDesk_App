import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../public/${name}`, import.meta.url);

test("v5.18.4 Admin login has a focused operational hierarchy", async () => {
  const [html, css] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.css"), "utf8"),
  ]);

  assert.match(html, /HỆ THỐNG IT HELPDESK/);
  assert.match(html, /Quản lý/);
  assert.match(html, /class="login-operations-card"/);
  assert.match(html, /Ticket &amp; SLA/);
  assert.match(html, /<h2>Đăng nhập<\/h2>/);
  assert.match(html, /class="login-mobile-brand"/);
  assert.doesNotMatch(html, /class="showcase-art"/);

  const releaseOverride = css.lastIndexOf("v5.18.4 — focused, accessible Admin sign-in workspace");
  assert.ok(releaseOverride > css.lastIndexOf("v5.18.3 — keep the expanded account menu"), "the login release must win over every legacy login breakpoint");
  const loginCss = css.slice(releaseOverride);
  assert.match(loginCss, /\.login-screen\{[\s\S]*?grid-template-columns:minmax\(560px,1\.16fr\) minmax\(420px,\.84fr\)/);
  assert.match(loginCss, /\.login-operations-card\{[\s\S]*?background:rgba\(37,38,40,\.92\)/);
  assert.match(loginCss, /\.login-field \.input-shell:focus-within\{[\s\S]*?border-color:#1769e8/);
  assert.match(loginCss, /@media\(max-width:900px\)[\s\S]*?\.login-showcase\{display:none\}[\s\S]*?\.login-mobile-brand\{display:flex/);
  assert.match(loginCss, /@media\(max-width:680px\)[\s\S]*?\.login-field input\{font-size:16px\}/);
  assert.match(loginCss, /@media\(prefers-reduced-motion:reduce\)/);
});

test("v5.18.4 login preserves accessible authentication behavior", async () => {
  const [html, script, serverSource] = await Promise.all([
    readFile(publicFile("admin.html"), "utf8"),
    readFile(publicFile("admin.js"), "utf8"),
    readFile(new URL("../src/server.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="passwordVisibilityToggle"[^>]+aria-controls="password"[^>]+aria-pressed="false"/);
  assert.match(html, /id="loginSubmitButton"/);
  assert.match(html, /id="loginError" class="form-error" role="alert" aria-live="assertive"/);
  assert.match(html, /aria-describedby="loginError"/);
  assert.match(html, /admin\.css\?v=5\.18\.6/);
  assert.match(html, /admin\.js\?v=5\.18\.6/);
  assert.match(script, /function setLoginBusy\(busy\)/);
  assert.match(script, /function setPasswordVisibility\(visible\)/);
  assert.match(script, /button\.setAttribute\("aria-busy", busy \? "true" : "false"\)/);
  assert.match(script, /password\.setAttribute\("aria-invalid", "true"\)/);
  assert.match(script, /password\.focus\(\); password\.select\(\)/);
  assert.match(script, /\$\("#password"\)\.value = ""; setPasswordVisibility\(false\)/);
  assert.match(script, /!window\.matchMedia\("\(max-width: 680px\)"\)\.matches/);
  assert.match(serverSource, /version: "5\.18\.6"/);
  assert.match(serverSource, /"admin-login-experience-v5184"/);
});
