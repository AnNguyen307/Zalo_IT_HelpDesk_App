# v5.15.1 — Storage Retention

## Kết quả

Release này giới hạn dữ liệu ticket theo chính sách đã duyệt cho môi trường free tier:

- tối đa 30 ticket trên toàn hệ thống;
- khi tạo ticket mới ở ngưỡng 30, xóa ticket `resolved` hoặc `closed` cũ nhất;
- không bao giờ xóa ticket đang hoạt động;
- nếu cả 30 ticket đều đang hoạt động, từ chối ticket mới bằng HTTP `409` và code `TICKET_CAPACITY_REACHED`;
- tổng ảnh/file tối đa 10 MB cho mỗi ticket, cộng dồn qua upload trực tiếp và mọi phản hồi;
- đúng 10 MB được chấp nhận; vượt giới hạn bị từ chối bằng HTTP `413` và code `TICKET_ATTACHMENT_BUDGET_EXCEEDED`.

## Tính nhất quán và dọn file

Việc chọn/xóa ticket cũ và tạo ticket mới chạy trong cùng transaction state. Backend xóa message, attachment metadata, notification, history, Copilot run và audit liên quan của ticket bị loại.

File vật lý/private object không thể xóa trong transaction database. Vì vậy backend ghi một tác vụ GC bền vững vào Audit Log, commit state trước, rồi xóa file. Tác vụ còn dang dở được retry khi khởi động và sau lần retention tiếp theo. Sau khi hoàn tất, audit chỉ giữ số file/byte đã giải phóng và loại bỏ storage path.

Giới hạn 10 MB được kiểm tra lại trong transaction ghi cuối cùng, nên hai upload đồng thời không thể cùng vượt ngân sách dù đều qua preflight.

## Cấu hình

```env
MAX_STORED_TICKETS=30
MAX_TICKET_ATTACHMENT_MB=10
MAX_ATTACHMENT_MB=10
MAX_REPLY_UPLOAD_MB=10
```

Hai giới hạn retention được hard-cap ở 30 ticket và 10 MB/ticket. Có thể hạ thấp bằng env để thử nghiệm nhưng không thể vô tình tăng cao hơn chính sách phát hành.

## Tác động phát hành

- Backend/Admin/Mini App metadata đồng bộ `5.15.1`.
- Thiết kế UI vẫn là v5.14.1; chỉ copy và validation attachment được đồng bộ theo 10 MB/ticket.
- SQL Server giữ schema `9`; không có migration mới.
- PostgreSQL free-hosting giữ state schema `1`; không có migration mới.
- Cần deploy lại Mini App vì version, validation và `VITE_API_BASE_URL` nằm trong bundle.

## Rollback

Có thể rollback runtime về v5.15.0, nhưng rollback không khôi phục ticket/file đã bị retention xóa. v5.15.0 cũng không còn bảo vệ ngưỡng 30 ticket hoặc tổng 10 MB/ticket, nên phải giám sát quota nếu rollback.
