import test from "node:test";
import assert from "node:assert/strict";
import { draftPayloadFromTicket, normalizePlaybookContent, redactSensitiveText, validatePlaybookContent } from "../src/playbook-governance.mjs";

test("technician-only and high-risk procedures cannot be auto-eligible", () => {
  const technician = normalizePlaybookContent({
    id: "PB-TECH-001", title: "Runbook kỹ thuật viên", summary: "Quy trình nội bộ dành cho kỹ thuật viên.",
    audience: "technician", risk: "low", autoEligible: true, steps: ["Kiểm tra log"], keywords: ["log"],
  });
  assert.equal(technician.autoEligible, false);
  const highRisk = normalizePlaybookContent({
    id: "PB-HIGH-001", title: "Runbook rủi ro cao", summary: "Quy trình có ảnh hưởng lớn tới hệ thống.",
    audience: "employee", risk: "high", autoEligible: true, steps: ["Chuyển IT"], keywords: ["system"],
  });
  assert.equal(highRisk.autoEligible, false);
});

test("publishing high-risk procedure requires explicit forbidden steps", () => {
  const entry = normalizePlaybookContent({
    id: "PB-HIGH-002", title: "Xử lý lỗi hệ thống nghiêm trọng", summary: "Chỉ thực hiện sau khi đánh giá rủi ro và sao lưu.",
    audience: "technician", risk: "high", steps: ["Thu thập bằng chứng"], keywords: ["critical"],
  });
  assert.throws(() => validatePlaybookContent(entry, { publishing: true }), /cảnh báo an toàn/);
});

test("resolved ticket becomes a non-published technician draft", () => {
  const payload = draftPayloadFromTicket({
    id: "tkt_1", code: "HD-20260805-ABCD", title: "Máy in Offline", description: "Máy Ricoh ping được nhưng không in.",
    category: "printer", priority: "normal", risk: "low", resolution: "Khởi động lại Print Spooler\nTạo lại Standard TCP/IP Port",
  }, []);
  assert.equal(payload.audience, "technician");
  assert.equal(payload.autoEligible, false);
  assert.equal(payload.sourceTicketId, "tkt_1");
  assert.ok(payload.steps.length >= 1);
});


test("ticket draft redacts common secrets before governance review", () => {
  const text = redactSensitiveText("password: abc123 token=xyz987 wpa-passphrase: supersecret");
  assert.doesNotMatch(text, /abc123|xyz987|supersecret/);
  assert.match(text, /<REDACTED>/);
});
