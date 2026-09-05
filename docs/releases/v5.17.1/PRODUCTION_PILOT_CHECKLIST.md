# Checklist Production Pilot v5.17.1

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## 1. Preflight

- [ ] Render `/health` trả `ok: true`, `version: 5.17.1` và feature `production-pilot-e2e`.
- [ ] `playbookGovernance.ready: true`, provider `postgres`, schema `1`.
- [ ] `playbook.source: postgres-governance`, `indexCurrent: true`.
- [ ] Mini App Testing được build từ đúng merge commit và trỏ tới `https://zalo-it-helpdesk-pilot.onrender.com`.
- [ ] Chỉ dùng mã nhân viên, nội dung ticket và file giả lập.
- [ ] Ghi lại thời điểm bắt đầu và người thực hiện để đối soát audit.

## 2. Luồng người dùng và HelpDesk

| Bước | Thao tác | Kết quả đạt |
|---|---|---|
| 1 | Admin tạo mã mời cho user pilot | Mã `XXXX-XXXX-XXXX` chỉ hiện một lần |
| 2 | Mini App nhập mã mời | Vào Trang chủ; mở lại app không hỏi mã |
| 3 | Tạo ticket máy in Ricoh Offline | Ticket xuất hiện trên Mini App và Admin |
| 4 | Đính kèm file `.txt` hoặc ảnh giả lập | Upload thành công; preview/download đúng quyền |
| 5 | Chọn “Tôi vẫn chưa xử lý được” | Ticket về `open`, hiển thị HUMAN ONLY |
| 6 | Admin mở Copilot | Có run nội bộ; Mini App không thấy nội dung Copilot |
| 7 | HelpDesk gửi phản hồi | Mini App nhận thông báo và thấy reply kỹ thuật viên |
| 8 | HelpDesk nhập resolution và Resolve | Ticket về `resolved`, SLA/status đồng bộ |
| 9 | Mini App đánh giá 5 sao | Rating xuất hiện trong ticket/history/report |
| 10 | Đóng/mở Mini App | Session còn hiệu lực; dữ liệu ticket nhất quán |

## 3. Failure paths

- [ ] Dùng lại mã mời đã đổi: bị từ chối `INVITE_INVALID`.
- [ ] Upload file vượt giới hạn: bị từ chối rõ ràng, không để file rác.
- [ ] User khác mở attachment/ticket: bị từ chối quyền.
- [ ] Sau HUMAN ONLY, user reply chỉ tới HelpDesk; AI User không trả lời thêm.
- [ ] Tắt cloud provider trong môi trường kiểm thử: ticket vẫn tạo được và Rules fallback an toàn.
- [ ] Thu hồi phiên trong Admin: access token hiện tại mất hiệu lực ngay.

## 4. Điều kiện phát hành Production

Chỉ publish Mini App Production khi toàn bộ checklist đạt, không có lỗi P0/P1, không rò thông tin Copilot/credential, Render health ổn định trong cửa sổ pilot và có đường rollback về Testing version trước đó.

Nếu có lỗi, dừng pilot, giữ nguyên dữ liệu để đối soát, thu hồi session test khi cần và rollback ứng dụng; không xóa bảng PostgreSQL hoặc file thật để “làm sạch” kết quả.
