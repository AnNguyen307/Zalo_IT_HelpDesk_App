# Changes v5.6.0

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


- Thêm khóa hội thoại `HUMAN ONLY` bất biến sau khi AI escalate.
- AI chỉ gửi một thông báo bàn giao cuối cùng rồi rời ticket.
- Phản hồi người dùng sau handoff được lưu trực tiếp cho Technician/Admin, không gọi Ollama.
- Technician/Admin tham gia, được phân công hoặc đặt ticket `in_progress` sẽ khóa AI.
- Thêm guard thứ hai trong transaction để chặn race condition khi kỹ thuật viên tham gia trong lúc AI đang phân tích.
- Khóa tiếp tục tồn tại khi ticket được reopen.
- Thêm 5 trường SQL Server và migration/backfill cho ticket cũ.
- Mini App và Admin Dashboard hiển thị trạng thái `HUMAN ONLY`.
- Thêm 5 bài test riêng cho handoff lock.
