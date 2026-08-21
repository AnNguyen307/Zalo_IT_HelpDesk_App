# Upgrade to v5.16.0

## Free-hosting: Render + Supabase

1. Deploy Backend `5.16.0`.
2. Không chạy migration PostgreSQL mới; state schema vẫn là `1`.
3. Kiểm tra `/health` trả:
   - `version = 5.16.0`;
   - `authentication.userLogin = one-time-invite`;
   - `authentication.deviceSessionDays = 90`.
4. Build/deploy Mini App `5.16.0` với `VITE_API_BASE_URL` trỏ đúng Backend.
5. Trong Admin, tạo một mã mời thử; xác nhận trên Mini App; đóng/mở lại ứng dụng và kiểm tra không hỏi lại mã.
6. Thu hồi phiên trong Admin và kiểm tra Mini App quay về màn hình mã mời.

Không cần đổi `APP_SECRET`. Không đổi `APP_SECRET` sau khi đã cấp mã hoặc tạo phiên, vì hash và chữ ký hiện tại sẽ mất hiệu lực.

## NAS / SQL Server

Trước khi restart Backend:

```powershell
cd backend
npm ci
npm run db:migrate
npm run db:status
```

`db:status` phải báo schema version `10`. Migration `010_user_invite_access.sql` có thể chạy lại an toàn.

## Biến cấu hình mới

```env
USER_ACCESS_TTL_MINUTES=60
USER_REFRESH_TTL_DAYS=90
USER_INVITE_TTL_HOURS=24
RATE_LIMIT_INVITE_MAX=10
```

Các giá trị có hard cap trong code: access token tối đa 60 phút, refresh session tối đa 90 ngày và mã mời tối đa 7 ngày.

## Rollback

- Rollback Backend/Mini App về commit trước v5.16.0 sẽ quay lại đăng nhập Zalo và không đọc hai collection/bảng mới.
- Không xóa bảng schema `10` trong rollback khẩn cấp; dữ liệu không gây ảnh hưởng cho code cũ.
- Nếu rollback Zalo được dùng lại trên Backend ngoài Việt Nam, lỗi provider `-501` có thể tái diễn.

