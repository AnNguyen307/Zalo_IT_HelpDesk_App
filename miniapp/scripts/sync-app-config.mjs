import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = path.join(projectDirectory, "dist");
const indexPath = path.join(distDirectory, "index.html");
const configPath = path.join(projectDirectory, "app-config.json");
const normalize = (value) => value.split(/[?#]/)[0].replaceAll("\\", "/").replace(/^\.?\//, "");
const unique = (items) => [...new Set(items)];

async function main() {
  const [html, configText] = await Promise.all([readFile(indexPath, "utf8"), readFile(configPath, "utf8")]);
  const javascriptFiles = unique([...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+?\.js(?:[?#][^"']*)?)["'][^>]*>/gi)].map((match) => normalize(match[1])));
  const cssFiles = unique([...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+?\.css(?:[?#][^"']*)?)["'][^>]*>/gi)].map((match) => normalize(match[1])));
  if (!javascriptFiles.length) throw new Error("Không tìm thấy JavaScript trong dist/index.html");
  await Promise.all([...javascriptFiles, ...cssFiles].map((file) => access(path.join(distDirectory, file))));
  const config = JSON.parse(configText);
  config.debug = false;
  config.listCSS = cssFiles;
  config.listSyncJS = javascriptFiles;
  config.listAsyncJS = [];
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log("✓ Đã tự động cập nhật app-config.json");
  console.log(`  JavaScript: ${javascriptFiles.join(", ")}`);
  console.log(`  CSS: ${cssFiles.join(", ") || "Không có"}`);
}

main().catch((error) => { console.error("✗ Không thể cập nhật app-config.json"); console.error(error.message); process.exitCode = 1; });
