import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryFile = (name) => new URL(`../../${name}`, import.meta.url);
const officialName = "Nguyễn Phan Trường An HelpDesk";

test("v5.18.6 public review documents and health metadata match the verified Mini App identity", async () => {
  const [terms, privacy, server] = await Promise.all([
    readFile(repositoryFile("backend/public/legal/terms.html"), "utf8"),
    readFile(repositoryFile("backend/public/legal/privacy.html"), "utf8"),
    readFile(repositoryFile("backend/src/server.mjs"), "utf8"),
  ]);

  for (const document of [terms, privacy]) {
    assert.match(document, new RegExp(officialName));
    assert.match(document, /Chủ sở hữu: Nguyễn Phan Trường An/);
    assert.match(document, /Cập nhật ngày 28\/08\/2026/);
    assert.doesNotMatch(document, /IT HelpDesk App/);
  }
  assert.match(server, /version: "5\.18\.6"/);
  assert.match(server, /officialAppIdentity: \{[\s\S]*?name: "Nguyễn Phan Trường An HelpDesk"[\s\S]*?miniAppSourceVersion: "5\.17\.2"/);
});

test("v5.17.2 deployment metadata uses the verified name while the in-app brand stays concise", async () => {
  const [configText, html, layout, invite, manifestText] = await Promise.all([
    readFile(repositoryFile("miniapp/app-config.json"), "utf8"),
    readFile(repositoryFile("miniapp/index.html"), "utf8"),
    readFile(repositoryFile("miniapp/src/components/Layout.tsx"), "utf8"),
    readFile(repositoryFile("miniapp/src/pages/InviteLoginPage.tsx"), "utf8"),
    readFile(repositoryFile("miniapp/package.json"), "utf8"),
  ]);
  const config = JSON.parse(configText);
  const manifest = JSON.parse(manifestText);

  assert.equal(config.app.title, officialName);
  assert.equal(config.app.headerTitle, officialName);
  assert.match(html, new RegExp(`<title>${officialName}<\\/title>`));
  assert.equal(manifest.version, "5.17.2");
  assert.match(layout, /Zalo IT HelpDesk/);
  assert.match(invite, /IT HelpDesk<br \/>trong Zalo/);
});
