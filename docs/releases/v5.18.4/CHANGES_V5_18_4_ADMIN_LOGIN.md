# v5.18.4 — Admin Login Experience

## Kết quả

- Thay màn hình đăng nhập kiểu SaaS cũ bằng bố cục **Warm Industrial + Signal System** đồng nhất với Control Centre.
- Hero chỉ mô tả đúng ba năng lực vận hành: Ticket & SLA, Playbook và trạng thái hệ thống; loại bỏ ảnh minh họa chung chung.
- Form đăng nhập có icon rõ nghĩa, nút hiện/ẩn mật khẩu, trạng thái đang xác thực và thông báo lỗi dễ nhận biết.
- Trên tablet và điện thoại, form chuyển về một cột, giữ nhận diện HelpDesk và chiều cao theo `100dvh`.
- Không thay đổi API, quyền, session hoặc chính sách xác thực nhân sự.

## Accessibility và responsive

- Trường nhập liên kết với vùng lỗi bằng `aria-describedby`.
- Nút hiện/ẩn mật khẩu cập nhật `aria-pressed` và nhãn hành động.
- Nút đăng nhập cập nhật `aria-busy`, khóa gửi lặp và vẫn hỗ trợ submit bằng bàn phím.
- Trạng thái lỗi dùng `role="alert"` và `aria-live="assertive"`.
- Giữ cỡ chữ input 16 px trên điện thoại để tránh trình duyệt tự zoom.
- Tôn trọng `prefers-reduced-motion`.

## Kiểm thử hồi quy

- Khóa cấu trúc, thông tin chức năng và lớp CSS cuối của màn hình đăng nhập.
- Khóa breakpoint desktop, tablet, phone và trạng thái focus.
- Khóa hành vi hiện/ẩn mật khẩu, loading và lỗi xác thực.
- Chạy toàn bộ bộ kiểm thử Backend/Admin trước khi merge và deploy.

## Tác động triển khai

- Backend/Admin deployment: required.
- Mini App build/deployment: not required; Mini App remains v5.17.1.
- Database migration: not required.
- PostgreSQL state schema remains `1`.
- PostgreSQL Playbook Governance schema remains `1`.
- SQL Server schema remains `10`.

## Rollback

Deploy lại commit v5.18.3. Không cần rollback dữ liệu hoặc schema.
