# Zalo IT HelpDesk v5.7 — Operations

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


v5.7 chuyển HelpDesk từ tài khoản dùng chung và SLA 24/7 sang mô hình vận hành có danh tính, phân quyền, lịch làm việc và báo cáo.

## Tài khoản và phân quyền

- Tài khoản riêng cho từng nhân sự, mật khẩu băm bằng `scrypt` kèm salt ngẫu nhiên.
- Ba vai trò: `admin`, `technician`, `viewer`.
- Khóa/mở tài khoản, đặt lại mật khẩu và tăng `sessionVersion` để vô hiệu hóa phiên cũ.
- Không cho tài khoản Admin tự khóa/hạ quyền hoặc loại bỏ Admin hoạt động cuối cùng.
- Phân công ticket bằng `assignedToId`; `assignedTo` cũ vẫn được giữ để tương thích dữ liệu và lịch sử.
- Viewer được xem ticket, báo cáo, Knowledge Base và Playbook nhưng không thể phản hồi, tải file lên, điều phối hay thay đổi nội dung.

## SLA theo giờ làm việc

- Mặc định: Thứ hai–Thứ sáu, 08:00–17:30, múi giờ `Asia/Ho_Chi_Minh`.
- Có thể cấu hình ngày làm việc, khung giờ và ngày nghỉ trong `.env`.
- Tự tạm dừng khi ticket chuyển sang `waiting_user`.
- Tự tiếp tục khi Client phản hồi hoặc trạng thái rời `waiting_user`.
- Lưu đầy đủ từng lần pause/resume trong `sla.pauseEvents`.
- Theo dõi mốc 70%, 90% và quá hạn cho phản hồi đầu tiên lẫn thời gian xử lý.
- Client thấy trạng thái ngắn gọn `Tạm dừng / Chờ bạn`; thời gian chờ không được tính vào báo cáo xử lý.

## Hàng đợi thông minh

- Tất cả.
- Của tôi.
- Chưa phân công.
- Sắp quá SLA.
- Quá SLA.
- Client vừa trả lời.
- Chờ Client.
- Mở lại.

Các bộ đếm được tính tại backend để cùng một quy tắc được dùng cho mọi Admin/Technician.

## Dashboard và báo cáo

- Thời gian phản hồi đầu tiên trung bình theo phút làm việc.
- Thời gian xử lý trung bình, không tính khoảng chờ Client.
- Tỷ lệ đạt SLA, mở lại, CSAT và tỷ lệ ticket hoàn tất có đánh giá.
- Phân bổ theo danh mục, phòng ban và kỹ thuật viên.
- Xu hướng tạo mới/hoàn tất trong 14 ngày gần nhất.
- Xuất báo cáo ticket UTF-8 CSV theo khoảng 7, 30, 90 hoặc 365 ngày.

## Storage và API

- JSON store tự thêm collection `staffAccounts` khi đọc dữ liệu cũ.
- SQL migration `007_staff_operations_sla.sql` tạo `helpdesk.staff_accounts` và thêm `tickets.assigned_to_id`.
- API mới: `/api/admin/staff`, `/api/staff/directory`, `/api/admin/operations`, `/api/admin/reports/tickets.csv`.
- `/api/tickets?queue=...` trả danh sách và `queueCounts` theo session hiện tại.

## Kiểm thử

- Test lịch cuối tuần, pause/resume và idempotency của SLA.
- Test hash/verify mật khẩu, chuẩn hóa username và không lộ password hash.
- Test smart queue, operations report và CSV UTF-8.
- Kiểm thử tích hợp xác nhận Viewer nhận `403` khi sửa ticket hoặc quản lý nhân sự.
