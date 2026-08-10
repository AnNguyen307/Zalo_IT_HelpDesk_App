# v5.13.0 — Provider quota observability và sửa false zero

## Vấn đề

V5.12.0 dùng `Number(headers.get(name))` để đọc quota header. Khi provider không gửi header, Fetch trả `null` nhưng `Number(null)` bằng `0`. Sau một request Gemini thành công, router có thể ghi sai quota còn lại là `0`, rồi đánh dấu Gemini `daily_budget_exhausted` dù Google chưa hề báo hết RPM, TPM, RPD hoặc TPD.

## Thay đổi

- Header vắng mặt hoặc rỗng được chuẩn hóa thành `unknown`; chỉ chuỗi số thật mới được nhận là quota.
- Gemini không còn bị vô hiệu hóa sau response thành công chỉ vì response không có rate-limit header.
- Quota provider được gắn rõ chu kỳ `day`, `minute` hoặc `provider-defined`; không dùng TPM như TPD.
- Response header được thu thập cả khi request thành công và khi provider trả lỗi như `429`.
- Model options nội bộ cho Helpdesk có thêm `reasonCode`, quota đã làm sạch, circuit, lỗi gần nhất, HTTP status và lần thành công gần nhất.
- Admin → AI Agent có bảng readiness/quota cho từng provider.
- Dropdown Copilot hiển thị lý do provider tạm khóa và số token/quota khả dụng khi có dữ liệu.
- API key không xuất hiện trong response; nếu provider vô tình lặp key trong lỗi, backend thay bằng `<REDACTED>` trước khi lưu trạng thái runtime.

## Ý nghĩa các số liệu

- **Token đã dùng**: tổng `usageMetadata.totalTokenCount` hoặc `usage.total_tokens` mà tiến trình backend hiện tại quan sát trong ngày UTC.
- **Ngân sách app còn lại**: giới hạn `*_DAILY_REQUEST_LIMIT` / `*_DAILY_TOKEN_LIMIT` trừ usage tiến trình hiện tại.
- **Provider báo**: counter lấy trực tiếp từ response header và luôn kèm chu kỳ.
- **Không xác định**: provider không cung cấp counter còn lại qua API. Đây không phải quota bằng `0`.

Gemini cung cấp token đã dùng trong `usageMetadata`. Quota project thực tế thay đổi theo model/tier và được kiểm tra trong Google AI Studio; Helpdesk không giả lập một con số còn lại khi Google không trả counter đó.

## Database và Mini App

Không có migration mới; schema SQL Server vẫn là version `9`. Mini App không đổi hành vi người dùng; version package được đồng bộ với release.
