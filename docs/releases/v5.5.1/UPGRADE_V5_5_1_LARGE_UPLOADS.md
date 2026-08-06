# Zalo IT HelpDesk v5.5.1 – Large Attachment Streaming

## Mục tiêu

Nâng giới hạn từ 5 MB lên **nhỏ hơn 100 MB/file** mà không chuyển file lớn thành Base64 trong RAM.

## Thay đổi kỹ thuật

- Mini App và Admin gửi file bằng `multipart/form-data`.
- Backend dùng bộ phân tích multipart streaming tích hợp và ghi trực tiếp xuống `backend/data/uploads`.
- Mỗi file phải nhỏ hơn 100 MB.
- Mỗi phản hồi tối đa 4 file.
- Tổng file trong một phản hồi phải nhỏ hơn 200 MB.
- JSON/Base64 chỉ còn là chế độ tương thích cho client v5.5 cũ, giới hạn request 32 MB.
- Không thay đổi schema SQL Server.

## Cài đặt

1. Dừng backend.
2. Giải nén patch vào thư mục cha chứa `zalo-helpdesk-ai`.
3. Trong `backend/.env`, thêm hoặc cập nhật:

```env
MAX_ATTACHMENT_MB=100
MAX_REPLY_UPLOAD_MB=200
MAX_LEGACY_JSON_UPLOAD_MB=32
MAX_ATTACHMENTS_PER_REPLY=4
MAX_ATTACHMENTS_PER_TICKET=8
```

4. Cài dependency và kiểm tra:

```powershell
cd "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2\zalo-helpdesk-ai\backend"
npm install
npm run check
npm start
```

5. Build và deploy lại Mini App:

```powershell
cd "..\miniapp"
npm install
npm run build
zmp login
zmp deploy
```

6. Mở Admin và nhấn `Ctrl + F5`.

## Kiểm thử

- Ảnh 6–20 MB: phải gửi thành công.
- Ảnh 99 MB: phải gửi thành công nếu tổng phản hồi dưới 200 MB.
- File từ 100 MB trở lên: phải nhận HTTP 413.
- Hai file 99 MB: phải gửi được.
- Ba file 70 MB: phải bị chặn vì tổng đạt/vượt 200 MB.
- Ngắt mạng giữa lúc upload: file `.uploading` không được giữ lại.
- Attachment thành công vẫn có `message_id` khi gửi trong phản hồi.

## Lưu ý vận hành

100 MB/file làm dung lượng `uploads` tăng nhanh. Cần theo dõi ổ đĩa và backup thư mục `backend/data/uploads`. Preview ảnh lớn trên điện thoại vẫn cần tải dữ liệu về WebView nên có thể chậm trên mạng yếu.
