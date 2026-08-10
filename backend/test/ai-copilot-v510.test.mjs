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
      playbookAssessment: { fit: "matched", explanation: "Procedure bao phủ phần kiểm tra hàng đợi nhưng chưa giải thích nguyên nhân cổng in." },
      independentAnalysis: {
        reasoningSummary: "Cần phân biệt lỗi hàng đợi, sai cổng và lỗi giao tiếp mạng bằng các phép kiểm tra độc lập.",
        hypotheses: [
          { description: "Sai cổng in", rationale: "Hàng đợi nhận job nhưng gửi sai endpoint.", confidence: 0.7, verificationSteps: ["Đối chiếu cổng đang dùng với IP thực tế."] },
          { description: "Spooler bị kẹt theo job", rationale: "Lỗi chỉ xuất hiện sau một tài liệu cụ thể.", confidence: 0.55, verificationSteps: ["So sánh thời điểm log spooler với job lỗi."] },
        ],
        solutionPaths: [
          { title: "Khoanh vùng cổng in", rationale: "Xác nhận đường đi trước khi thay đổi dịch vụ.", steps: ["Ghi nhận cổng hiện tại.", "So sánh với IP thiết bị."], successSignal: "Test page đi đúng máy in.", stopCondition: "Dừng nếu cần đổi cấu hình dùng chung.", risk: "low" },
          { title: "Cô lập job gây kẹt", rationale: "Một job lỗi có thể chặn toàn hàng đợi.", steps: ["Xác định job đầu tiên báo lỗi.", "Thử tài liệu tối giản trên hàng đợi kiểm thử."], successSignal: "Tài liệu tối giản in thành công.", stopCondition: "Chuyển cấp nếu ảnh hưởng hàng đợi dùng chung.", risk: "medium" },
        ],
      },
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
  assert.equal(result.suggestion.analysisMode, "hybrid");
  assert.equal(result.suggestion.playbookAssessment.fit, "matched");
  assert.equal(result.suggestion.independentAnalysis.available, true);
  assert.equal(result.suggestion.independentAnalysis.hypotheses.length, 2);
  assert.equal(result.suggestion.independentAnalysis.solutionPaths.length, 2);
  assert.doesNotMatch(requestBody, /password: secret/);
  assert.match(requestBody, /REDACTED_CREDENTIAL/);
  assert.match(requestBody, /independentReasoningRequired/);
});

test("Copilot becomes AI-led and proposes multiple paths when no Playbook matches", async (context) => {
  configureGemini(context);
  globalThis.fetch = async () => new Response(JSON.stringify({
    modelVersion: "gemini-test",
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      summary: "Lỗi ứng dụng nội bộ không trùng procedure hiện có.",
      attemptedSteps: ["Người dùng đã khởi động lại ứng dụng."],
      missingInformation: ["Correlation ID", "Phạm vi người dùng bị ảnh hưởng"],
      likelyCauses: [
        { description: "Token phiên hết hạn không được refresh", confidence: 0.62, basis: "ai_inference", playbookId: "" },
        { description: "Lệch thời gian giữa máy trạm và máy chủ", confidence: 0.45, basis: "ai_inference", playbookId: "" },
      ],
      playbookActions: [{ sourceId: "VS-PRN-T01", stepNumbers: [1] }],
      playbookAssessment: { fit: "none", explanation: "Các procedure được truy hồi không mô tả lỗi phiên của ứng dụng này." },
      independentAnalysis: {
        reasoningSummary: "Cần tách lỗi xác thực phiên khỏi lỗi kết nối bằng correlation ID và so sánh trên nhiều máy.",
        hypotheses: [
          { description: "Token refresh thất bại", rationale: "Khởi động lại chỉ tạo phiên mới tạm thời.", confidence: 0.62, verificationSteps: ["Đối chiếu thời điểm 401 với log refresh token."] },
          { description: "Đồng hồ máy trạm lệch", rationale: "Token có thể bị xem là chưa hợp lệ hoặc hết hạn.", confidence: 0.45, verificationSteps: ["So sánh thời gian máy trạm với nguồn thời gian doanh nghiệp."] },
        ],
        solutionPaths: [
          { title: "Khoanh vùng luồng xác thực", rationale: "Kiểm tra không phá hủy trước khi thay đổi cấu hình.", steps: ["Lấy correlation ID đã che dữ liệu nhạy cảm.", "Đối chiếu chuỗi 401/refresh trong log."], successSignal: "Xác định được bước xác thực đầu tiên thất bại.", stopCondition: "Dừng nếu log chứa credential chưa được che.", risk: "low" },
          { title: "So sánh A/B máy trạm", rationale: "Phân biệt lỗi theo thiết bị với lỗi dịch vụ dùng chung.", steps: ["Dùng cùng tài khoản thử trên máy chuẩn đã phê duyệt.", "So sánh thời gian và phiên bản ứng dụng."], successSignal: "Lỗi chỉ tái hiện ở một nhóm máy có cùng khác biệt.", stopCondition: "Chuyển cấp nếu lỗi xảy ra trên toàn bộ máy chuẩn.", risk: "medium" },
        ],
      },
      diagnosticSuggestions: ["Kiểm tra correlation ID và mã HTTP theo cùng mốc thời gian."],
      risks: ["Không thu thập token hoặc cookie phiên nguyên bản."],
      draftReply: "HelpDesk đang kiểm tra lỗi phiên; vui lòng gửi correlation ID và thời điểm phát sinh.",
      confidence: 0.58,
    }) }] } }],
    usageMetadata: { totalTokenCount: 80 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const result = await analyzeCopilot({
    ticket: { code: "HD-3", title: "Ứng dụng nội bộ báo lỗi phiên", description: "Lỗi lạ sau khoảng 20 phút sử dụng", category: "software", priority: "normal", risk: "low", status: "open" },
    playbookMatches: playbook,
  });

  assert.equal(result.provider, "gemini-cloud");
  assert.equal(result.suggestion.analysisMode, "ai_led");
  assert.equal(result.suggestion.playbookAssessment.fit, "none");
  assert.deepEqual(result.suggestion.playbookActions, []);
  assert.deepEqual(result.suggestion.playbookIds, []);
  assert.equal(result.suggestion.independentAnalysis.hypotheses.length, 2);
  assert.equal(result.suggestion.independentAnalysis.solutionPaths.length, 2);
  assert.ok(result.suggestion.independentAnalysis.solutionPaths.every((item) => item.stopCondition));
});

