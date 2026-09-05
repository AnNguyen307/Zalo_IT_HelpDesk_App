# Zalo IT HelpDesk v5.3 — SQL Server Database

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Mục tiêu

Chuyển dữ liệu vận hành khỏi `backend/data/db.json` sang Microsoft SQL Server, trong khi giữ nguyên API, Zalo Mini App, Admin Dashboard, Ollama, Enterprise Playbook RAG, ngrok và file upload hiện tại.

## Thành phần mới

- SQL Server adapter dùng package `mssql`.
- Schema `helpdesk` gồm 8 bảng nghiệp vụ đã chuẩn hóa.
- Transaction mức `SERIALIZABLE` cho các mutation hiện tại.
- Connection pool và graceful shutdown.
- Migration T-SQL idempotent.
- Import dữ liệu từ `db.json` và kiểm tra số lượng bản ghi.
- Export SQL Server về JSON để backup/rollback.
- `/health` có thêm trạng thái `database`.
- Chặn backend đọc file `.env` lớn bất thường trên 1 MiB.
- Script cấu hình SQL Server dành cho Windows.
- Backup script tự nhận biết JSON hay SQL Server.

## Bảng dữ liệu

- `helpdesk.users`
- `helpdesk.tickets`
- `helpdesk.messages`
- `helpdesk.attachments`
- `helpdesk.notifications`
- `helpdesk.ticket_history`
- `helpdesk.knowledge_base`
- `helpdesk.audit_log`
- `helpdesk.schema_version`

Các object phức tạp như AI analysis, SLA, satisfaction, keywords, KB steps và audit detail được lưu dưới dạng JSON hợp lệ trong cột `nvarchar(max)`. Các trường thường lọc/sắp xếp vẫn được lưu thành cột quan hệ và có index.

## Không thay đổi trong v5.3

- File nhị phân đính kèm vẫn nằm trong `backend/data/uploads`; SQL Server chỉ lưu metadata.
- Semantic index Playbook vẫn nằm trong `backend/data/playbook-index.json`.
- Chưa chạy backend như Windows Service.
- Chưa thay ngrok bằng hostname cố định.
- Chưa đổi frontend API contract.

## Giới hạn chuyển tiếp

Để bảo toàn hành vi v5.2 và giảm rủi ro, storage adapter hiện dựng snapshot tương thích với cấu trúc cũ cho mỗi request, rồi chỉ ghi các record thay đổi vào SQL Server trong transaction. Điều này loại bỏ rủi ro ghi đè cả file JSON và cho phép SQL Server trở thành nguồn dữ liệu chính, nhưng một giai đoạn tối ưu tiếp theo vẫn nên thay `readDb()` bằng repository/query chuyên biệt khi lượng ticket tăng rất lớn.
