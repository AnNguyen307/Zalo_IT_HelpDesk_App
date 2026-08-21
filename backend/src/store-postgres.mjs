import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { config } from "./config.mjs";
import { EMPTY_DB, normalizeDb } from "./store-helpers.mjs";

const { Pool } = pg;
const STATE_ID = 1;
const STATE_TABLE = "public.helpdesk_runtime_state";

let pool = null;
let defaultAdapter = null;

function postgresSsl() {
  if (config.postgresSslMode === "disable") return false;
  if (config.postgresSslMode === "verify-full") return { rejectUnauthorized: true };
  // Matches libpq sslmode=require: encrypted transport without hostname/CA verification.
  return { rejectUnauthorized: false };
}

export function getPostgresConnectionConfig() {
  if (!config.postgresUrl) throw new Error("POSTGRES_URL is required when DB_PROVIDER=postgres.");
  return {
    connectionString: config.postgresUrl,
    ssl: postgresSsl(),
    max: config.postgresPoolMax,
    connectionTimeoutMillis: config.postgresConnectionTimeoutMs,
    idleTimeoutMillis: config.postgresIdleTimeoutMs,
    statement_timeout: config.postgresStatementTimeoutMs,
    application_name: "zalo-helpdesk-v5.16.2",
  };
}

export function getPostgresPool() {
  if (!pool) pool = new Pool(getPostgresConnectionConfig());
  return pool;
}

function stateValue(value) {
  if (typeof value === "string") return normalizeDb(JSON.parse(value || "{}"));
  return normalizeDb(value || {});
}

function missingSchemaError() {
  return new Error("PostgreSQL state schema is not initialized. Run npm run db:postgres:init before starting the backend.");
}

export function createPostgresStateAdapter(targetPool) {
  let queue = Promise.resolve();

  async function selectState(executor, { lock = false } = {}) {
    const result = await executor.query(
      `SELECT revision, state, updated_at FROM ${STATE_TABLE} WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
      [STATE_ID],
    );
    const row = result.rows?.[0];
    if (!row) throw missingSchemaError();
    return { revision: Number(row.revision || 0), state: stateValue(row.state), updatedAt: row.updated_at || null };
  }

  async function initializeStore() {
    try { await selectState(targetPool); }
    catch (error) {
      if (error?.code === "42P01") throw missingSchemaError();
      throw error;
    }
  }

  async function initializeSchema(sql) {
    await targetPool.query(sql);
  }

  async function readDb() {
    return (await selectState(targetPool)).state;
  }

  function transaction(taskBody) {
    const task = queue.then(async () => {
      const client = await targetPool.connect();
      try {
        await client.query("BEGIN");
        const current = await selectState(client, { lock: true });
        const outcome = await taskBody(current.state);
        await client.query(
          `UPDATE ${STATE_TABLE} SET state = $2::jsonb, revision = revision + 1, updated_at = NOW() WHERE id = $1`,
          [STATE_ID, JSON.stringify(normalizeDb(current.state))],
        );
        await client.query("COMMIT");
        return outcome;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    });
    queue = task.catch(() => undefined);
    return task;
  }

  function updateDb(mutator) {
    return transaction((db) => mutator(db));
  }

  function replaceDb(snapshot) {
    return transaction((db) => {
      const replacement = normalizeDb(snapshot);
      for (const key of Object.keys(EMPTY_DB)) db[key] = replacement[key];
      return normalizeDb(db);
    });
  }

  async function getStoreStatus() {
    try {
      const current = await selectState(targetPool);
      return {
        ready: true,
        provider: "postgres",
        stateSchema: 1,
        revision: current.revision,
        updatedAt: current.updatedAt,
        counts: Object.fromEntries(Object.keys(EMPTY_DB).map((key) => [key, current.state[key].length])),
        error: null,
      };
    } catch (error) {
      return { ready: false, provider: "postgres", stateSchema: 1, counts: {}, error: error.message };
    }
  }

  async function closeStore() {
    await targetPool.end();
  }

  return { initializeStore, initializeSchema, readDb, updateDb, replaceDb, getStoreStatus, closeStore };
}

function adapter() {
  if (!defaultAdapter) defaultAdapter = createPostgresStateAdapter(getPostgresPool());
  return defaultAdapter;
}

export async function initializePostgresSchema() {
  const migration = path.join(config.backendRoot, "sql", "postgres", "001_state_store.sql");
  await adapter().initializeSchema(await fs.readFile(migration, "utf8"));
}

export const initializeStore = (...args) => adapter().initializeStore(...args);
export const readDb = (...args) => adapter().readDb(...args);
export const updateDb = (...args) => adapter().updateDb(...args);
export const replaceDb = (...args) => adapter().replaceDb(...args);
export const getStoreStatus = (...args) => adapter().getStoreStatus(...args);
export const closeStore = (...args) => adapter().closeStore(...args);
