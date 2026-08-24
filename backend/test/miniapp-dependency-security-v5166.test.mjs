import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootFile = (name) => new URL(`../../${name}`, import.meta.url);

function versionAtLeast(actual, expected) {
  const left = String(actual).split(".").map(Number);
  const right = String(expected).split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta !== 0) return delta > 0;
  }
  return true;
}

test("Mini App v5.16.6 removes high dependency advisories without unsafe vendor overrides", async () => {
  const [manifestText, lockText, appConfigText, releaseNote] = await Promise.all([
    readFile(rootFile("miniapp/package.json"), "utf8"),
    readFile(rootFile("miniapp/package-lock.json"), "utf8"),
    readFile(rootFile("miniapp/app-config.json"), "utf8"),
    readFile(rootFile("docs/releases/v5.16.6/CHANGES_V5_16_6_MINIAPP_DEPENDENCY_SECURITY.md"), "utf8"),
  ]);

  const manifest = JSON.parse(manifestText);
  const lock = JSON.parse(lockText);
  const appConfig = JSON.parse(appConfigText);

  assert.ok(versionAtLeast(manifest.version, "5.16.6"));
  assert.equal(manifest.devDependencies.vite, "^6.4.3");
  assert.equal(manifest.dependencies["zmp-sdk"], "^2.53.0");
  assert.equal(manifest.overrides, undefined, "do not force an incompatible Sentry major into ZMP SDK");
  assert.equal(lock.version, manifest.version);

  for (const [path, minimum] of [
    ["node_modules/vite", "6.4.3"],
    ["node_modules/esbuild", "0.25.12"],
    ["node_modules/nanoid", "3.3.18"],
    ["node_modules/zmp-sdk", "2.53.0"],
  ]) {
    assert.ok(versionAtLeast(lock.packages[path]?.version, minimum), `${path} must be at least ${minimum}`);
  }

  assert.match(appConfig.listSyncJS[0], /^assets\/index\..+\.module\.js$/);
  assert.match(appConfig.listCSS[0], /^assets\/index\..+\.css$/);
  assert.match(releaseNote, /0 high, 0 critical/);
  assert.match(releaseNote, /GHSA-593m-55hh-j8gv/);
});
