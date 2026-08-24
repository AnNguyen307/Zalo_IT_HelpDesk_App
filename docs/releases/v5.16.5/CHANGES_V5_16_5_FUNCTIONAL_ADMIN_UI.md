# v5.16.5 — Functional Admin UI

## Kết quả

Admin dùng tiêu đề và mô tả ngắn để giải thích trực tiếp chức năng của từng tab. Banner Tổng quan hiển thị một bàn điều phối HelpDesk thay cho đồ họa quỹ đạo trừu tượng.

## Thay đổi chính

- Thêm minh họa `helpdesk-operations-v5165.webp` kích thước 1.200 × 800, dung lượng dưới 100 KB.
- Tạo chuyển động pan/zoom và scan nhẹ bằng CSS thay vì đóng gói GIF nặng.
- Giữ ảnh hiển thị trên điện thoại; tự tắt chuyển động khi thiết bị bật `prefers-reduced-motion`.
- Đổi banner Tổng quan thành `Hoạt động HelpDesk` với mô tả trạng thái AI Agent, Playbook và SLA.
- Rút gọn nội dung tại Đăng nhập, Tổng quan, Báo cáo, Nhân sự, Kiến thức, Quy trình, Playbook, Hệ thống & AI và các dialog quản trị.
- Bổ sung regression test ngăn các slogan cũ quay lại và kiểm tra tài sản ảnh, cache busting, responsive motion.

## An toàn và tương thích

- Không đổi API, nghiệp vụ ticket, Playbook, AI Router hoặc xác thực.
- Không thêm biến môi trường hoặc secret.
- Backend/Admin: `5.16.5`; Mini App: `5.16.0`.
- SQL Server/NAS schema `10`; PostgreSQL state schema `1`.
- Không có database migration và không cần deploy lại Zalo Mini App.

## Validation

- `npm ci`: hoàn tất với lockfile v5.16.5.
- Kiểm tra cú pháp trực tiếp toàn bộ backend, script và Admin JavaScript: đạt. Wrapper `npm run check` bị Work Mode ngắt trước khi phê duyệt nên đã chạy chính các lệnh `node --check` tương đương.
- `node --test test/*.test.mjs`: **124/124 test đạt**.
- Tài sản WebP: 1.200 × 800, khoảng 60 KB; có kích thước khai báo và không gây layout shift.
- Regression riêng cho functional copy, animation, responsive mobile, Reduce Motion và cache busting: đạt.
- Credential scan và `git diff --check` trên intended diff: đạt.
- Cloud Browser không mở được URL local `127.0.0.1` do `ERR_BLOCKED_BY_CLIENT`; visual review vẫn cần thực hiện trên preview/deployment sau khi mở PR nháp.

## Deploy và rollback

`render.yaml` vẫn tắt auto deploy. Sau khi UI được duyệt và PR được merge, cần deploy Backend/Admin trên Render để phát hành giao diện mới.

Rollback bằng cách redeploy commit v5.16.4. Không cần thao tác database, Supabase hoặc Zalo Mini App.
