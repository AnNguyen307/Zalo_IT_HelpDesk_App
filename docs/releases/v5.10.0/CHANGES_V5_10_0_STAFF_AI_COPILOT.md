# v5.10.0 — User Handoff và Staff AI Copilot

## Mục tiêu

Tách AI thành hai kênh có quyền hạn khác nhau:

- **AI Agent phía User** chỉ được phản hồi trực tiếp khi có Playbook phù hợp và đạt guardrail.
- **AI Copilot phía HelpDesk** chỉ tạo gợi ý nội bộ; không có quyền gửi tin nhắn hoặc đóng ticket.

## Luồng mới

1. Có Playbook phù hợp: AI hướng dẫn User và hiển thị hai lựa chọn **Tôi đã xử lý được** / **Tôi vẫn chưa xử lý được**.
2. User chọn chưa xử lý được, hoặc gửi một phản hồi rõ ràng như “vẫn chưa xử lý được”: ticket chuyển `waiting_user → open`, SLA tiếp tục và AI Agent bị khóa khỏi kênh User.
3. Không có Playbook phù hợp: ticket bàn giao ngay như trước và một Copilot run được xếp hàng nền.
4. Sau bàn giao, kỹ thuật viên xem tab **Copilot**, phân tích lại khi cần và có thể đưa bản nháp vào ô reply để duyệt thủ công.

## Cách Copilot phân biệt nguồn

- Bước gắn nhãn **Playbook** được backend ánh xạ lại nguyên văn từ procedure đã truy xuất.
- Nguyên nhân/gợi ý không có căn cứ Playbook được gắn nhãn **Giả thuyết AI**.
- Nếu toàn bộ cloud provider lỗi, Rules/Playbook tạo bản fallback nội bộ; ticket và hội thoại User vẫn hoạt động.
- Redaction chạy trước mọi request Copilot đến provider cloud.

## API

- `POST /api/tickets/:ticketId/request-human-help` — User bàn giao rõ ràng.
- `GET /api/staff/tickets/:ticketId/copilot` — Staff xem lịch sử Copilot.
- `POST /api/staff/tickets/:ticketId/copilot/runs` — Admin/Technician yêu cầu phân tích lại.

Nội dung Copilot không được đưa vào `publicTicket`, API Mini App hoặc messages của ticket.

## Database

Migration `008_staff_ai_copilot.sql` tạo `helpdesk.ai_copilot_runs` với suggestion, nguồn Playbook, confidence, telemetry, trạng thái và người yêu cầu. JSON store có collection `aiCopilotRuns` tương ứng.

## Rollback chức năng

Không cần gỡ migration. Có thể giữ Copilot ở Rules fallback bằng:

```env
AI_ROUTER_ENABLED=false
AI_PROVIDER=rules
AI_CLOUD_ENABLED=false
```

Khóa `human_only` vẫn được giữ nguyên và tiếp tục chặn AI Agent phản hồi User.
