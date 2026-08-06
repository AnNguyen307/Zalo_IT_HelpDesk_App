# Changes v5.5.1

- Nâng giới hạn mặc định lên dưới 100 MB/file.
- Thêm giới hạn tổng dưới 200 MB/phản hồi.
- Chuyển upload Mini App và Admin từ JSON/Base64 sang multipart/form-data.
- Stream file trực tiếp xuống ổ đĩa, không cần dependency upload mới.
- Giữ chế độ tương thích JSON/Base64 cho client cũ với giới hạn 32 MB/request.
- Thêm trạng thái health: `streaming-multipart-upload`, `large-attachments`.
- Không có migration SQL Server mới.
