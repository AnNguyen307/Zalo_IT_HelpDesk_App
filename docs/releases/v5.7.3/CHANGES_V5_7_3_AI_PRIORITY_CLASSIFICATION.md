# Zalo IT HelpDesk v5.7.3 — AI Priority Classification

## Quy tắc mới

- Mọi ticket mới bắt đầu với mức ưu tiên mặc định `normal` (Bình thường).
- AI Agent chỉ thay đổi mức ưu tiên khi kết quả phân tích đánh dấu đã xác định được ưu tiên và giá trị thuộc `low`, `normal`, `high`, `urgent`.
- Nếu Agent không đủ dữ kiện, không đủ chắc chắn hoặc không sẵn sàng rồi bàn giao cho Admin/kỹ thuật viên, ticket giữ `normal`.
- Sự cố có tín hiệu rõ ràng như mất mạng toàn công ty hoặc `server down` vẫn có thể được Agent xác định là `urgent` dù chính sách yêu cầu bàn giao cho kỹ thuật viên.
- Khi người dùng bổ sung thông tin, cùng một quy tắc được áp dụng lại và SLA được tính theo mức ưu tiên đã được chấp nhận.

## Kiểm thử ngoại lệ

- Thiếu kết quả AI hoặc kết quả rỗng.
- AI đề xuất mức cao nhưng đánh dấu chưa xác định được.
- AI/Ollama không sẵn sàng.
- Giá trị ưu tiên không hợp lệ.
- Yêu cầu mơ hồ phải bàn giao và giữ Bình thường.
- Sự cố khẩn cấp có tín hiệu rõ phải được phép chuyển thành Khẩn cấp.
- Tạo ticket và phân tích lại sau phản hồi đều dùng cùng quy tắc; SLA đồng bộ với mức ưu tiên cuối.

Không có migration database và không cần phát hành lại Zalo Mini App. Pull mã nguồn, restart backend và xác nhận `/health` trả `5.7.3`.
