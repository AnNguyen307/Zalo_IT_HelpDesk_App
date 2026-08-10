import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeCopilot } from "../src/ai-copilot.mjs";
import { config } from "../src/config.mjs";
import { resetAiRouterStateForTest } from "../src/ai-router.mjs";

const playbook = [{
  id: "VS-PRN-T01",
  title: "Khoanh vùng máy in dành cho kỹ thuật viên",
  category: "printer",
  audience: "technician",
  risk: "medium",
  priority: "normal",
  version: "1.0",
  score: 0.91,
  summary: "Kiểm tra hàng đợi và kết nối máy in.",
  requiredQuestions: ["Mã lỗi chính xác?"],
  forbiddenSteps: ["Không vào Service Mode nếu chưa có phê duyệt."],
  steps: ["Kiểm tra trạng thái hàng đợi in trên máy chủ.", "Đối chiếu địa chỉ IP máy in với cấu hình triển khai."],
}];

function configureGemini(context) {
  const keys = ["aiRouterEnabled", "aiCloudEnabled", "aiProviderOrder", "aiRoutingPolicy", "aiProviderRetries", "aiRedactionEnabled", "geminiEnabled", "geminiApiKey", "geminiModel", "geminiTimeoutMs", "groqEnabled", "openrouterEnabled", "sambanovaEnabled"];
  const original = Object.fromEntries(keys.map((key) => [key, config[key]]));
  const originalFetch = globalThis.fetch;
  context.after(() => { Object.assign(config, original); globalThis.fetch = originalFetch; resetAiRouterStateForTest(); });
  Object.assign(config, {
    aiRouterEnabled: true,
    aiCloudEnabled: true,
    aiProviderOrder: ["gemini", "groq", "openrouter", "sambanova"],
    aiRoutingPolicy: "fixed",
    aiProviderRetries: 0,
    aiRedactionEnabled: true,
    geminiEnabled: true,
    geminiApiKey: "test-key",
    geminiModel: "gemini-test",
    geminiTimeoutMs: 1000,
    groqEnabled: false,
    openrouterEnabled: false,
    sambanovaEnabled: false,
  });
  resetAiRouterStateForTest();
}

test("Copilot keeps approved Playbook actions exact and labels model hypotheses", async (context) => {
  configureGemini(context);
  let requestBody = "";
  globalThis.fetch = async (_url, options) => {
    requestBody = String(options?.body || "");
    return new Response(JSON.stringify({
    modelVersion: "gemini-test",
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      summary: "Máy in vẫn lỗi sau hướng dẫn người dùng.",
      attemptedSteps: ["Người dùng đã kiểm tra nguồn."],
      missingInformation: ["Mã lỗi chính xác"],
      likelyCauses: [
        { description: "Sai cổng in", confidence: 0.7, basis: "ai_inference", playbookId: "" },
        { description: "Nội dung Playbook do mô hình tự bịa", confidence: 0.99, basis: "playbook", playbookId: "VS-PRN-T01" },
      ],
      playbookActions: [{ sourceId: "VS-PRN-T01", stepNumbers: [2] }],
      diagnosticSuggestions: ["So sánh log hàng đợi với thời điểm phát sinh lỗi."],
      risks: ["Không reset máy chủ in khi chưa đánh giá ảnh hưởng."],
      draftReply: "HelpDesk cần bạn gửi mã lỗi chính xác.",
      confidence: 0.76,
    }) }] } }],
    usageMetadata: { totalTokenCount: 50 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await analyzeCopilot({
    ticket: { code: "HD-1", title: "Máy in lỗi", description: "password: secret máy in không hoạt động", category: "printer", priority: "normal", risk: "low", status: "open" },
    messages: [{ role: "user", authorName: "User", body: "Vẫn chưa xử lý được" }],
    playbookMatches: playbook,
  });

  assert.equal(result.provider, "gemini-cloud");
  assert.equal(result.suggestion.playbookActions[0].text, playbook[0].steps[1]);
  assert.equal(result.suggestion.playbookActions[0].basis, "playbook");
  assert.equal(result.suggestion.likelyCauses[0].basis, "ai_inference");
  assert.equal(result.suggestion.likelyCauses[1].description, playbook[0].summary);
  assert.equal(result.suggestion.likelyCauses[1].confidence, playbook[0].score);
  assert.doesNotMatch(requestBody, /password: secret/);
  assert.match(requestBody, /REDACTED_CREDENTIAL/);
});

test("Copilot falls back safely when cloud providers are unavailable", async (context) => {
  configureGemini(context);
  config.geminiEnabled = false;
  const result = await analyzeCopilot({
    ticket: { code: "HD-2", title: "Máy in lỗi", description: "Không in được", category: "printer", priority: "normal", risk: "low", status: "open" },
    playbookMatches: playbook,
  });
  assert.equal(result.provider, "rules-local");
  assert.equal(result.suggestion.playbookActions[0].text, playbook[0].steps[0]);
  assert.match(result.suggestion.draftReply, /HelpDesk đã tiếp nhận/);
});

test("Copilot is isolated from the public ticket and Mini App API surfaces", async () => {
  const [server, miniApi, admin, migration, modelSelectionMigration] = await Promise.all([
    readFile(new URL("../src/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../miniapp/src/lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/admin.js", import.meta.url), "utf8"),
    readFile(new URL("../sql/008_staff_ai_copilot.sql", import.meta.url), "utf8"),
    readFile(new URL("../sql/009_copilot_model_selection.sql", import.meta.url), "utf8"),
  ]);
  const publicTicketSource = server.slice(server.indexOf("function publicTicket"), server.indexOf("function ticketCode"));
  const publicTicketRoute = server.slice(server.indexOf('routeMatch(pathname, "/api/tickets/:ticketId")'), server.indexOf('routeMatch(pathname, "/api/tickets/:ticketId/replies")'));
  assert.doesNotMatch(publicTicketSource, /copilot/i);
  assert.doesNotMatch(publicTicketRoute, /copilot|aiCopilotRuns/i);
  assert.doesNotMatch(miniApi, /\/api\/staff\/.*copilot/i);
  assert.match(server, /\/api\/staff\/tickets\/:ticketId\/copilot/);
  assert.match(server, /requireAuth\(req, \{ staff: true \}\)/);
  assert.match(admin, /Dùng làm bản nháp/);
  assert.match(admin, /copilotModelSelect/);
  assert.match(admin, /Phân tích bằng model đã chọn/);
  assert.match(admin, /Copilot không có quyền tự gửi hoặc đóng ticket/);
  assert.match(migration, /helpdesk\.ai_copilot_runs/);
  assert.match(migration, /version_number = 8/);
  assert.match(modelSelectionMigration, /requested_provider_key/);
  assert.match(modelSelectionMigration, /version_number = 9/);
});

test("Mini App offers both explicit guidance outcomes", async () => {
  const page = await readFile(new URL("../../miniapp/src/pages/TicketDetailPage.tsx", import.meta.url), "utf8");
  assert.match(page, /Tôi đã xử lý được/);
  assert.match(page, /Tôi vẫn chưa xử lý được/);
  assert.match(page, /api\.requestHumanHelp/);
});
