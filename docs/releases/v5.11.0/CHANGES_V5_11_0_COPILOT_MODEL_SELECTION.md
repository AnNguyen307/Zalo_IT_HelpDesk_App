# v5.11.0 — Helpdesk chọn model cho AI Copilot

## Thay đổi

- Tab Copilot có dropdown **Model hỗ trợ lần phân tích tiếp theo**.
- Tùy chọn mặc định **Tự động** giữ route/failover cloud hiện hành.
- Helpdesk có thể chọn chính xác Gemini, Groq, OpenRouter hoặc SambaNova đã được Admin bật và cấu hình.
- Model cụ thể chỉ gọi đúng provider đã chọn; nếu lỗi, Copilot dùng Rules/Playbook an toàn thay vì âm thầm đổi sang cloud model khác.
- Mỗi Copilot run lưu model/provider được yêu cầu và model/provider thực tế để audit.
- Backend từ chối provider lạ, provider ngoài route và provider chưa cấu hình.
- API key không được gửi xuống trình duyệt; frontend chỉ nhận model ID và trạng thái sẵn sàng.

## Database

Migration `009_copilot_model_selection.sql` thêm:

- `requested_provider_key`
- `requested_model`

Schema version mới: `9`.

## API

`GET /api/staff/tickets/:ticketId/copilot` trả thêm `modelOptions`.

`POST /api/staff/tickets/:ticketId/copilot/runs` nhận:

```json
{ "providerKey": "auto" }
```

Giá trị hợp lệ: `auto`, `gemini`, `groq`, `openrouter`, `sambanova`, với điều kiện provider nằm trong route server và đã được cấu hình.
