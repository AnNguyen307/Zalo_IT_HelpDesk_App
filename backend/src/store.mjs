import { config } from "./config.mjs";
import * as jsonStore from "./store-json.mjs";
import * as postgresStore from "./store-postgres.mjs";
import * as sqlServerStore from "./store-sqlserver.mjs";
import { historyEntry, pushHistory } from "./store-helpers.mjs";
import { id, nowIso } from "./utils.mjs";

const adapter = config.dbProvider === "sqlserver"
  ? sqlServerStore
  : config.dbProvider === "postgres"
    ? postgresStore
    : jsonStore;

export const initializeStore = (...args) => adapter.initializeStore(...args);
export const readDb = (...args) => adapter.readDb(...args);
export const updateDb = (...args) => adapter.updateDb(...args);
export const replaceDb = (...args) => adapter.replaceDb(...args);
export const getStoreStatus = (...args) => adapter.getStoreStatus(...args);
export const closeStore = (...args) => adapter.closeStore(...args);
export { historyEntry, pushHistory };

export async function seedKnowledgeBase(entries) {
  return updateDb((db) => {
    if (db.knowledgeBase.length) return db.knowledgeBase;
    db.knowledgeBase = entries.map((entry) => ({
      ...entry,
      id: entry.id || id("kb"),
      active: entry.active !== false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }));
    return db.knowledgeBase;
  });
}

export async function audit(actor, action, entityType, entityId, detail = {}) {
  return updateDb((db) => {
    db.auditLog.push({
      id: id("audit"),
      actor,
      action,
      entityType,
      entityId,
      detail,
      createdAt: nowIso(),
    });
    if (db.auditLog.length > 5000) db.auditLog.splice(0, db.auditLog.length - 5000);
  });
}
