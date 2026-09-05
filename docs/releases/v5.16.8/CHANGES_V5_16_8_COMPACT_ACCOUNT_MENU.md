# v5.16.8 — Compact Account Menu

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Kết quả

Header Admin chỉ còn nút **Tài khoản** và một nút mở rộng. Các hành động ứng dụng và phiên đăng nhập được gom vào một menu thống nhất, giảm độ rộng của cụm điều khiển nhưng vẫn truy cập nhanh trên desktop và điện thoại.

## Thay đổi chính

- Nút Tài khoản hiển thị avatar, nhãn chức năng và tên người đang đăng nhập; click trực tiếp mở cài đặt tài khoản chung.
- Nút mở rộng cung cấp Cài đặt ứng dụng, Cài đặt tài khoản, Làm mới dữ liệu, Đổi tài khoản và Đăng xuất.
- Dialog cài đặt chung có hai khu vực Ứng dụng/Tài khoản, hỗ trợ điều hướng bằng keyboard và đóng khi click backdrop hoặc nhấn Escape.
- Cài đặt ứng dụng cho phép bật/tắt tự động làm mới 30 giây bằng preference lưu cục bộ và làm mới ngay.
- Cài đặt tài khoản hiển thị tên, vai trò, tên đăng nhập; Admin có lối tắt tới quản lý nhân sự.
- Menu tự đóng khi click ra ngoài; Đổi tài khoản xóa form cũ và đưa focus về tên đăng nhập.
- Bump cache-busting, footer và health metadata của Backend/Admin lên `5.16.8`; health feature có `compact-account-menu` để xác minh runtime sau deploy.

## An toàn và tương thích

- Không đổi API, nghiệp vụ ticket, Playbook, AI Router hoặc cơ chế xác thực.
- Backend/Admin: `5.16.8`; Mini App source: `5.16.6`.
- SQL Server/NAS schema `10`; PostgreSQL state schema `1`.
- Không có database migration và không cần build/publish lại Mini App.
- `render.yaml` vẫn tắt auto deploy; chỉ deploy Render sau khi giao diện được chủ ứng dụng duyệt và PR được merge.

## Validation

- `npm ci`: không hoàn tất trong Work Mode vì npm cache/tarball transport trả lỗi `ENOENT`; không có dependency hoặc lockfile ngoài phần bump version bị thay đổi.
- Backend syntax: đạt bằng toàn bộ lệnh `node --check` tương đương `npm run check`; wrapper npm bị Work Mode ngắt ở bước phê duyệt transport.
- Backend regression (`node --test test/*.test.mjs`): 126/126 đạt.
- Playbook benchmark: Hit@1 `0.90`, Hit@5 `1.00`, MRR `0.95`.
- Credential scan và `git diff --check`: đạt.
- Visual review cuối cùng: thực hiện trên draft PR trước khi merge/deploy theo quy trình UI/UX.

## Rollback

Redeploy commit Backend/Admin v5.16.7. Không thao tác database hoặc Mini App.
