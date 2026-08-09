import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(backendRoot, "..");

async function textFiles(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await textFiles(target));
    else result.push(target);
  }
  return result;
}

test("active runtime and Windows startup contain no local AI integration", async () => {
  const files = [
    ...await textFiles(path.join(backendRoot, "src")),
    ...await textFiles(path.join(projectRoot, "scripts", "windows")),
    path.join(backendRoot, ".env.example"),
    path.join(projectRoot, ".vscode", "tasks.json"),
  ];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content, /ollama/i, path.relative(projectRoot, file));
  }
});

test("legacy local-AI environment values fail closed to Rules and supported cloud providers", async () => {
  const script = [
    'import { config } from "./src/config.mjs";',
    'console.log(JSON.stringify({ agentMode: config.agentMode, aiProvider: config.aiProvider, order: config.aiProviderOrder, embed: config.playbookEmbedProvider }));',
  ].join("");
  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: backendRoot,
    env: {
      ...process.env,
      AGENT_MODE: "ollama",
      AI_PROVIDER: "ollama",
      AI_PROVIDER_ORDER: "gemini,groq,openrouter,sambanova,ollama",
      PLAYBOOK_EMBED_PROVIDER: "ollama",
    },
  });
  const result = JSON.parse(stdout.trim());

  assert.equal(result.agentMode, "rules");
  assert.equal(result.aiProvider, "rules");
  assert.deepEqual(result.order, ["gemini", "groq", "openrouter", "sambanova"]);
  assert.equal(result.embed, "none");
});
