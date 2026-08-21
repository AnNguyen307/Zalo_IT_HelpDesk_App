# v5.16.4 — Cloud AI Reliability

## Kết quả

Cloud AI Router không còn chuyển thẳng về `rules_fallback` chỉ vì model do HelpDesk chọn lỗi. Model đó được gọi trước, sau đó router thử các provider cloud còn lại theo route `Gemini → Groq → OpenRouter → SambaNova`; Rules/Playbook chỉ được dùng khi không provider nào trả quyết định hợp lệ.

## Thay đổi chính

- Retry output `invalid_json`, `schema_mismatch`, `invalid_response` trước khi failover.
- Khi strict structured output bị provider từ chối, lần retry dùng JSON Object Mode và vẫn validate bằng schema/guardrail nội bộ.
- Phát hiện Gemini `finishReason=MAX_TOKENS` như `output_truncated` thay vì parse JSON dở dang.
- Ngân sách output tối thiểu là 4.096 token cho bốn provider để đáp ứng schema Copilot gồm tối thiểu hai giả thuyết và hai solution path.
- Gemini 3.x dùng temperature mặc định của model thay vì cưỡng bức giá trị legacy `0.1`.
- Alias OpenRouter cũ `openai/gpt-oss-120b:free` tự chuyển sang free router chính thức `openrouter/free`; environment hiện có không cần sửa thủ công.
- Parser chỉ trích xuất object JSON hoàn chỉnh có thể kiểm chứng; không tự vá hoặc bịa phần JSON bị cắt.
- `/health` và AI Control Plane thêm `operationalState`: `ready`, `healthy`, `degraded` hoặc `fallback`, nên lỗi inference gần đây không còn bị trình bày như đang ổn định.
- Copilot hiển thị rõ `Dự phòng · Rules + Playbook` khi cloud thất bại; điểm retrieval Playbook không bị hiểu nhầm là confidence của Cloud AI.

Tài liệu provider được đối chiếu:

- [Gemini GenerateContent và finish reason](https://ai.google.dev/api/generate-content)
- [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs)
- [OpenRouter Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-router)

## An toàn và tương thích

- Giữ strict escalation, cloud redaction, circuit breaker, quota telemetry và employee-safe response.
- API key vẫn chỉ nằm ở backend secret; không thêm secret vào source, Admin hoặc Mini App.
- Không thay đổi public Mini App contract.
- Backend/Admin: `5.16.4`; Mini App: `5.16.0`.
- SQL Server/NAS schema `10`; PostgreSQL state schema `1`.
- Không có database migration và không cần deploy lại Zalo Mini App.

## Validation

- `npm ci`: hoàn tất với lockfile hiện tại.
- Kiểm tra cú pháp trực tiếp toàn bộ `backend/src`, `backend/scripts` và `backend/public`: đạt. Work Mode không duy trì được phiên phê duyệt cho wrapper `npm run check`, nên đã chạy chính các lệnh `node --check` tương đương.
- `node --test test/*.test.mjs`: **122/122 test đạt**.
- Runtime smoke: `/health` trả `5.16.4`, PostgreSQL/JSON adapter và Admin assets khởi động đúng; Playbook nạp đủ 173 procedure.
- Regression bao phủ selected-provider failover, malformed JSON retry, Groq JSON Object fallback, provider degraded state, Gemini 3 generation config và compatibility alias OpenRouter.
- Credential scan và `git diff --check` trên intended diff: đạt.

## Deploy và rollback

`render.yaml` giữ `autoDeployTrigger: off`. Merge GitHub không tự deploy; Backend/Admin production chỉ đổi sau khi chủ dự án xác nhận deploy Render.

Rollback bằng cách redeploy commit v5.16.3. Release không có migration hoặc biến secret mới nên rollback không cần thao tác database, Supabase hoặc Zalo Mini App.
