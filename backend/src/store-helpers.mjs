import { id, nowIso } from "./utils.mjs";

export const EMPTY_DB = Object.freeze({
  users: [],
  staffAccounts: [],
  tickets: [],
  messages: [],
  attachments: [],
  notifications: [],
  ticketHistory: [],
  knowledgeBase: [],
  auditLog: [],
});

export function emptyDb() {
  return structuredClone(EMPTY_DB);
}

export function normalizeDb(value = {}) {
  const db = { ...emptyDb(), ...(value && typeof value === "object" ? value : {}) };
  for (const key of Object.keys(EMPTY_DB)) {
    if (!Array.isArray(db[key])) db[key] = [];
  }
  return db;
}

export function historyEntry({ ticketId, actorId, actorName, type, from = null, to = null, note = "" }) {
  return {
    id: id("his"),
    ticketId,
    actorId,
    actorName: actorName || "Hệ thống",
    type,
    from,
    to,
    note: String(note || "").slice(0, 1000),
    createdAt: nowIso(),
  };
}

export function pushHistory(db, payload) {
  const entry = historyEntry(payload);
  db.ticketHistory.push(entry);
  if (db.ticketHistory.length > 20_000) db.ticketHistory.splice(0, db.ticketHistory.length - 20_000);
  return entry;
}
