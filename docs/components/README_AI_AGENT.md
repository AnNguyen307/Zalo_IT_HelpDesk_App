# AI HelpDesk Agent v5.8

AI Agent v5.8 dùng AI Router thống nhất, đo chất lượng từng quyết định và vẫn giữ Ollama/Rules làm đường vận hành local-first.

## Kiến trúc

- Backend chọn `rules`, `ollama` hoặc `gemini` qua `AI_PROVIDER`.
- Ollama mặc định gọi `http://127.0.0.1:11434/api/chat`; model local mặc định là `qwen3.5:9b`.
- Gemini là provider staging, tắt mặc định và chỉ nhận payload tối thiểu đã redaction sau Retrieval Top-K.
- Agent nhận tiêu đề, mô tả, phản hồi mới, tối đa 12 tin nhắn gần nhất, metadata file đính kèm và các bài Knowledge Base phù hợp.
- Model tạo phản hồi hội thoại động nhưng chỉ được chọn các bước kỹ thuật đã tồn tại trong Knowledge Base.
- Các case mật khẩu, OTP, bảo mật, mất dữ liệu, BSOD, BIOS, server, switch, firewall, quyền admin và phần cứng nguy hiểm luôn được chuyển kỹ thuật viên.
- Nếu Ollama tắt hoặc lỗi, rule engine vẫn tiếp nhận ticket và chuyển HelpDesk an toàn.
- Mỗi lần phân tích tạo `decisionId`; Admin có thể đánh dấu Đúng/Cần sửa và dashboard tổng hợp quality theo provider.

## Cài đặt nhanh trên Windows

Trong VS Code:

1. `Terminal > Run Task`.
2. Chọn `HelpDesk: Cài/kiểm tra AI Agent`.
3. Nếu chưa có Ollama, cài bằng PowerShell:

```powershell
irm https://ollama.com/install.ps1 | iex
```

4. Mở lại VS Code và chạy task trên lần nữa.
5. Script tự tải `qwen3.5:9b`, bật `AGENT_MODE=ollama` (alias tương thích) trong `backend/.env` và kiểm thử model.
6. Dừng rồi chạy lại task `HelpDesk: Backend`.

Có thể nhấp đúp `INSTALL_AI_AGENT.bat` thay cho VS Code Task.

## Kiểm tra

Mở:

```text
http://localhost:8080/health
```

Kết quả đúng:

```json
{
  "agent": {
    "mode": "ollama",
    "provider": "ollama-local",
    "model": "qwen3.5:9b",
    "reachable": true,
    "modelInstalled": true,
    "ready": true
  }
}
```

Mở dashboard Admin > tab **AI Agent** để:

- Xem trạng thái kết nối Ollama.
- Xem model đang dùng.
- Xem review coverage, accuracy, escalation, provider unavailable và latency.
- Admin đánh giá decision record của từng ticket.
- Gửi một tình huống kiểm thử.
- Kiểm tra source, confidence và latency.

## Cấu hình

```env
AI_PROVIDER=ollama
AGENT_MODE=ollama
AI_CLOUD_ENABLED=false
AI_REDACTION_ENABLED=true
AI_QUALITY_RETENTION_DAYS=180
AUTO_RESOLVE_THRESHOLD=0.78
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3.5:9b
OLLAMA_TIMEOUT_MS=90000
OLLAMA_KEEP_ALIVE=10m
OLLAMA_TEMPERATURE=0.1
OLLAMA_NUM_CTX=8192
AGENT_HISTORY_MESSAGES=12
AGENT_STATUS_CACHE_MS=10000
```

Gemini staging:

```env
AI_PROVIDER=gemini
AI_CLOUD_ENABLED=true
AI_REDACTION_ENABLED=true
GEMINI_API_KEY=server-side-only
GEMINI_MODEL=gemini-3.6-flash
```

Máy yếu có thể dùng:

```env
OLLAMA_MODEL=qwen3:1.7b
```

Sau đó chạy:

```powershell
ollama pull qwen3:1.7b
```

Máy có RAM/GPU tốt hơn có thể dùng `qwen3.5:27b`.

## Lưu ý vận hành

- Ollama và backend phải chạy trên cùng máy trong cấu hình mặc định.
- Lần phản hồi đầu tiên sau khi model chưa được nạp có thể chậm hơn.
- Không mở cổng 11434 ra Internet. Chỉ backend local cần truy cập Ollama.
- Ngrok chỉ công khai backend port 8080, không công khai Ollama.
- AI không tự thay đổi ticket, không reset mật khẩu và không thực thi lệnh trên máy người dùng.
- Không đưa Gemini API key vào Mini App hoặc Admin frontend. Review sai chỉ hiệu chỉnh category/priority/risk; không được tự gỡ human handoff.
