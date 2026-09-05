# IT HelpDesk v5.4 — Playbook Lifecycle Governance

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Mục tiêu

Cho phép kỹ thuật viên và quản trị viên liên tục cập nhật kiến thức doanh nghiệp mà không để AI học trực tiếp từ dữ liệu chưa được xác minh.

## Workflow bắt buộc

`Draft → Submitted → Admin Review → Published → Automatic Semantic Re-index`

- Kỹ thuật viên: tạo/sửa draft, tạo draft từ ticket, gửi duyệt.
- Quản trị viên: tạo/sửa, reject, publish, deprecate, reactivate và rollback.
- AI Agent: chỉ đọc procedure có `Published + Active`.
- Ticket, draft, rejected version và ghi chú nội bộ không được đưa vào RAG runtime.

## Thành phần mới

- SQL Server tables: `playbook_procedures`, `playbook_versions`, `playbook_events`, `playbook_index_state`.
- Version history bất biến và audit trail.
- Tạo draft từ ticket đã xử lý.
- Safety validation trước Publish.
- Automatic cache invalidation + Ollama semantic re-index sau Publish/Deprecate/Rollback.
- Admin Dashboard tab **Vòng đời Playbook**.
- Staff login cho Admin và Technician.
- Technician identity được ghi trong lịch sử phiên bản.
- Rollback tạo một phiên bản mới thay vì sửa lịch sử cũ.

## Chính sách an toàn

- Technician không được publish trực tiếp.
- Procedure `risk=high` không được auto-eligible.
- Procedure `audience=technician` không được auto-eligible.
- Procedure rủi ro cao phải có cảnh báo/thao tác cấm trước Publish.
- Procedure employee-safe có auto-eligible phải có câu hỏi khoanh vùng.
- AI tiếp tục Strict Escalation khi index đang cập nhật hoặc chưa có match đủ mạnh.
