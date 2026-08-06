import { id, nowIso } from "./utils.mjs";

export function createNotification({ userId, ticketId = "", type = "info", title, body }) {
  return {
    id: id("ntf"),
    userId,
    ticketId,
    type,
    title: String(title || "Thông báo").slice(0, 160),
    body: String(body || "").slice(0, 1000),
    readAt: null,
    createdAt: nowIso(),
  };
}

export function pushNotification(db, payload) {
  const notification = createNotification(payload);
  db.notifications.push(notification);
  if (db.notifications.length > 10_000) db.notifications.splice(0, db.notifications.length - 10_000);
  return notification;
}
