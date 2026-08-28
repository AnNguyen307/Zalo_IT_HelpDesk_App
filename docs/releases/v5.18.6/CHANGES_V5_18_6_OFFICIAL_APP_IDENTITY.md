# v5.18.6 / Mini App v5.17.2 — Official App Identity

## Kết quả

- Đồng bộ tên đã được Zalo xác thực: `Nguyễn Phan Trường An HelpDesk`.
- Dùng tên chính thức trong `app-config.json`, tiêu đề HTML, Điều khoản sử dụng và Chính sách quyền riêng tư.
- Công khai đúng chủ sở hữu cá nhân `Nguyễn Phan Trường An` và ngày cập nhật tài liệu.
- Giữ nhãn sản phẩm bên trong là `IT HelpDesk` để giao diện ngắn gọn trên điện thoại.

## Phạm vi triển khai

- Backend/Admin v5.18.6: deploy lên dịch vụ Render hiện có để cập nhật tài liệu công khai và health metadata.
- Mini App v5.17.2: build từ Vite 5 baseline và deploy một phiên bản **Testing** mới.
- Mini App Testing deployment: required.
- Gửi xét duyệt Production: chưa thực hiện trong release này; chỉ làm sau khi Production Pilot đạt.
- Không chọn hoặc gửi xét duyệt các phiên bản Testing cũ 31, 30 hoặc 29.

## Kiểm tra

- Regression test khóa tên chính thức trong metadata và hai tài liệu công khai.
- Production Pilot tự động kiểm tra đầy đủ luồng mã mời, ticket, attachment, handoff, phản hồi, resolve và rating.
- Build production Mini App phải tạo `dist/app-config.json` với asset tồn tại và đúng tên chính thức.
- Production `/health` phải trả Backend/Admin `5.18.6` và `officialAppIdentity.miniAppSourceVersion: 5.17.2`.

## Dữ liệu và rollback

- Không có migration. PostgreSQL state schema `1`, PostgreSQL Playbook Governance schema `1`, SQL Server schema `10`.
- Không thay đổi token, secret, dữ liệu ticket hoặc quyền người dùng.
- Rollback Backend/Admin về v5.18.5 nếu health hoặc tài liệu công khai sai.
- Rollback Mini App bằng cách chọn lại phiên bản Testing gần nhất đã hoạt động; không gửi Production khi pilot chưa đạt.
