# Tiêu chuẩn kiểm thử chức năng và ngoại lệ

Tiêu chuẩn này áp dụng cho mọi thay đổi cũ được sửa lại, thay đổi hiện tại và tính năng mới của Zalo IT HelpDesk.

## Ma trận bắt buộc

Mỗi chức năng phải có test cho các nhóm liên quan sau:

1. Luồng thành công và kết quả được lưu/hiển thị đúng.
2. Dữ liệu rỗng, sai kiểu, sai định dạng, giá trị biên nhỏ nhất/lớn nhất và vượt giới hạn.
3. Dữ liệu trùng, xung đột đồng thời, thao tác lặp lại và tính idempotent.
4. Trạng thái trước/sau, chuyển trạng thái không hợp lệ và các quy tắc bảo vệ dữ liệu.
5. Chưa đăng nhập, hết phiên, sai vai trò và truy cập tài nguyên không thuộc quyền.
6. Lỗi mạng, timeout, phản hồi không phải JSON, mã `4xx` và `5xx`.
7. JSON store và SQL Server khi logic lưu trữ bị ảnh hưởng; giao dịch lỗi không được để lại dữ liệu dở dang.
8. Giao diện phải hiển thị lỗi ngay tại ngữ cảnh thao tác, giữ nguyên dữ liệu form và đưa focus về trường sai.
9. Không lộ mật khẩu, token, hash, câu lệnh SQL hoặc thông tin nội bộ trong phản hồi lỗi.
10. Dữ liệu/tính năng đã có phải tiếp tục hoạt động sau nâng cấp và rollback mã nguồn.

## Definition of Done

- Mọi bug phải có ít nhất một regression test tái hiện lỗi trước khi sửa.
- API lỗi dự đoán được phải có HTTP status, `code`, `field` khi phù hợp và thông báo tiếng Việt có thể hành động.
- Chạy `npm run check` và `npm test` cho backend.
- Nếu Mini App thay đổi, chạy build TypeScript/Vite và kiểm tra Zalo Testing Version.
- Kiểm thử thủ công trên kích thước desktop/mobile liên quan; lỗi trong dialog không được chỉ xuất hiện ở terminal.
- PR phải ghi rõ luồng thành công, các ngoại lệ đã test và ngoại lệ chưa thể tự động hóa.

Không chấp nhận nghiệm thu chỉ dựa trên việc luồng thành công chạy được.
