import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.mjs";
import { EMPTY_DB, normalizeDb } from "./store-helpers.mjs";

let queue = Promise.resolve();

async function ensureFile() {
  await fs.mkdir(path.dirname(config.dataFile), { recursive: true });
  await fs.mkdir(config.uploadsDir, { recursive: true });
  try {
    await fs.access(config.dataFile);
  } catch {
    await fs.writeFile(config.dataFile, JSON.stringify(EMPTY_DB, null, 2));
  }
}

export async function initializeStore() {
  await ensureFile();
}

export async function readDb() {
  await ensureFile();
  const raw = await fs.readFile(config.dataFile, "utf8");
  return normalizeDb(JSON.parse(raw || "{}"));
}

async function atomicWrite(db) {
  const temp = `${config.dataFile}.tmp`;
  await fs.writeFile(temp, JSON.stringify(normalizeDb(db), null, 2));
  await fs.rename(temp, config.dataFile);
}

export function updateDb(mutator) {
  const task = queue.then(async () => {
    const db = await readDb();
    const result = await mutator(db);
    await atomicWrite(db);
    return result;
  });
  queue = task.catch(() => undefined);
  return task;
}

export async function replaceDb(snapshot) {
  const task = queue.then(async () => {
    const db = normalizeDb(snapshot);
    await atomicWrite(db);
    return db;
  });
  queue = task.catch(() => undefined);
  return task;
}

export async function getStoreStatus() {
  try {
    const db = await readDb();
    return {
      ready: true,
      provider: "json",
      dataFile: config.dataFile,
      counts: Object.fromEntries(Object.keys(EMPTY_DB).map((key) => [key, db[key].length])),
      error: null,
    };
  } catch (error) {
    return { ready: false, provider: "json", dataFile: config.dataFile, counts: {}, error: error.message };
  }
}

export async function closeStore() {
  // No persistent connection for the JSON adapter.
}
