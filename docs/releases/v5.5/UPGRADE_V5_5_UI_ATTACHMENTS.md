# Nâng cấp v5.5 — Giao diện cân bằng, xem trước file và đính kèm trong phản hồi

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Mục tiêu

Bản v5.5 xử lý ba vấn đề thực tế:

1. Cỡ chữ giữa các vùng giao diện không đồng đều, đặc biệt trên Zalo Mini App/iOS WebView và Ticket Workspace của Admin.
2. Người dùng và kỹ thuật viên phải tải file xuống mới xem được.
3. Sau khi ticket đã được tạo, ô phản hồi chưa cho chọn ảnh/file cùng với nội dung phản hồi.

## Chức năng mới

- Chuẩn hóa typography trên Mini App và Admin Dashboard.
- Chặn iOS WebView tự phóng đại riêng phần nội dung hội thoại bằng `text-size-adjust: 100%` và đặt cỡ chữ rõ ràng theo từng cấp.
- Xem trước có xác thực đối với JPEG, PNG, WebP, GIF, PDF, TXT và CSV.
- DOC/DOCX/XLS/XLSX/PPT/PPTX/ZIP chỉ cho tải xuống vì trình duyệt không thể xem an toàn nếu không dùng dịch vụ chuyển đổi bên ngoài.
- Modal xem trước ngay trong Mini App và Admin Dashboard.
- Ô phản hồi mới có nút chọn ảnh/file, danh sách file chờ gửi, xóa file trước khi gửi và hỗ trợ phản hồi chỉ có file.
- File được liên kết với đúng `message_id`, vì vậy nó hiển thị ngay dưới phản hồi tương ứng.
- Mỗi phản hồi tối đa 4 file, 5 MB/file; tổng số file của ticket vẫn theo `MAX_ATTACHMENTS_PER_TICKET`.
- Endpoint preview yêu cầu token, không đưa token vào URL, đặt `Content-Disposition: inline`, `Cache-Control: private, no-store`, CSP sandbox và `X-Content-Type-Options: nosniff`.
- Siết kiểm tra đường dẫn file bằng `path.relative` để chặn path traversal.

> Lưu ý: qwen3.5:9b hiện chỉ nhận metadata của file trong luồng này. AI không tự đọc nội dung ảnh. Ảnh/file được cung cấp để người dùng và kỹ thuật viên xem trực tiếp, không được quảng bá là AI Vision.

---

## 1. Điều kiện trước khi nâng cấp

Backend v5.4 phải đang có:

```text
Database: sqlserver (ZaloHelpDesk)
AI Agent ready
Playbook Governance ready
Enterprise Playbook ready
```

Kiểm tra:

```powershell
$health = Invoke-RestMethod "http://127.0.0.1:8080/health"
$health.database.ready
$health.agent.ready
$health.playbookGovernance.ready
$health.playbook.ready
```

Tất cả phải là `True`.

---

## 2. Sao lưu

Dừng backend bằng `Ctrl + C`.

Trong SSMS:

```sql
BACKUP DATABASE ZaloHelpDesk
TO DISK = N'C:\SQLBackup\ZaloHelpDesk-before-v5.5.bak'
WITH INIT, COMPRESSION, CHECKSUM, STATS = 10;
GO
```

Sao lưu mã nguồn và uploads:

```powershell
cd "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2\zalo-helpdesk-ai"

Copy-Item ".\backend\.env" ".\backend\.env-before-v5.5" -Force
Copy-Item ".\backend\data\uploads" ".\backend\data\uploads-before-v5.5" -Recurse -Force -ErrorAction SilentlyContinue
```

Không gửi các bản backup này cho người khác vì có thể chứa secret và dữ liệu người dùng.

---

## 3. Giải nén patch

```powershell
Expand-Archive `
  -Path "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_v5.5_UI_Attachment_Preview_Patch.zip" `
  -DestinationPath "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2" `
  -Force
```

Patch không chứa `.env`, database, uploads hoặc model Ollama.

---

## 4. Cập nhật SQL Server

Application login có thể đã bị thu hồi `db_ddladmin`, vì vậy nên chạy migration bằng tài khoản quản trị trong SSMS.

Mở và Execute toàn bộ file:

```text
backend\sql\005_reply_attachments_preview.sql
```

File đã có:

```sql
USE ZaloHelpDesk;
GO
```

Kiểm tra:

```sql
USE ZaloHelpDesk;
GO

SELECT COL_LENGTH(N'helpdesk.attachments', N'message_id') AS MessageIdColumn;

SELECT version_number, description, applied_at
FROM helpdesk.schema_version
WHERE version_number = 5;

SELECT name
FROM sys.indexes
WHERE object_id = OBJECT_ID(N'helpdesk.attachments')
  AND name = N'IX_helpdesk_attachments_message_created';
