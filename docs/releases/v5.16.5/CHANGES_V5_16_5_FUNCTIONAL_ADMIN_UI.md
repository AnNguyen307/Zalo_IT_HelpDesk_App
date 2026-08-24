# v5.16.5 — Functional UI

## Kết quả

Admin và Mini App dùng tiêu đề, mô tả ngắn để giải thích trực tiếp chức năng của từng màn hình. Banner Tổng quan Admin hiển thị trực tiếp GIF quy trình HelpDesk do chủ ứng dụng cung cấp.

## Thay đổi chính

- Dùng `helpdesk-workflow-v5165.gif` kích thước 1.200 × 560 làm toàn bộ banner Tổng quan.
- Loại bỏ toàn bộ slogan, trạng thái nhanh, lớp scan và minh họa cũ bên trong khung.
- Giữ đúng toàn bộ khung hình GIF trên desktop và điện thoại, không cắt nội dung.
- Rút gọn nội dung tại Đăng nhập, Tổng quan, Báo cáo, Nhân sự, Kiến thức, Quy trình, Playbook, Hệ thống & AI và các dialog quản trị.
- Thay các slogan còn lại trong Mini App tại màn hình tải, đăng nhập mã mời, Trang chủ, danh sách ticket và tạo yêu cầu bằng nhãn chức năng ngắn.
- Bổ sung regression test ngăn các slogan cũ quay lại và kiểm tra tài sản ảnh, cache busting, responsive motion.

## An toàn và tương thích

- Không đổi API, nghiệp vụ ticket, Playbook, AI Router hoặc xác thực.
- Không thêm biến môi trường hoặc secret.
- Backend/Admin và Mini App source: `5.16.5`.
- SQL Server/NAS schema `10`; PostgreSQL state schema `1`.
- Không có database migration. Cần build và publish lại Zalo Mini App sau khi UI được duyệt và merge.

## Validation

- `npm ci`: hoàn tất với lockfile v5.16.5.
- Kiểm tra cú pháp trực tiếp toàn bộ backend, script và Admin JavaScript: đạt. Wrapper `npm run check` bị Work Mode ngắt trước khi phê duyệt nên đã chạy chính các lệnh `node --check` tương đương.
- `node --test test/*.test.mjs`: **125/125 test đạt**.
- `npm run build` trong `miniapp`: đạt.
- Tài sản GIF: 1.200 × 560, khoảng 892 KB; có kích thước khai báo và không gây layout shift.
- Regression riêng cho functional copy, banner GIF, responsive mobile và cache busting: đạt.
- Credential scan và `git diff --check` trên intended diff: đạt.
- Cloud Browser không mở được URL local `127.0.0.1` do `ERR_BLOCKED_BY_CLIENT`; visual review vẫn cần thực hiện trên preview/deployment sau khi mở PR nháp.

## Deploy và rollback

`render.yaml` vẫn tắt auto deploy. Sau khi UI được duyệt và PR được merge, cần deploy Backend/Admin trên Render và publish Mini App v5.16.5 để phát hành toàn bộ giao diện mới.

Rollback Backend bằng cách redeploy commit v5.16.4; Mini App có thể chuyển lại phiên bản v5.16.0 trên Zalo Mini App Console. Không cần thao tác database hoặc Supabase.
