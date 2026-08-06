import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../src/config.mjs";
import { closeStore, readDb } from "../../src/store.mjs";

const targetArg = process.argv.slice(2).find((value) => !value.startsWith("--"));
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const targetPath = path.resolve(config.backendRoot, targetArg || `./data/sqlserver-export-${timestamp}.json`);

if (config.dbProvider !== "sqlserver") {
  throw new Error("Set DB_PROVIDER=sqlserver before exporting SQL Server data.");
}

try {
  const db = await readDb();
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(db, null, 2));
  console.log(`[OK] SQL Server snapshot exported to: ${targetPath}`);
} finally {
  await closeStore();
}
