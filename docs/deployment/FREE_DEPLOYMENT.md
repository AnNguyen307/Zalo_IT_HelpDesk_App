# Triển khai theo hướng không phát sinh phí dịch vụ

## 1. Chi phí đã loại bỏ

Phiên bản này không cần:

- API OpenAI hoặc API AI tính tiền theo token.
- Cloud server/managed database.
- Dịch vụ gửi thông báo Zalo OA trả phí.
- PostgreSQL, Redis, object storage hoặc SaaS HelpDesk.

Thành phần mặc định:

- Zalo Mini App: giao diện người dùng.
- Node.js backend: chạy trên PC/NAS/máy chủ sẵn có của doanh nghiệp.
- JSON database: `backend/data/db.json`.
- Rule engine + Knowledge Base: phân loại và hướng dẫn tại máy nội bộ.
- In-app update: người dùng mở Mini App để xem phản hồi.

“Không phát sinh phí dịch vụ” không đồng nghĩa không có bất kỳ chi phí vật lý nào: máy chạy backend vẫn dùng điện, Internet và cần được vận hành. URL cố định có thể cần domain doanh nghiệp đã sở hữu.

## 2. Phương án A — Pilot miễn phí nhanh

Phù hợp demo hoặc pilot ngắn hạn.

### Bước 1: Chạy backend

Windows:

```text
scripts\windows\start-backend.bat
```

Linux/macOS:

```bash
./scripts/linux/start-backend.sh
```

### Bước 2: Tạo HTTPS Quick Tunnel

```text
scripts\windows\start-free-tunnel.bat
```

hoặc:

```bash
cloudflared tunnel --url http://localhost:8080
```

Lệnh trả về URL dạng:

```text
https://random-name.trycloudflare.com
```

Quick Tunnel chỉ nên dùng để kiểm thử: URL thay đổi khi tiến trình dừng và không có SLA. Mỗi khi URL đổi, phải sửa `miniapp/.env`, build và deploy lại Mini App Development.

### Bước 3: Trỏ Mini App vào URL HTTPS

`miniapp/.env`:

```env
VITE_API_BASE_URL=https://random-name.trycloudflare.com
```

Sau đó:

```bash
cd miniapp
npm install
npm run build
zmp deploy
```

## 3. Phương án B — Chạy ổn định với hạ tầng sẵn có

Phù hợp dùng nội bộ lâu dài mà không thuê server mới.

Cần:

- Một PC/NAS/máy chủ nội bộ chạy liên tục.
- Domain/subdomain doanh nghiệp đang sở hữu.
- Cloudflare account và named tunnel, hoặc reverse proxy HTTPS hiện có của doanh nghiệp.

Luồng:

```text
Zalo Mini App
  -> https://helpdesk-api.example.com
  -> HTTPS Tunnel/Reverse Proxy
  -> PC nội bộ:8080
  -> db.json + Knowledge Base
```

Với Cloudflare named tunnel, tạo tunnel và cấu hình ingress trỏ hostname về `http://localhost:8080`. Không mở port inbound trực tiếp trên router. Sau đó đặt:

```env
VITE_API_BASE_URL=https://helpdesk-api.example.com
```

## 4. Chế độ Agent không tốn phí

### Chế độ nhẹ, khuyến nghị

`backend/.env`:

```env
AGENT_MODE=rules
```

Ưu điểm:

- Không API key.
- Không tải model.
- RAM/CPU rất thấp.
- Kết quả ổn định, checklist chỉ lấy từ Knowledge Base.

### Cloud AI free tier tùy chọn

Router v5.9.1 có thể dùng Gemini, Groq, OpenRouter và SambaNova khi provider được bật, có API key phía server và `AI_CLOUD_ENABLED=true`. Không cần cài model hoặc AI service trên máy backend.

Nếu không có key hoặc toàn bộ provider lỗi, backend tự dùng Rules/HelpDesk fallback nên ticket vẫn hoạt động.

## 5. Tự khởi động cùng Windows

1. Nhấn `Win + R`, nhập `shell:startup`.
2. Tạo shortcut tới `scripts\windows\start-backend.bat`.
3. Với tunnel ổn định, cài `cloudflared` dưới dạng Windows Service theo hướng dẫn chính thức.
4. Cấu hình máy không Sleep trong giờ làm việc.

Không nên cho Quick Tunnel tự chạy production vì URL thay đổi.

## 6. Sao lưu miễn phí

Chạy:

```text
scripts\windows\backup-data.bat
```

hoặc:

```bash
./scripts/linux/backup-data.sh
```

Có thể dùng Windows Task Scheduler/cron để chạy mỗi ngày. Nên sao chép thư mục `backups` sang ổ NAS hoặc ổ đĩa khác mà doanh nghiệp đã có.

## 7. Những tính năng cố ý không dùng để giữ chi phí bằng 0

- SMS/email/OA push tự động.
- Upload file lên cloud.
- Speech-to-text hoặc OCR cloud.
- Vector database và embedding API.
- Remote control tự động.
- Managed monitoring/logging.

Các chức năng ticket, dashboard, hội thoại, thống kê, Knowledge Base và rule agent vẫn hoạt động.
