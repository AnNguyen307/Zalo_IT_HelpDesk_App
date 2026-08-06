import assert from "node:assert/strict";
import test from "node:test";
import { createNotification, publicNotification } from "../src/notifications.mjs";
import { plainSystemText } from "../src/system-text.mjs";

test("plainSystemText removes emoji icons and keeps system copy", () => {
  assert.equal(
    plainSystemText("⏰ Ticket đã quá thời hạn phản hồi đầu tiên theo SLA."),
    "Ticket đã quá thời hạn phản hồi đầu tiên theo SLA.",
  );
  assert.equal(plainSystemText("⚠️ SLA quá hạn 🚨\nHelpDesk đang xử lý."), "SLA quá hạn\nHelpDesk đang xử lý.");
});

test("notifications are text-only for new and legacy records", () => {
  const created = createNotification({ userId: "usr-1", title: "🔔 Cập nhật ticket", body: "✅ Đã tiếp nhận" });
  assert.equal(created.title, "Cập nhật ticket");
  assert.equal(created.body, "Đã tiếp nhận");

  const legacy = publicNotification({ title: "⏰ Quá hạn", body: "📣 HelpDesk đã được nhắc" });
  assert.equal(legacy.title, "Quá hạn");
  assert.equal(legacy.body, "HelpDesk đã được nhắc");
});
