import { config } from "../../src/config.mjs";
import { closeStore, initializePostgresSchema } from "../../src/store-postgres.mjs";

if (config.dbProvider !== "postgres") {
  throw new Error("Set DB_PROVIDER=postgres before initializing the PostgreSQL state store.");
}

try {
  await initializePostgresSchema();
  console.log("PostgreSQL state schema 1 is ready.");
} finally {
  await closeStore().catch(() => undefined);
}
