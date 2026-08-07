# Zalo IT HelpDesk v5.7.2 — Admin Ticket Scroll

## Sửa lỗi

- Con lăn chuột và touchpad tiếp tục cuộn trang khi con trỏ nằm trên bảng **Yêu cầu**.
- Bảng vẫn giữ cuộn ngang riêng khi nội dung rộng hơn màn hình.
- Loại bỏ việc chặn chuỗi cuộn dọc do `overscroll-behavior: contain` áp dụng đồng thời cho cả hai trục.

## Kiểm thử hồi quy

- Xác nhận vùng bảng vẫn có `overflow: auto` và giữ giới hạn cuộn ngang.
- Xác nhận cuộn dọc dùng `overscroll-behavior-y: auto` để truyền lên trang ở cả đầu, giữa và cuối danh sách.
- Xác nhận JavaScript không hủy sự kiện `wheel`, `mousewheel` hoặc touchpad trên dòng ticket và các phần tử con.

Không có migration database và không cần phát hành lại Zalo Mini App. Pull mã nguồn, restart backend và xác nhận `/health` trả `5.7.2`.
