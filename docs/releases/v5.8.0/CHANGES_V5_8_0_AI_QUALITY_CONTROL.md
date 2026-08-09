# Zalo IT HelpDesk v5.8.0 — AI Quality Control

## Mục tiêu

v5.8 chuyển AI từ một chức năng khó đo sang một control plane có decision record, telemetry, phản hồi Admin và provider routing rõ ràng. Ticket vẫn phải tạo được khi toàn bộ AI không khả dụng.

## Phạm vi

- AI Router thống nhất cho `rules`, `ollama` và `gemini`.
- Tương thích ngược với `AGENT_MODE=rules|ollama`.
- Gemini chỉ hoạt động khi đồng thời có `AI_PROVIDER=gemini`, `AI_CLOUD_ENABLED=true`, model và API key phía backend.
- Retrieval Top-K chạy trước; cloud chỉ nhận payload tối thiểu sau redaction.
- Redaction che credential, bearer token, email, số điện thoại và địa chỉ IP.
- Mỗi lần tạo hoặc phân tích lại ticket sinh một `decisionId` với provider, model, confidence, latency, outcome, escalation code, redaction count và token usage khi provider trả về.
- Audit Log giữ lịch sử decision record; `ticket.aiAnalysis.quality` giữ quyết định mới nhất.
- Admin đánh dấu **Đúng** hoặc **Cần sửa**; hiệu chỉnh category, priority và risk có thể áp dụng trực tiếp vào ticket, nhưng không tự mở lại AI hoặc thay đổi human handoff.
- Dashboard AI hiển thị review coverage, accuracy trên tập đã review, escalation rate, provider unavailable, latency, lỗi theo category và quyết định gần đây.

## Guardrail không thay đổi

- Priority ticket mới mặc định là `normal`.
- AI chỉ đổi priority khi `priorityDetermined=true` và giá trị hợp lệ.
- Không có Playbook phù hợp, confidence thấp, provider lỗi hoặc tình huống rủi ro cao đều chuyển kỹ thuật viên.
- AI không tự đóng ticket và không tự tạo bước kỹ thuật ngoài Enterprise Playbook.
- API key không bao giờ được gửi xuống Mini App hoặc Admin frontend.

## Cấu hình mặc định

```env
AI_PROVIDER=ollama
AI_CLOUD_ENABLED=false
AI_REDACTION_ENABLED=true
AI_QUALITY_RETENTION_DAYS=180
```

Cloud staging:

```env
AI_PROVIDER=gemini
AI_CLOUD_ENABLED=true
AI_REDACTION_ENABLED=true
GEMINI_API_KEY=server-side-only
GEMINI_MODEL=gemini-3.6-flash
```

Rollback:

```env
AI_PROVIDER=ollama
AI_CLOUD_ENABLED=false
```

## Endpoint pilot

- Endpoint ngrok cho đợt triển khai này: `https://7ae2-14-164-186-7.ngrok-free.app`.
- Mini App đã được build với endpoint trên. Vì `VITE_API_BASE_URL` được đóng gói ở build time, cần deploy lại Mini App sau khi phát hành v5.8.0.
- Lần kiểm tra ngày 2026-08-09 cho thấy endpoint vẫn đang phục vụ backend v5.7.4; cần restart backend từ mã v5.8.0 trước khi nghiệm thu.

## Nâng cấp

Không có migration database. JSON và SQL Server tiếp tục lưu `aiAnalysis` dưới dạng JSON; lịch sử telemetry dùng Audit Log hiện có.

1. Pull mã nguồn v5.8.0.
2. Giữ `AI_PROVIDER=ollama` hoặc `rules` cho production hiện tại.
3. Restart backend.
4. Xác nhận `/health` trả `version: 5.8.0` và provider mong muốn.
5. Mở Admin → AI Agent để kiểm tra dashboard; ticket cũ được ghi rõ là chưa có decision record v5.8.
6. Chỉ bật Gemini trong staging sau khi phê duyệt chính sách dữ liệu và retention.

## Kiểm thử

- `npm run check`
- `npm test`
- API integration kiểm tra tạo ticket, quality report, Admin review và áp dụng hiệu chỉnh.
- Unit test kiểm tra redaction không làm thay đổi payload gốc.

## Tham chiếu provider

- Gemini Generate Content API: https://ai.google.dev/api/generate-content
- Gemini API authentication: https://ai.google.dev/api
- Gemini Zero Data Retention: https://ai.google.dev/gemini-api/docs/zdr
