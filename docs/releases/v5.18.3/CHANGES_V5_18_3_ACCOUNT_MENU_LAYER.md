# v5.18.3 — Account Menu Layer Hotfix

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Kết quả

- Menu mở rộng của **Tài khoản** luôn hiển thị phía trên nội dung tại **Tổng quan**, **Playbook** và **Hệ thống & AI**.
- Trên điện thoại, menu được neo trực tiếp bên dưới nút mở rộng và giới hạn chiều cao theo viewport.
- Header chỉ được nâng lớp hiển thị trong lúc menu mở, tránh làm thay đổi tương tác của workspace khi menu đóng.

## Nguyên nhân gốc

Header mobile từng bị chuyển sang `position: static` trong khi `backdrop-filter` tạo stacking context riêng. Menu con vì vậy không thể vượt lên trên các panel có animation, sticky hoặc z-index trong workspace.

## Kiểm thử hồi quy

- Xác nhận lớp `account-menu-open` được thêm và gỡ đồng bộ với trạng thái menu.
- Xác nhận quy tắc v5.18.3 nằm sau các breakpoint cũ và nâng menu/header lên đúng lớp.
- Xác nhận cache-busting và health metadata cùng mang phiên bản v5.18.3.
- Chạy toàn bộ bộ kiểm thử Backend/Admin trước khi merge và deploy.

## Tác động triển khai

- Backend/Admin deployment: required.
- Mini App build/deployment: not required; Mini App remains v5.17.1.
- Database migration: not required.
- PostgreSQL state schema remains `1`.
- PostgreSQL Playbook Governance schema remains `1`.
- SQL Server schema remains `10`.

## Rollback

Deploy lại commit v5.18.2. Không cần rollback dữ liệu hoặc schema.
