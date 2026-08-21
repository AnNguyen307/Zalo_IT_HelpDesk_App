# v5.16.1 — Readable employee invite access UI

## Outcome

- Tăng cỡ chữ cho tên, mã nhân viên, trạng thái phiên và thời điểm hoạt động.
- Tách ba chỉ số truy cập thành các ô tín hiệu có nhãn và diễn giải rõ.
- Bổ sung mô tả ngắn cho hai khu vực **Mã mời gần đây** và **Người dùng Mini App**.
- Đưa trạng thái vào cùng dòng với tên để quét nhanh; giữ chi tiết thiết bị ở dòng riêng.
- Đồng bộ **Thu hồi mã** và **Đăng xuất thiết bị** thành nút phụ trung tính. Hành động đăng xuất vẫn có bước xác nhận trước khi thực thi.
- Chuyển hai danh sách thành một cột khi vùng hiển thị nhỏ hơn `1180px`; nút thao tác thành toàn chiều rộng trên điện thoại.

## Scope and compatibility

- Chỉ thay đổi Admin HTML/CSS/JavaScript; API và hành vi mã mời không đổi.
- Backend version: `5.16.1`.
- Mini App version: `5.16.0`; không cần build hoặc deploy lại Mini App.
- SQL Server schema: `10`; không có migration mới.
- PostgreSQL state schema: `1`; không thay đổi.

## Validation

- `npm run check`
- `npm test`
- Kiểm tra quy tắc responsive cho desktop, màn hình hẹp và điện thoại bằng regression test; duyệt trực quan trên PR trước khi merge.
- Quét diff để bảo đảm không có credential/secret.

## Rollback

Rollback commit UI sẽ trả lại layout v5.16.0. Không cần rollback database hoặc dữ liệu mã mời/phiên thiết bị.
