# Hướng dẫn nâng cấp v5.3 — SQL Server

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Phạm vi

Bản vá này chỉ thay đổi backend database. Không chuyển backend thành Windows Service và không thay đổi ngrok.

## Trước khi bắt đầu

Cần có:

- Windows 10/11.
- Node.js 20 trở lên.
- SQL Server đang chạy.
- Một database, mặc định `ZaloHelpDesk`.
- Một SQL login riêng cho ứng dụng, hoặc tài khoản NTLM có user/password/domain.
- TCP/IP được bật nếu backend kết nối qua network protocol.

Không xóa `backend/data/db.json` sau khi import. Giữ file này làm rollback cho tới khi kiểm thử xong.

## 1. Sao lưu

Tắt backend rồi chạy tại thư mục project:

```powershell
cd "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2\zalo-helpdesk-ai"

Copy-Item ".\backend\data\db.json" `
  ".\backend\data\db-before-sqlserver-manual.json" `
  -Force

Copy-Item ".\backend\.env" `
  ".\backend\.env-before-sqlserver" `
  -Force
```

## 2. Áp dụng patch

```powershell
Expand-Archive `
  -Path "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_v5.3_SQL_Server_Patch.zip" `
  -DestinationPath "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2" `
  -Force
```

Patch không chứa và không ghi đè:

- `backend/.env`
- `backend/data/db.json`
- `backend/data/uploads`
- `miniapp/.env`

## 3. Chuẩn bị SQL Server

Nếu đã có database và login phù hợp, bỏ qua bước tạo mới.

Mở SQL Server Management Studio, xem file:

```text
backend/sql/000_create_database_template.sql
```

Thay password mẫu rồi chạy bằng tài khoản quản trị. File này tạo:

- Database `ZaloHelpDesk`.
- Login `zalo_helpdesk_app`.
- User trong database.
- Quyền đọc, ghi và quyền tạo schema ban đầu.

Không đưa password thật vào Git hoặc file ZIP gửi cho người khác.

## 4. Cấu hình và import tự động

Chạy:

```powershell
.\scripts\windows\launchers\CONFIGURE_SQL_SERVER.bat
```

Script sẽ hỏi:

- SQL Server login.
- Password.

Mặc định kết nối:

```text
Server: localhost
Port: 1433
Database: ZaloHelpDesk
Authentication: SQL login
```

Với SQL Express named instance, chạy trực tiếp:

```powershell
powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File ".\scripts\windows\configure-sqlserver.ps1" `
  -Server "localhost" `
  -Instance "SQLEXPRESS" `
  -Database "ZaloHelpDesk" `
  -Auth "sql" `
  -User "zalo_helpdesk_app"
```

Script thực hiện:

1. Sao lưu `.env`.
2. Sao lưu `db.json`.
3. Thêm cấu hình `DB_PROVIDER=sqlserver`.
4. Chạy `npm install`.
5. Chạy migration.
6. Kiểm tra kết nối.
7. Import `db.json` vào SQL Server.
8. So sánh số lượng record từng collection.

Nếu SQL Server đã có dữ liệu và bạn chủ động muốn thay thế bằng `db.json`, chạy thêm `-ForceImport`. Chỉ dùng sau khi đã backup SQL Server.

## 5. Thu hồi quyền migration

Sau khi schema đã tạo xong, mở và chạy:

```text
backend/sql/002_harden_app_user_template.sql
```

Điều chỉnh tên database/login nếu bạn dùng tên khác. Runtime chỉ cần quyền đọc và ghi dữ liệu; không nên giữ `db_ddladmin` lâu dài.

## 6. Khởi động backend

```powershell
cd ".\backend"
npm start
```

Log cần có:

```text
Database: sqlserver (ZaloHelpDesk)
```

## 7. Kiểm tra health

```powershell
$health = Invoke-RestMethod "http://127.0.0.1:8080/health"
$health.database | ConvertTo-Json -Depth 5
```

Kết quả cần gần giống:

```json
{
  "ready": true,
  "provider": "sqlserver",
  "database": "ZaloHelpDesk",
  "auth": "sql",
  "counts": {
    "users": 3,
    "tickets": 10,
    "messages": 25
  },
  "error": null
}
```

Tiếp tục kiểm tra:

- Đăng nhập Mini App.
- Danh sách ticket cũ vẫn đủ.
- Mở ticket và xem message/history/file attachment.
- Tạo ticket mới.
- Admin phản hồi và đổi trạng thái.
- Notification hoạt động.
- Restart backend rồi xác nhận dữ liệu mới vẫn còn.

Không cần deploy lại Mini App vì contract API không thay đổi.

## 8. Các lệnh database

```powershell
cd ".\backend"

npm run db:migrate
npm run db:status
npm run db:import-json
npm run db:import-json -- --force
npm run db:export-json
```

## 9. Backup

Script cũ đã được cập nhật:

```powershell
.\scripts\windows\backup-data.bat
```

Khi `DB_PROVIDER=sqlserver`, script export snapshot SQL Server ra JSON tạm thời rồi ZIP cùng thư mục uploads.

Đây là backup cấp ứng dụng. Với vận hành thật, vẫn cần cấu hình SQL Server full/differential/log backup bằng công cụ quản trị SQL Server.

## 10. Rollback về JSON

Dừng backend, sửa `.env`:

```env
DB_PROVIDER=json
DATA_FILE=./data/db.json
```

Khởi động lại backend. Vì quá trình import không sửa hoặc xóa `db.json`, hệ thống quay về dữ liệu JSON tại thời điểm trước migration.

Để đưa dữ liệu mới phát sinh trong SQL Server về JSON trước khi rollback:

```powershell
cd ".\backend"
npm run db:export-json -- ".\data\db-from-sqlserver.json"
```

Kiểm tra file rồi đổi `DATA_FILE` sang file export đó.

## 11. Lỗi thường gặp

### Failed to connect

Kiểm tra:

- SQL Server service đang chạy.
- TCP/IP đã bật.
- Port 1433 hoặc named instance đúng.
- Firewall cho phép kết nối.
- SQL Server authentication mode cho phép login đang dùng.

### Login failed for user

Kiểm tra login, password, database mapping và quyền database.

### Cannot open database requested by the login

Database chưa tồn tại hoặc user chưa được map vào database.

### SQL Server database is not empty

Importer mặc định không ghi đè dữ liệu hiện có. Dùng database trống hoặc backup rồi dùng `--force` có chủ đích.

### File attachment không tải được

SQL Server chỉ giữ metadata. Cần giữ nguyên thư mục:

```text
backend/data/uploads
```
