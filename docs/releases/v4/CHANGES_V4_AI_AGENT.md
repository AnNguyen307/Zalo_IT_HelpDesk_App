# Changes v4.0 — AI HelpDesk Agent

- Thay phản hồi mock bằng AI Agent cục bộ qua Ollama.
- Ghi nhớ 12 tin nhắn gần nhất của ticket.
- Trả lời động dựa trên phản hồi người dùng và tránh lặp bước đã thử.
- Structured Outputs bằng JSON schema.
- Guardrail: model chỉ chọn bước từ Knowledge Base đã duyệt.
- Fallback rule engine khi Ollama không khả dụng.
- Health check thực tế: reachable, modelInstalled, ready.
- Dashboard Admin có tab AI Agent và form test trực tiếp.
- Mini App hiển thị provider, model và thời gian xử lý.
- Script Windows tự cài cấu hình, tải model và test Ollama.