```

Kết quả yêu cầu:

- `MessageIdColumn` khác `NULL`.
- Có schema version `5`.
- Có index `IX_helpdesk_attachments_message_created`.

Không xóa dữ liệu file cũ. Các attachment cũ có `message_id = NULL` và vẫn hoạt động.

---

## 5. Cấu hình tùy chọn

Trong `backend\.env` có thể thêm:

```env
MAX_ATTACHMENTS_PER_REPLY=4
```

Không tạo key trùng. Nếu không thêm, mặc định là 4.

---

## 6. Kiểm tra backend

```powershell
cd "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2\zalo-helpdesk-ai\backend"

npm install
npm run check
npm test
npm start
```

Log cần có:

```text
Database: sqlserver (ZaloHelpDesk)
AI Agent ready
Playbook Governance ready
Enterprise Playbook ready
```

Kiểm tra phiên bản và feature:

```powershell
$health = Invoke-RestMethod "http://127.0.0.1:8080/health"
$health.version
$health.features
```

Kỳ vọng:

```text
5.5.0
secure-attachment-preview
reply-attachments
responsive-typography
```

---

## 7. Cập nhật Admin Dashboard

Admin Dashboard được backend phục vụ trực tiếp. Sau khi restart backend:

```text
http://localhost:8080/admin
```

Nhấn `Ctrl + F5` để xóa cache CSS/JS cũ.

Kiểm tra:

- Chữ trong mô tả, quyết định AI, hội thoại, file và lịch sử dễ đọc hơn.
- Mỗi file có thao tác xem trước và tải xuống riêng.
- Ô phản hồi có nút đính kèm.
- Có thể gửi nội dung + file hoặc chỉ gửi file.
- File xuất hiện dưới đúng tin nhắn vừa gửi.

---

## 8. Build và deploy Mini App

```powershell
cd "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2\zalo-helpdesk-ai\miniapp"

npm install
npm run build
zmp login
zmp deploy
```

Chọn phiên bản `Testing` trong giai đoạn kiểm thử.

Bản v5.5 thay đổi Mini App, vì vậy bắt buộc build và deploy lại. Chỉ restart backend là chưa đủ.

---

## 9. Test bắt buộc

### Test A — Typography trên iPhone/Zalo WebView

- Nội dung phản hồi không được tự phóng đại hơn phần UI xung quanh.
- Nội dung hội thoại khoảng 14 px, metadata khoảng 10–12 px.
- Tiêu đề, button và bottom navigation vẫn dễ đọc.

### Test B — Preview ảnh

- Upload PNG/JPG.
- Chạm `Xem trước`.
- Ảnh mở trong modal, không tải xuống tự động.
- Đóng modal và tải xuống vẫn hoạt động.

### Test C — Preview PDF/TXT/CSV

- PDF mở trong viewer của WebView khi nền tảng hỗ trợ; luôn có nút tải xuống dự phòng.
- TXT/CSV hiển thị dạng text an toàn.

### Test D — File không hỗ trợ preview

- DOCX/XLSX/PPTX/ZIP không chạy trong trang.
- UI ghi `Chỉ tải xuống`.
- Không có preview HTML, SVG hoặc executable.

### Test E — Gửi phản hồi kèm ảnh

- Chọn 1–4 ảnh trong ô phản hồi.
- Nhập nội dung và gửi.
- File xuất hiện dưới đúng tin nhắn.
- Admin nhận thông báo và xem trước được.

### Test F — Gửi chỉ có file

- Không nhập text.
- Chọn ảnh/file và gửi.
- Backend chấp nhận và tạo message mô tả số file.

### Test G — Kiểm tra SQL

```sql
SELECT TOP (20)
    a.id,
    a.ticket_id,
    a.message_id,
    a.file_name,
    a.mime_type,
    a.created_at
FROM helpdesk.attachments AS a
ORDER BY a.created_at DESC;
```

Attachment gửi từ composer phải có `message_id` khác `NULL`.

### Test H — Phân quyền preview

- User A không được xem file của ticket User B.
- Không có token phải nhận 401.
- File không hỗ trợ preview phải nhận 415 khi gọi `?preview=1`.

---

## 10. Giới hạn thiết kế

- Không dùng Google Docs Viewer hoặc Microsoft Online Viewer vì sẽ phải gửi file nội bộ ra dịch vụ bên ngoài.
- Không render DOCX/XLSX/PPTX bằng HTML tự tạo vì tăng rủi ro script, macro và sai định dạng.
- Không phân tích nội dung ảnh bằng OCR/AI trong bản này.
- Dữ liệu binary vẫn lưu trong `backend/data/uploads`; SQL Server lưu metadata và quan hệ message.
