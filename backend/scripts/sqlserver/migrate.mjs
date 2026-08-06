import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../src/config.mjs";
import { closeStore, getSqlServerPool } from "../../src/store-sqlserver.mjs";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sqlDir = path.join(backendRoot, "sql");

function splitBatches(source) {
  return source.split(/^\s*GO\s*;?\s*$/gim).map((batch) => batch.trim()).filter(Boolean);
}

function isAutomaticMigration(name) {
  const match = name.match(/^(\d{3})_.*\.sql$/i);
  if (!match) return false;
  const number = Number(match[1]);
  return number === 1 || number >= 4;
}

if (config.dbProvider !== "sqlserver") {
  console.warn("[WARN] DB_PROVIDER is not sqlserver. Migration will still use SQLSERVER_* settings.");
}

const files = (await fs.readdir(sqlDir)).filter(isAutomaticMigration).sort();
if (!files.length) throw new Error("No automatic SQL Server migrations found.");

const pool = await getSqlServerPool();
console.log(`==> SQL Server: ${config.sqlServerHost}${config.sqlServerInstance ? `\\${config.sqlServerInstance}` : `:${config.sqlServerPort}`}`);
console.log(`==> Database: ${config.sqlServerDatabase}`);
console.log(`==> Migration files: ${files.join(", ")}`);

try {
  for (const file of files) {
    const source = await fs.readFile(path.join(sqlDir, file), "utf8");
    const batches = splitBatches(source);
    console.log(`==> ${file}: ${batches.length} batch(es)`);
    for (let index = 0; index < batches.length; index += 1) {
      await pool.request().batch(batches[index]);
      console.log(`[OK] ${file} batch ${index + 1}/${batches.length}`);
    }
  }
  const version = await pool.request().query("SELECT MAX(version_number) AS version_number FROM helpdesk.schema_version");
  console.log(`[OK] SQL Server migration completed. Schema version: ${version.recordset?.[0]?.version_number ?? "unknown"}`);
} finally {
  await closeStore();
}
