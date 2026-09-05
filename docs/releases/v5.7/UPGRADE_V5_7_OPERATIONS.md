# Nâng cấp lên v5.7 Operations

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## 1. Sao lưu

Trước khi nâng cấp, dừng backend và chạy script backup hiện có. Xác nhận đã có bản sao database JSON hoặc SQL Server và thư mục upload.

## 2. Cập nhật mã nguồn

```powershell
git status -sb
git pull --ff-only origin main
cd backend
npm install
```

Không tiếp tục nếu `git status` có thay đổi cục bộ chưa xác định.

## 3. Cập nhật database

### SQL Server

Giữ nguyên cấu hình `SQLSERVER_*`, sau đó chạy:

```powershell
npm run db:migrate
npm run db:status
```

Schema version phải đạt `7`. Migration chỉ bổ sung bảng/cột/index; không xóa ticket, message, file, audit hoặc Playbook hiện có.

### JSON store

Không cần chạy migration. Collection `staffAccounts` được thêm tự động khi backend đọc database cũ.

## 4. Cấu hình SLA

Thêm vào `backend/.env`:

```env
LEGACY_STAFF_LOGIN_ENABLED=true
SLA_TIME_ZONE=Asia/Ho_Chi_Minh
SLA_WORK_DAYS=1,2,3,4,5
SLA_WORK_START=08:00
SLA_WORK_END=17:30
SLA_HOLIDAYS=
```

`SLA_HOLIDAYS` nhận danh sách ngày `YYYY-MM-DD` cách nhau bằng dấu phẩy. Các mức phút SLA cũ được giữ nguyên nhưng từ v5.7 chỉ tiêu thụ trong giờ làm việc.

## 5. Chuyển đổi tài khoản nhân sự

1. Khởi động backend.
2. Vào `/admin` với username `admin` và `ADMIN_PASSWORD` hiện tại.
3. Mở **Nhân sự** và tạo ít nhất một Admin riêng.
4. Tạo tài khoản riêng cho từng Technician/Viewer.
5. Đăng xuất và kiểm tra đăng nhập bằng từng tài khoản mới.
6. Kiểm tra phân công, phản hồi, Viewer chỉ đọc và audit actor.
7. Sau khi xác nhận mọi tài khoản riêng hoạt động, đổi:

```env
LEGACY_STAFF_LOGIN_ENABLED=false
```

Sau đó restart backend. Thao tác này tắt cả `ADMIN_PASSWORD` khẩn cấp và `TECHNICIAN_PASSWORD` dùng chung, vì vậy chỉ thực hiện sau khi đã kiểm tra tài khoản Admin riêng.

## 6. Kiểm tra SLA và báo cáo

- Chuyển một ticket sang `Chờ người dùng`: SLA phải hiện `Tạm dừng`.
- Cho Client phản hồi: ticket trở lại hàng đợi xử lý và SLA tiếp tục.
- Kiểm tra các hàng `Của tôi`, `Chưa phân công`, `Client vừa trả lời`.
- Mở tab **Báo cáo** và tải CSV 30 ngày.

## 7. Build/deploy Mini App

Client có thay đổi hiển thị SLA nên cần tạo Zalo Testing Version mới bằng workflow CI/CD hiện có với URL API HTTPS hiện tại.

## Rollback

Có thể rollback mã nguồn về v5.6 mà không cần xóa migration 007. Bảng `staff_accounts` và cột `assigned_to_id` là bổ sung, không làm v5.6 mất khả năng đọc ticket cũ. Giữ backup cho đến khi hoàn tất kiểm thử vận hành.
