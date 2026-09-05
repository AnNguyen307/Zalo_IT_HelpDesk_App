# Zalo IT HelpDesk v5.7.1 — Staff Account Reliability

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Sửa lỗi

- Lỗi tạo tài khoản trùng tên đăng nhập hiện trực tiếp trong dialog thay vì bị che và chỉ thấy ở terminal backend.
- Toast dùng chung được đưa vào dialog đang mở, nên lỗi ở các màn hình modal cũ cũng không còn bị lớp backdrop che khuất.
- API trả `409 STAFF_USERNAME_EXISTS` kèm `field: username`; cả kiểm tra ứng dụng và xung đột unique key từ SQL Server đều được chuẩn hóa.
- Switch trạng thái tài khoản hỗ trợ chuột và bàn phím, hiển thị rõ `Đang hoạt động` hoặc `Đã khóa`.
- Trạng thái `active: true/false` được gửi, kiểm tra kiểu và lưu ngay trong thao tác tạo tài khoản.
- Form giữ nguyên dữ liệu khi lỗi, focus trường sai và khóa nút lưu trong lúc request đang chạy để tránh gửi lặp.

## Kiểm thử hồi quy

- Tên đăng nhập trùng sau chuẩn hóa.
- Xung đột unique key SQL Server do race condition.
- Tạo tài khoản hoạt động, bị khóa và trạng thái mặc định.
- Sai kiểu trạng thái, vai trò không hợp lệ, mật khẩu yếu và lỗi backend ngoài dự kiến.
- Cấu trúc dialog bảo đảm có vùng lỗi live và switch trạng thái rõ ràng.

## Nâng cấp

Không có migration database và không cần phát hành lại Zalo Mini App. Pull mã nguồn, chạy `npm install`, restart backend và xác nhận `/health` trả `5.7.1`.