test("Copilot rejects destructive independent actions instead of exposing them to staff", async (context) => {
  configureGemini(context);
  globalThis.fetch = async () => new Response(JSON.stringify({
    modelVersion: "gemini-test",
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      summary: "Phân tích không an toàn cần bị từ chối.",
      attemptedSteps: [],
      missingInformation: [],
      likelyCauses: [],
      playbookActions: [],
      playbookAssessment: { fit: "none", explanation: "Không có Playbook phù hợp." },
      independentAnalysis: {
        reasoningSummary: "Kết quả kiểm thử guardrail.",
        hypotheses: [
          { description: "Giả thuyết A", rationale: "Lý do A", confidence: 0.5, verificationSteps: ["Kiểm tra A"] },
          { description: "Giả thuyết B", rationale: "Lý do B", confidence: 0.4, verificationSteps: ["Kiểm tra B"] },
        ],
        solutionPaths: [
          { title: "Thao tác phá hủy", rationale: "Không được phép", steps: ["Hãy chạy format C:"], successSignal: "Ổ bị xóa", stopCondition: "Dừng", risk: "high" },
          { title: "Kiểm tra an toàn", rationale: "Quan sát", steps: ["Đọc log"], successSignal: "Có mã lỗi", stopCondition: "Chuyển cấp nếu thiếu quyền", risk: "low" },
        ],
      },
      diagnosticSuggestions: [],
      risks: [],
      draftReply: "HelpDesk đang kiểm tra.",
      confidence: 0.4,
    }) }] } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const result = await analyzeCopilot({
    ticket: { code: "HD-4", title: "Lỗi ổ đĩa", description: "Không mở được dữ liệu", category: "hardware", priority: "high", risk: "high", status: "open" },
    playbookMatches: [],
  });

  assert.equal(result.provider, "rules-local");
  assert.equal(result.suggestion.analysisMode, "rules_fallback");
  assert.equal(result.telemetry.attempts[0].reasonCode, "unsafe_output");
  assert.doesNotMatch(JSON.stringify(result.suggestion), /format C:/);
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
  assert.equal(result.suggestion.analysisMode, "rules_fallback");
  assert.equal(result.suggestion.independentAnalysis.available, false);
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
  assert.match(admin, /Phân tích độc lập của AI/);
  assert.match(admin, /Nhiều hướng giải quyết do AI đề xuất/);
  assert.match(admin, /Copilot không có quyền tự gửi, thực thi hoặc đóng ticket/);
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
