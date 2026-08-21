# v5.16.0 — One-time employee invites

## Mục tiêu

Loại bỏ phụ thuộc Zalo Graph khỏi luồng đăng nhập Mini App khi Backend miễn phí chạy ngoài Việt Nam. Nhân viên xác nhận thiết bị bằng mã mời một lần rồi sử dụng bình thường mà không phải nhập lại mã ở mỗi lần mở ứng dụng.

## Thay đổi

- Admin tạo mã mời `XXXX-XXXX-XXXX` cho mã nhân viên, tên hiển thị và phòng ban.
- Mã mặc định hết hạn sau 24 giờ, chỉ dùng một lần và chỉ được lưu dưới dạng HMAC-SHA256 hash.
- Mini App dùng access token 60 phút và refresh session trượt tối đa 90 ngày.
- Refresh token được xoay ở mỗi lần gia hạn, gắn với ID thiết bị và không được ghi log.
- Phát hiện dùng lại refresh token cũ hoặc sai thiết bị sẽ thu hồi phiên đó.
- Bản ghi invite/session không hoạt động được dọn sau 90 ngày; mỗi collection giữ tối đa 500 bản ghi khi có thể dọn an toàn.
- Admin có thể thu hồi mã chưa dùng và đăng xuất ngay tất cả thiết bị của người dùng.
- Mini App không còn gọi `getAccessToken`, `getUserID` hoặc `/api/auth/zalo`.
- Hồ sơ liên hệ được cập nhật qua `PATCH /api/me`, không đăng nhập Zalo lại.

## API mới

- `POST /api/auth/invite`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/admin/user-access`
- `POST /api/admin/user-invites`
- `POST /api/admin/user-invites/:inviteId/revoke`
- `POST /api/admin/users/:userId/revoke-sessions`

## Dữ liệu và migration

- PostgreSQL free-hosting vẫn dùng state schema `1`; `normalizeDb` tự thêm hai collection mới, không cần chạy SQL mới.
- SQL Server/NAS nâng từ schema `9` lên `10` bằng `010_user_invite_access.sql`.
- Hai bảng mới: `helpdesk.user_invites` và `helpdesk.user_refresh_sessions`.
- Không lưu mã mời hoặc refresh token dạng rõ trong database.

## Phiên bản

- Backend: `5.16.0`
- Mini App: `5.16.0`
- Admin cache bust: `5.16.0`
- SQL Server schema: `10`
- PostgreSQL state schema: `1`

## Regression coverage

- Tạo/list mã mời mà không rò `codeHash`.
- Dùng mã đúng một lần và từ chối lần dùng thứ hai.
- Gia hạn xoay refresh token và từ chối token cũ.
- Dùng lại refresh token cũ thu hồi phiên hiện tại.
- Admin revoke làm access token hiện tại mất hiệu lực ngay.
- Database chỉ chứa hash, không chứa mã mời/refresh token rõ.
- Mini App source không còn gọi Zalo access-token APIs.

## Visual review renders

Các file dưới đây là review render bám theo cấu trúc/CSS của thay đổi; không phải ảnh chụp production:

- [Màn hình nhập mã mời trên Mini App](./assets/miniapp-invite-login-review.svg)
- [Vùng quản trị mã mời và phiên thiết bị](./assets/admin-user-access-review.svg)
