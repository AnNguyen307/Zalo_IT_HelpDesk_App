# Zalo IT HelpDesk v5.7.4 — Admin Sidebar Clarity

## Thay đổi giao diện

- Badge ở mục `Yêu cầu` chỉ xuất hiện khi có ticket đang mở, đang xử lý hoặc chờ người dùng.
- Badge ở mục `Quy trình` chỉ xuất hiện khi có phiên bản Playbook đang chờ duyệt.
- Khi giá trị bằng `0`, badge được ẩn hoàn toàn thay vì hiển thị cảnh báo đỏ không cần thiết.
- Nhãn nhóm `TRÍ TUỆ HỆ THỐNG` được rút gọn thành `HỆ THỐNG`.
- Mục `Vòng đời` được đổi thành `Quy trình`; tiêu đề trang tương ứng là `Quy trình Playbook`.
- URL của CSS và JavaScript Admin có version mới để trình duyệt không dùng lại tài nguyên cũ trong cache.

Không có migration database và không cần phát hành lại Zalo Mini App. Pull mã nguồn, restart backend và xác nhận `/health` trả `5.7.4`.
