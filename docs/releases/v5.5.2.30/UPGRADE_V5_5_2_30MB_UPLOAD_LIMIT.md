# Zalo IT HelpDesk v5.5.2 — Giới hạn upload 30 MB

## Mục tiêu

Điều chỉnh giới hạn từ 5 MB hoặc 100 MB về mức phù hợp hơn:

- Mỗi file được phép tối đa **30 MB**.
- File đúng 30 MB được chấp nhận.
- File lớn hơn 30 MB bị từ chối bằng HTTP 413.
- Mỗi phản hồi tối đa 4 file.
- Tổng file trong một phản hồi tối đa 120 MB.
- Ticket mới vẫn cho tối đa 8 file, upload tuần tự.
- Cả bước tạo ticket, phản hồi của người dùng và phản hồi của kỹ thuật viên đều dùng cùng giới hạn.

Upload vẫn sử dụng `multipart/form-data` và ghi streaming xuống ổ đĩa; không đưa file lớn vào JSON/Base64 trong RAM.

## Điều kiện

Cài v5.5 và v5.5.1 trước khi áp dụng bản này.

## Cài đặt

Dừng backend, sau đó giải nén patch vào thư mục cha của project:

```powershell
Expand-Archive `
  -Path "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_v5.5.2_30MB_Upload_Limit_Patch.zip" `
  -DestinationPath "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2" `
  -Force
```

Cập nhật `.env` tự động:

```powershell
cd "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2\zalo-helpdesk-ai"
.\scripts\windows\launchers\CONFIGURE_UPLOAD_LIMIT_30MB.bat
```

Script tạo backup `.env` trước khi thay đổi và thiết lập:

```env
MAX_ATTACHMENT_MB=30
MAX_REPLY_UPLOAD_MB=120
MAX_LEGACY_JSON_UPLOAD_MB=32
MAX_ATTACHMENTS_PER_REPLY=4
MAX_ATTACHMENTS_PER_TICKET=8
```

Không cần migration SQL Server mới.

## Kiểm tra backend

```powershell
cd ".\backend"
npm install
npm run check
node --test ".\test\large-multipart-v551.test.mjs"
npm start
```

Kiểm tra health:

```powershell
$health = Invoke-RestMethod "http://127.0.0.1:8080/health"
$health.version
$health.features
```

Kỳ vọng:

```text
5.5.2
30mb-attachment-limit
```

## Build và deploy Mini App

Bản này thay đổi cả màn hình tạo ticket và màn hình phản hồi nên cần deploy lại:

```powershell
cd "..\miniapp"
npm install
npm run build
zmp login
zmp deploy
```

Chọn thư mục `dist` và trạng thái `Testing` trong giai đoạn kiểm thử.

## Test bắt buộc

- File 5 MB: gửi thành công.
- File 29 MB: gửi thành công.
- File đúng 30 MB: gửi thành công.
- File 30 MB + 1 byte: bị chặn.
- 4 file, mỗi file 30 MB: tổng 120 MB, được chấp nhận nếu request hợp lệ.
- Tổng file lớn hơn 120 MB trong một phản hồi: bị chặn.
- Thử cả lúc tạo ticket và lúc gửi phản hồi sau khi ticket đã tồn tại.

## Lưu ý

Preview ảnh/PDF lớn vẫn cần tải dữ liệu về WebView để hiển thị nên tốc độ phụ thuộc mạng và thiết bị. File được lưu trong `backend/data/uploads`; cần theo dõi dung lượng và backup định kỳ.
