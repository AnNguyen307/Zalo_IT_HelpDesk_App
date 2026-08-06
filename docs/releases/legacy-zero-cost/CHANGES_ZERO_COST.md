# Các thay đổi trong Zero-Cost Edition v2.0

## Đã loại bỏ

- OpenAI Responses API và toàn bộ biến `OPENAI_*`.
- Phụ thuộc API key AI.
- Zalo OA notification adapter và biến `ZALO_OA_*`.
- Khuyến nghị managed database/cloud VM trong luồng mặc định.

## Đã bổ sung

- `AGENT_MODE=rules`: agent cục bộ hoàn toàn bằng Knowledge Base.
- `AGENT_MODE=ollama`: local LLM tùy chọn, có fallback tự động.
- Guardrail: local LLM không được sinh checklist kỹ thuật; steps luôn lấy từ KB đã duyệt.
- Endpoint `/health` báo rõ `paidApiRequired: false`.
- Script khởi động backend Windows/Linux.
- Script Cloudflare Quick Tunnel cho pilot.
- Script sao lưu `db.json`.
- Test an toàn cho printer, account và ticket mơ hồ.
- Tài liệu triển khai không phát sinh phí dịch vụ.

## Kết quả kiểm thử

- Backend syntax check: đạt.
- Unit test rule agent: 3/3 đạt.
- API smoke test: đăng nhập, tạo ticket, tự hướng dẫn, thống kê và resolve đạt.
- Ollama unavailable fallback: đạt, ticket vẫn xử lý bằng rules.
- Mini App TS/TSX syntax transpile: đạt 13 file.
- Full Mini App dependency build chưa chạy trong môi trường đóng gói vì npm registry nội bộ thiếu `@types/react`; cần chạy `npm install && npm run build` trên máy có npm registry công khai.
