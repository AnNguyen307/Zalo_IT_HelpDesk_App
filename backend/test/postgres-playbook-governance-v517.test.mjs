import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createPostgresPlaybookGovernanceRepository,
  withGovernanceTransaction,
} from "../src/playbook-governance-postgres.mjs";
import {
  normalizePlaybookContent,
  redactSensitiveText,
  validatePlaybookContent,
} from "../src/playbook-governance-core.mjs";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(backendRoot, "..");

class TransactionPool {
  constructor(failures = []) {
    this.failures = [...failures];
    this.clients = [];
  }

  async connect() {
    const client = {
      statements: [],
      released: false,
      query: async (statement, params = []) => {
        client.statements.push({ statement, params });
        return { rows: [] };
      },
      release: () => { client.released = true; },
    };
    this.clients.push(client);
    return client;
  }
}

test("PostgreSQL governance transaction retries serialization failures and commits once", async () => {
  const retryable = Object.assign(new Error("serialization failure"), { code: "40001" });
  const pool = new TransactionPool();
  let calls = 0;
  const result = await withGovernanceTransaction(pool, async () => {
    calls += 1;
    if (calls === 1) throw retryable;
    return "committed";
  });

  assert.equal(result, "committed");
  assert.equal(calls, 2);
  assert.equal(pool.clients.length, 2);
  assert.equal(pool.clients[0].statements[0].statement, "BEGIN ISOLATION LEVEL SERIALIZABLE");
  assert.equal(pool.clients[0].statements[1].statement, "SELECT pg_advisory_xact_lock($1)");
  assert.deepEqual(pool.clients[0].statements[1].params, [51700]);
  assert.equal(pool.clients[0].statements.at(-1).statement, "ROLLBACK");
  assert.equal(pool.clients[1].statements.at(-1).statement, "COMMIT");
  assert.ok(pool.clients.every((client) => client.released));
});

test("PostgreSQL governance transaction rolls back business errors without retry", async () => {
  const pool = new TransactionPool();
  const businessError = Object.assign(new Error("forbidden"), { status: 403 });
  let calls = 0;

  await assert.rejects(
    withGovernanceTransaction(pool, async () => { calls += 1; throw businessError; }),
    (error) => error === businessError,
  );
  assert.equal(calls, 1);
  assert.equal(pool.clients.length, 1);
  assert.equal(pool.clients[0].statements.at(-1).statement, "ROLLBACK");
  assert.equal(pool.clients[0].released, true);
});

test("baseline seed reports committed counts after a serialization retry", async () => {
  let connections = 0;
  const pool = {
    async query(statement) {
      if (statement.includes("to_regclass")) return { rows: [{ ready: true }] };
      throw new Error(`Unexpected pool query: ${statement}`);
    },
    async connect() {
      connections += 1;
      const connectionNumber = connections;
      return {
        async query(statement) {
          if (statement === "SELECT code FROM public.helpdesk_playbook_procedures") return { rows: [] };
          if (statement === "COMMIT" && connectionNumber === 1) {
            throw Object.assign(new Error("serialization failure at commit"), { code: "40001" });
          }
          return { rows: [] };
        },
        release() {},
      };
    },
  };
  const repository = createPostgresPlaybookGovernanceRepository(pool);
  const result = await repository.seedFromFile({ sub: "system", name: "Seeder", role: "admin" });

  assert.equal(connections, 2);
  assert.deepEqual(result, { inserted: 173, skipped: 0, total: 173 });
});

test("PostgreSQL repository enforces governance roles before database access", async () => {
  const inaccessiblePool = {
    async query() { throw new Error("database must not be reached"); },
    async connect() { throw new Error("database must not be reached"); },
  };
  const repository = createPostgresPlaybookGovernanceRepository(inaccessiblePool);

  await assert.rejects(
    repository.createDraft({ sub: "user-1", name: "User", role: "user" }, {}),
    (error) => error.status === 403,
  );
  await assert.rejects(
    repository.publishVersion({ sub: "tech-1", name: "Tech", role: "technician" }, "pbv-1"),
    (error) => error.status === 403,
  );
  await assert.rejects(
    repository.setLifecycle({ sub: "tech-1", name: "Tech", role: "technician" }, "pbp-1", "archived"),
    (error) => error.status === 403,
  );
});

test("shared governance validation keeps high-risk procedures out of automatic guidance", () => {
  const content = normalizePlaybookContent({
    id: "PB-HIGH-RISK",
    title: "Thay đổi cấu hình lõi",
    summary: "Quy trình kiểm soát thay đổi cấu hình lõi của hệ thống.",
    audience: "employee",
    risk: "high",
    autoEligible: true,
    steps: ["Chuyển cho kỹ thuật viên được phân quyền."],
    forbiddenSteps: ["Không cung cấp hoặc nhập secret trong ticket."],
    keywords: ["cấu hình lõi"],
  });
  assert.equal(content.autoEligible, false);
  assert.doesNotThrow(() => validatePlaybookContent(content, { publishing: true }));
  assert.equal(redactSensitiveText("api_key=super-secret-value"), "api_key=<REDACTED>");
});

test("v5.17.0 installs an idempotent, normalized and private PostgreSQL governance schema", async () => {
  const migration = await readFile(path.join(backendRoot, "sql", "postgres", "002_playbook_governance.sql"), "utf8");
  for (const table of [
    "helpdesk_playbook_procedures",
    "helpdesk_playbook_versions",
    "helpdesk_playbook_events",
    "helpdesk_playbook_index_state",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
    assert.match(migration, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC`));
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /UNIQUE \(procedure_id, version_number\)/);
  assert.match(migration, /WHERE status = 'published'/);
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /ON CONFLICT \(migration_key\) DO NOTHING/);
  assert.match(migration, /playbook-governance-v1/);
});

test("v5.17.0 wires PostgreSQL governance into startup, RAG and Render", async () => {
  const [store, playbook, server, render, healthSource] = await Promise.all([
    readFile(path.join(backendRoot, "src", "store-postgres.mjs"), "utf8"),
    readFile(path.join(backendRoot, "src", "playbook.mjs"), "utf8"),
    readFile(path.join(backendRoot, "src", "server.mjs"), "utf8"),
    readFile(path.join(repositoryRoot, "render.yaml"), "utf8"),
    readFile(path.join(backendRoot, "src", "server.mjs"), "utf8"),
  ]);
  assert.match(store, /\["001_state_store\.sql", "002_playbook_governance\.sql"\]/);
  assert.match(playbook, /\["sqlserver", "postgres"\]\.includes\(config\.dbProvider\)/);
  assert.match(playbook, /PostgreSQL \/ public\.helpdesk_playbook_\*/);
  assert.match(server, /governance\.counts\?\.procedures === 0/);
  assert.match(server, /if \(governance\.ready\)/);
  assert.match(server, /reindexRequestedBy = "PostgreSQL Startup Recovery"/);
  assert.match(server, /if \(config\.playbookAutoReindexOnPublish\)/);
  assert.match(server, /queuePlaybookReindex\(\{ requestedBy: reindexRequestedBy \}\)/);
  assert.match(render, /key: PLAYBOOK_GOVERNANCE_ENABLED\n\s+value: "true"/);
  assert.match(healthSource, /"postgres-playbook-governance"/);
  assert.match(healthSource, /version: "5\.18\.1"/);
});
