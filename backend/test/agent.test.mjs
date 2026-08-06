import test from "node:test";
import assert from "node:assert/strict";
import { analyzeWithRules, formatAgentReply } from "../src/ai-agent.mjs";
import { KB_SEED } from "../src/kb.mjs";

const entries = KB_SEED.map((entry, index) => ({ ...entry, id: `kb_${index}`, active: true }));
const ricohPlaybook = [{
  id: "VS-PRN-U01",
  title: "Máy in Ricoh Offline hoặc không in",
  category: "printer",
  audience: "employee",
  risk: "low",
  priority: "normal",
  score: 1,
  semanticScore: 1,
  version: "1.0",
  sourceType: "enterprise-playbook",
  summary: "Khoanh vùng trạng thái máy, kết nối và hàng đợi in bằng các bước an toàn.",
  steps: ["Kiểm tra màn hình máy in có mã lỗi hay cảnh báo giấy/mực.", "Xác nhận máy tính đang chọn đúng máy in.", "Kiểm tra hàng đợi in và trạng thái Offline."],
  forbiddenSteps: ["Không vào Service Mode."],
  autoEligible: true,
}];

function ticket(title, description) { return { title, description }; }

test("strict agent guides only with an approved matching Playbook", () => {
  const result = analyzeWithRules(ticket("Máy in Ricoh Offline không in được", "Máy Ricoh tầng 2 báo Offline và hàng đợi bị kẹt."), entries, {}, ricohPlaybook);
  assert.equal(result.category, "printer");
  assert.equal(result.canAutoHandle, true);
  assert.equal(result.escalated, false);
  assert.deepEqual(result.playbookIds, ["VS-PRN-U01"]);
  assert.ok(result.steps.length >= 1);
});

test("strict agent escalates password and account requests", () => {
  const result = analyzeWithRules(ticket("Tài khoản bị khóa và quên mật khẩu", "Tôi không đăng nhập được và cần reset password ngay."), entries, {}, []);
  assert.equal(result.category, "account");
  assert.equal(result.canAutoHandle, false);
  assert.equal(result.escalated, true);
  assert.equal(result.steps.length, 0);
  assert.equal(result.questions.length, 0);
});

test("strict agent escalates requests outside the Playbook without vague suggestions", () => {
  const result = analyzeWithRules(ticket("Thiết bị có hiện tượng lạ", "Không rõ nguyên nhân và chưa có thông báo lỗi cụ thể."), entries, {}, []);
  assert.equal(result.canAutoHandle, false);
  assert.equal(result.escalationCode, "no_playbook_match");
  assert.deepEqual(result.steps, []);
  assert.deepEqual(result.questions, []);
  assert.match(formatAgentReply(result), /chuyển|kỹ thuật viên/i);
});

test("Knowledge Base alone cannot authorize self-guidance in Strict Mode", () => {
  const result = analyzeWithRules(ticket("Máy in Ricoh Offline", "Máy in vẫn bật nhưng không thể in."), entries, {}, []);
  assert.equal(result.canAutoHandle, false);
  assert.equal(result.escalationCode, "no_playbook_match");
});

test("non-auto-eligible or high-risk Playbook is escalated", () => {
  const unsafe = [{ ...ricohPlaybook[0], id: "VS-PRN-T27", risk: "high", autoEligible: false }];
  const result = analyzeWithRules(ticket("Ricoh báo mã SC", "Máy in dừng và hiện mã SC542."), entries, {}, unsafe);
  assert.equal(result.canAutoHandle, false);
  assert.equal(result.escalationCode, "playbook_not_auto_eligible");
  assert.equal(result.steps.length, 0);
});

test("escalation reply never contains a speculative checklist", () => {
  const result = analyzeWithRules(ticket("Lỗi ngoài tài liệu", "Một thiết bị mới có triệu chứng chưa từng ghi nhận."), entries, {}, []);
  const reply = formatAgentReply(result);
  assert.doesNotMatch(reply, /Các bước theo Playbook:/i);
  assert.doesNotMatch(reply, /1\./);
  assert.equal(reply, "Đã chuyển yêu cầu cho kỹ thuật viên.");
});
