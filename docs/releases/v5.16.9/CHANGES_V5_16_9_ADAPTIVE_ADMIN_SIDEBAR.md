# v5.16.9 — Adaptive Admin Sidebar

## Kết quả

Thanh điều hướng Admin được tổ chức lại để dễ quét, dễ nhận biết và chiếm ít không gian hơn khi cần. Desktop có chế độ đầy đủ và thu gọn; laptop tự dùng rail; điện thoại dùng taskbar đáy có thể cuộn ngang.

## Thay đổi chính

- Thay các ký tự Unicode không đồng nhất bằng bộ icon SVG nét đơn dùng chung ngôn ngữ Signal System.
- Mỗi mục desktop có tên và mô tả ngắn; nhóm Vận hành, Tri thức và Quản trị được phân tách bằng đường tín hiệu nhẹ.
- Trạng thái được chọn dùng nền Signal Blue tiết chế, viền và signal line thay cho khối tối nặng.
- Nút thu gọn đổi sidebar từ `260px` thành rail `82px`, lưu preference trong `localStorage` và cung cấp tooltip khi chỉ còn icon.
- Trạng thái AI Agent/Playbook và footer phiên bản được gom gọn ở đáy sidebar.
- `aria-current` được đồng bộ theo tab đang mở; nút thu gọn cập nhật `aria-expanded`, nhãn và tooltip.
- Breakpoint laptop tự chuyển sang rail. Breakpoint mobile dùng taskbar cao `76px`, scroll snap ngang và giữ đủ bảy chức năng.
- Bump Backend/Admin, cache-busting và health metadata lên `5.16.9`; `/health` công bố feature `adaptive-admin-sidebar`.

## An toàn và tương thích

- Không đổi API, nghiệp vụ ticket, Playbook, AI Router hoặc xác thực.
- Backend/Admin: `5.16.9`; Mini App source: `5.16.6`.
- SQL Server/NAS schema `10`; PostgreSQL state schema `1`.
- Không có database migration và không cần build/publish lại Mini App.
- Quy trình dự án cho phép tự động merge và deploy các UI/UX release đã vượt qua quality gates tới dịch vụ Render hiện hữu đã được phê duyệt.

## Validation

- `npm run check`: đạt; bao gồm syntax của toàn bộ Backend và Admin JavaScript.
- Backend regression (`node --test test/*.test.mjs`): 127/127 đạt.
- Test cấu trúc navigation, compact preference, active accessibility state, responsive taskbar và cache-busting: đạt.
- Playbook benchmark: Hit@1 `0.90`, Hit@5 `1.00`, MRR `0.95`.
- `git diff --check`, credential scan và kiểm tra diff trước merge: đạt.
- `npm ci` sẽ được xác minh lại trong bước build Render; Work Mode không hoàn tất được lệnh cài đặt do transport phê duyệt bị ngắt, nhưng release không thay đổi dependency hoặc lock graph.
- Runtime `/health` sau deploy phải trả `5.16.9` và có `adaptive-admin-sidebar`.

## Rollback

Redeploy commit Backend/Admin v5.16.8. Không thao tác database hoặc Mini App.
