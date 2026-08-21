# v5.16.2 — Staff and Playbook governance UI

## Outcome

- Hiển thị tên tài khoản, vai trò và username hiện đang đăng nhập ở góc phải Admin header.
- Tổ chức lại vùng **Tài khoản HelpDesk** với bốn chỉ số dễ đọc, trạng thái tài khoản rõ ràng và nút **Chỉnh sửa** trung tính.
- Giữ tài khoản đã khóa ở độ tương phản đọc được thay vì làm mờ toàn bộ thẻ.
- Việt hóa và trình bày lại vòng đời Playbook bằng năm bước có màu tín hiệu theo ý nghĩa.
- Tách dải thống kê Quy trình thành component năm cột riêng, loại bỏ ô thứ sáu bị trống do kế thừa grid thống kê chung.
- Làm rõ trách nhiệm của Kỹ thuật viên, Quản trị viên và AI Agent; chỉ procedure đã phát hành và đang hoạt động mới được AI sử dụng.

## Scope and compatibility

- Chỉ thay đổi Admin HTML/CSS/JavaScript và metadata Backend.
- Không thay đổi endpoint, payload, quyền truy cập hay nghiệp vụ phê duyệt Playbook.
- Backend version: `5.16.2`.
- Mini App version: `5.16.0`; không cần build hoặc deploy lại Mini App.
- SQL Server schema: `10`; không có migration mới.
- PostgreSQL state schema: `1`; không thay đổi.

## Validation

- Chạy syntax check cho toàn bộ JavaScript/ES modules của Backend.
- Chạy toàn bộ Backend regression tests, gồm test mới cho danh tính header, thẻ tài khoản và dải Quy trình năm cột.
- Chạy `git diff --check` và quét diff để bảo đảm không có credential/secret.
- Duyệt trực quan trên PR trước khi merge và deploy Backend.

## Rollback

Rollback commit v5.16.2 sẽ trả Admin UI về v5.16.1. Không cần rollback database, dữ liệu tài khoản, mã mời, phiên thiết bị hoặc Playbook.
