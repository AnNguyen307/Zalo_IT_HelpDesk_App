# v5.12.0 — Copilot phân tích độc lập ngoài Playbook

## Mục tiêu

Staff AI Copilot không còn dừng ở việc diễn đạt lại procedure. Playbook vẫn là nguồn nội bộ đã phê duyệt, nhưng mỗi lần phân tích cloud hợp lệ phải tạo thêm các giả thuyết và hướng giải quyết độc lập để Helpdesk kiểm chứng.

## Thay đổi chính

- Đánh giá độ khớp Playbook: `matched`, `partial` hoặc `none`.
- Không ép một lỗi mới vào procedure chỉ vì truy hồi được từ khóa gần giống.
- Bắt buộc tối thiểu hai giả thuyết AI, mỗi giả thuyết có lý do, confidence và bước kiểm chứng.
- Bắt buộc tối thiểu hai hướng giải quyết, mỗi hướng có bước thực hiện, tín hiệu thành công, điều kiện dừng/chuyển cấp và mức rủi ro.
- `hybrid`: kết hợp Playbook với phân tích độc lập.
- `ai_led`: không có Playbook phù hợp nhưng cloud AI vẫn chủ động hỗ trợ Helpdesk.
- `rules_fallback`: cloud AI không khả dụng; hệ thống chỉ dùng Playbook/checklist an toàn và không giả vờ có phân tích AI.

## Guardrail giữ nguyên

- Chỉ Staff đọc được Copilot; User/Mini App không nhận suggestion.
- Copilot không tự gửi reply, thực thi thao tác, đổi trạng thái hoặc đóng ticket.
- Bước mang nhãn Playbook vẫn được backend ánh xạ nguyên văn từ procedure đã duyệt.
- Nội dung ngoài Playbook luôn là giả thuyết AI, không giả mạo nguồn nội bộ.
- Backend từ chối output trực tiếp yêu cầu password/OTP/token, chạy lệnh phá hủy hoặc vô hiệu hóa bảo mật và thử provider khác trước khi fallback.
- Tình huống security, dữ liệu, quyền admin hoặc hạ tầng lõi chỉ được nêu hướng kiểm chứng và điều kiện chuyển cấp/phê duyệt.

AI Agent trả lời trực tiếp User vẫn theo Strict Escalation và không tự sinh hướng dẫn ngoài Playbook. Thay đổi này chỉ áp dụng cho Staff Copilot nội bộ.

## Compatibility

Suggestion tiếp tục lưu trong trường JSON hiện có của `helpdesk.ai_copilot_runs`; không cần migration mới. Schema SQL Server vẫn là version `9`.
