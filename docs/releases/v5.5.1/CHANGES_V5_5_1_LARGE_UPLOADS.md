# Changes v5.5.1

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


- Nâng giới hạn mặc định lên dưới 100 MB/file.
- Thêm giới hạn tổng dưới 200 MB/phản hồi.
- Chuyển upload Mini App và Admin từ JSON/Base64 sang multipart/form-data.
- Stream file trực tiếp xuống ổ đĩa, không cần dependency upload mới.
- Giữ chế độ tương thích JSON/Base64 cho client cũ với giới hạn 32 MB/request.
- Thêm trạng thái health: `streaming-multipart-upload`, `large-attachments`.
- Không có migration SQL Server mới.
