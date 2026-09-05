# Nâng cấp v5.4 — Quản trị vòng đời Playbook

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Điều kiện tiên quyết

1. v5.3 SQL Server đã migration và import dữ liệu thành công.
2. `/health` có `database.provider = sqlserver` và `database.ready = true`.
3. Ollama đang có `qwen3.5:9b` và `embeddinggemma`.
4. Đã sao lưu `backend/.env`, database SQL Server và `backend/data/uploads`.

Không tiếp tục nếu v5.3 vẫn đang lỗi `CREATE SCHEMA`.

## 1. Giải nén patch

```powershell
cd "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2\zalo-helpdesk-ai"

Expand-Archive `
  -Path "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_v5.4_Playbook_Lifecycle_Patch.zip" `
  -DestinationPath "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2" `
  -Force
```

Patch không ghi đè `.env`, ticket, attachments hoặc semantic index hiện tại.

## 2. Thêm cấu hình staff và governance

Thêm vào `backend/.env` bằng một editor văn bản. Không dùng script cũ từng làm `.env` phình lớn.

```env
TECHNICIAN_PASSWORD=CHANGE_TO_A_STRONG_PASSWORD
PLAYBOOK_GOVERNANCE_ENABLED=true
PLAYBOOK_GOVERNANCE_CACHE_MS=5000
PLAYBOOK_AUTO_REINDEX_ON_PUBLISH=true
```

Dùng password khác `ADMIN_PASSWORD`.

## 3. Tạo bảng SQL Server

### Cách A — Application login vẫn có quyền migration

```powershell
cd .\backend
npm install
npm run db:migrate
```

### Cách B — Đã thu hồi `db_ddladmin` (khuyến nghị production)

Mở SQL Server Management Studio bằng tài khoản quản trị:

1. Chọn đúng database `ZaloHelpDesk` trong database dropdown.
2. Mở `backend\sql\004_playbook_lifecycle.sql`.
3. Execute toàn bộ file.
4. Không cấp lại `db_ddladmin` lâu dài cho `zalo_helpdesk_app`.

Kiểm tra:

```sql
SELECT name FROM sys.tables
WHERE schema_id = SCHEMA_ID(N'helpdesk')
  AND name LIKE N'playbook_%'
ORDER BY name;
```

Phải có:

- `playbook_procedures`
- `playbook_versions`
- `playbook_events`
- `playbook_index_state`

## 4. Nhập 173 procedure baseline

```powershell
cd "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2\zalo-helpdesk-ai\backend"
npm run playbook:seed-governance
```

Script bỏ qua mã đã tồn tại nên có thể chạy lại.

## 5. Re-index lần đầu

Đảm bảo Ollama API hoạt động:

```powershell
Invoke-RestMethod "http://127.0.0.1:11434/api/tags"
```

Sau đó:

```powershell
npm run playbook:index:force
```

## 6. Restart backend

```powershell
npm start
```

Log mong muốn:

```text
Database: sqlserver (ZaloHelpDesk)
Playbook Governance ready: 173 published; 0 awaiting review
Enterprise Playbook ready: 173 entries
```

## 7. Kiểm tra health

```powershell
$health = Invoke-RestMethod "http://127.0.0.1:8080/health"
$health.playbookGovernance | ConvertTo-Json -Depth 10
$health.playbook | ConvertTo-Json -Depth 10
```

Governance cần `ready=true`, `published > 0`. Playbook cần `source=sqlserver-governance`, `ready=true` và `indexCurrent=true`.

## 8. Đăng nhập Dashboard

Mở `/admin`.

- Admin: dùng `ADMIN_PASSWORD`.
- Technician: nhập tên nhân sự và dùng `TECHNICIAN_PASSWORD`.

Tên kỹ thuật viên được lưu trong audit trail. Password kỹ thuật viên dùng chung chỉ là phương án nội bộ hiện tại; v5.5 nên chuyển sang tài khoản RBAC riêng.

## 9. Workflow sử dụng

### Kỹ thuật viên

1. Mở ticket đã xử lý.
2. Chọn **Tạo đề xuất Playbook từ ticket**.
3. Xóa dữ liệu cá nhân/secret và chuẩn hóa nội dung.
4. Bổ sung câu hỏi, bước xử lý, điểm dừng và từ khóa.
5. Lưu Draft rồi **Gửi duyệt**.

### Quản trị viên

1. Vào **Vòng đời Playbook**.
2. Lọc `Chờ duyệt`.
3. Kiểm tra audience, risk, auto-eligible, source và thao tác cấm.
4. Reject kèm lý do hoặc **Duyệt & Publish**.
5. Sau Publish, hệ thống tự queue semantic re-index.

## 10. Tiêu chí nghiệm thu

- Draft không xuất hiện trong `/api/admin/playbook/search`.
- Submitted không được AI sử dụng.
- Published + Active xuất hiện sau cache refresh/re-index.
- Technician gọi API Publish nhận 403.
- High-risk không thể auto-eligible.
- Deprecate làm procedure biến mất khỏi runtime RAG.
- Rollback tạo version mới và giữ nguyên version history.
- `playbook_events` ghi actor, action và timestamp.
- Ticket tạo draft không tự động publish.

## Rollback patch

Code có thể rollback bằng bản backup project. Dữ liệu SQL mới không ảnh hưởng bảng ticket. Nếu cần tắt governance mà chưa xóa dữ liệu:

```env
PLAYBOOK_GOVERNANCE_ENABLED=false
```

Backend sẽ quay về đọc `backend/playbooks/enterprise-playbook.json`.


## Trạng thái kiểm thử của patch

- 14/14 unit test đã vượt qua.
- Toàn bộ file Node.js và JavaScript Admin đã vượt qua syntax check.
- Patch không chứa `.env`, database thật, uploads hoặc credential.
- Chưa kiểm thử tích hợp trên SQL Server của doanh nghiệp vì không có quyền truy cập instance; cần chạy migration, seed, re-index và smoke test tại máy triển khai.
