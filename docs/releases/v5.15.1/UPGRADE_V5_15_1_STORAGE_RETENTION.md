# Upgrade to v5.15.1

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Trước khi deploy

1. Backup database/state và attachment storage nếu môi trường đã có dữ liệu quan trọng.
2. Xác nhận việc xóa tự động ticket `resolved`/`closed` cũ nhất là phù hợp với chính sách lưu trữ.
3. Đặt các biến môi trường:

```env
MAX_STORED_TICKETS=30
MAX_TICKET_ATTACHMENT_MB=10
MAX_ATTACHMENT_MB=10
MAX_REPLY_UPLOAD_MB=10
```

4. Không chạy migration: SQL Server vẫn schema `9`, PostgreSQL vẫn state schema `1`.

## Thứ tự deploy

1. Deploy backend v5.15.1.
   Container tự chạy `npm run db:postgres:init && exec npm start` từ `backend/Dockerfile`; không đặt lại Docker Command trên Render.
   Image production yêu cầu Node.js 22 Alpine để Supabase SDK có native WebSocket.
2. Kiểm tra `/health` trả version `5.15.1`, `maxStoredTickets = 30` và `maxTicketAttachmentBytes = 10485760`.
3. Smoke test ticket, reply, upload và download trên backend.
4. Build/deploy Mini App v5.15.1 với `VITE_API_BASE_URL` của backend vừa xác nhận.
5. Kiểm tra luồng đăng nhập Zalo và tạo ticket trên thiết bị thật.

## Kiểm thử retention

- Upload tổng đúng 10 MB vào một ticket phải thành công.
- Byte tiếp theo phải trả `TICKET_ATTACHMENT_BUDGET_EXCEEDED`.
- Với 30 ticket và có ticket hoàn tất, tạo ticket mới phải giữ tổng 30 và xóa ticket hoàn tất cũ nhất.
- Với 30 ticket đều hoạt động, tạo ticket mới phải trả `TICKET_CAPACITY_REACHED` và giữ nguyên dữ liệu.
- Sau eviction, attachment của ticket cũ phải biến mất khỏi private storage; nếu storage tạm lỗi, restart phải retry GC.

## Cảnh báo vận hành

Retention là hành vi xóa dữ liệu thật. Không có soft-delete hay tự động khôi phục. Backup là cách phục hồi duy nhất cho ticket/file đã bị loại.

Rollback về v5.15.0 chỉ đổi runtime; nó không phục hồi dữ liệu đã xóa và bỏ các giới hạn mới.
