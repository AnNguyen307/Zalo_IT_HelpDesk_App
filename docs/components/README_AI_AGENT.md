# AI HelpDesk Agent v4

Phiên bản này thay phần phản hồi giả lập bằng AI Agent chạy cục bộ qua Ollama.

## Kiến trúc

- Backend Node.js gọi Ollama tại `http://127.0.0.1:11434/api/chat`.
- Model mặc định: `qwen3.5:9b`.
- Agent nhận tiêu đề, mô tả, phản hồi mới, tối đa 12 tin nhắn gần nhất, metadata file đính kèm và các bài Knowledge Base phù hợp.
- Model tạo phản hồi hội thoại động nhưng chỉ được chọn các bước kỹ thuật đã tồn tại trong Knowledge Base.
- Các case mật khẩu, OTP, bảo mật, mất dữ liệu, BSOD, BIOS, server, switch, firewall, quyền admin và phần cứng nguy hiểm luôn được chuyển kỹ thuật viên.
- Nếu Ollama tắt hoặc lỗi, rule engine vẫn tiếp nhận ticket và chuyển HelpDesk an toàn.

## Cài đặt nhanh trên Windows

Trong VS Code:

1. `Terminal > Run Task`.
2. Chọn `HelpDesk: Cài/kiểm tra AI Agent`.
3. Nếu chưa có Ollama, cài bằng PowerShell:

```powershell
irm https://ollama.com/install.ps1 | iex
```

4. Mở lại VS Code và chạy task trên lần nữa.
5. Script tự tải `qwen3.5:9b`, bật `AGENT_MODE=ollama` trong `backend/.env` và kiểm thử model.
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
- Gửi một tình huống kiểm thử.
- Kiểm tra source, confidence và latency.

## Cấu hình

```env
AGENT_MODE=ollama
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
