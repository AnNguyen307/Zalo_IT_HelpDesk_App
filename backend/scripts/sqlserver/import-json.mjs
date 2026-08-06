import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../src/config.mjs";
import { closeStore, readDb, replaceDb } from "../../src/store.mjs";
import { EMPTY_DB, normalizeDb } from "../../src/store-helpers.mjs";

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const sourceArg = process.argv.slice(2).find((value) => !value.startsWith("--"));
const sourcePath = path.resolve(config.backendRoot, sourceArg || "./data/db.json");

if (config.dbProvider !== "sqlserver") {
  throw new Error("Set DB_PROVIDER=sqlserver before importing JSON into SQL Server.");
}

const stat = await fs.stat(sourcePath);
if (stat.size > 512 * 1024 * 1024) {
  throw new Error(`Refusing to import an unexpectedly large JSON file (${stat.size} bytes). Verify the path first.`);
}

const raw = await fs.readFile(sourcePath, "utf8");
const snapshot = normalizeDb(JSON.parse(raw || "{}"));
const sourceCounts = Object.fromEntries(Object.keys(EMPTY_DB).map((key) => [key, snapshot[key].length]));

console.log(`==> Source: ${sourcePath}`);
console.log(`==> Source counts: ${JSON.stringify(sourceCounts)}`);
console.log(`==> Import mode: ${force ? "replace existing SQL data" : "require empty SQL database"}`);

try {
  await replaceDb(snapshot, { requireEmpty: !force });
  const imported = await readDb();
  const importedCounts = Object.fromEntries(Object.keys(EMPTY_DB).map((key) => [key, imported[key].length]));
  console.log(`==> SQL counts: ${JSON.stringify(importedCounts)}`);

  for (const key of Object.keys(EMPTY_DB)) {
    if (sourceCounts[key] !== importedCounts[key]) {
      throw new Error(`Count mismatch for ${key}: source=${sourceCounts[key]}, sql=${importedCounts[key]}`);
    }
  }

  console.log("[OK] JSON data imported and verified successfully.");
} finally {
  await closeStore();
}
