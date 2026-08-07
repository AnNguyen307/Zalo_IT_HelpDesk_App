# Zalo IT HelpDesk v5.7 - Operations

Ứng dụng HelpDesk nội bộ chạy trên Zalo Mini App, được thiết kế để **không phụ thuộc API AI trả phí hoặc cloud server thuê theo tháng**.

## Thành phần

- **Zalo Mini App** cho nhân viên tạo, xem và phản hồi ticket.
- **Backend Node.js 20** không có dependency npm bên ngoài.
- **Local HelpDesk Agent** dùng Enterprise Playbook RAG + Knowledge Base + Ollama ngay trên máy backend.
- **Ollama tùy chọn** để hỗ trợ phân loại bằng local LLM; không cần API key.
- **Dashboard kỹ thuật viên** tại `/admin`.
- **JSON store** ghi nguyên tử tại `backend/data/db.json`.
- **Thông báo trong Mini App** khi có phản hồi, đổi trạng thái, file mới hoặc quá SLA.
- **SLA, file đính kèm, timeline, reopen và đánh giá hài lòng** được lưu cục bộ.
- **Tài khoản nhân sự riêng và phân quyền** cho Admin, Technician, Viewer.
- **SLA theo giờ làm việc** có pause/resume khi chờ người dùng.
- **Hàng đợi thông minh, dashboard vận hành và xuất CSV** cho đội HelpDesk.

## Mô hình chi phí

| Thành phần | Mặc định | Phí dịch vụ bắt buộc |
|---|---|---:|
| Agent | Rule engine + Knowledge Base | 0 |
| Local LLM | Ollama tùy chọn | 0 |
| Backend | PC/NAS/máy chủ sẵn có | 0 phí thuê mới |
| Database | JSON local | 0 |
| Dashboard | Static HTML/CSS/JS | 0 |
| Notification | Polling trong Mini App | 0 |
| HTTPS pilot | ngrok Free Dev Domain | 0, phù hợp test/pilot |

Lưu ý: vẫn có chi phí điện, Internet, vận hành máy và có thể cần domain nếu muốn URL production cố định. Mục tiêu của dự án là **không phát sinh phí SaaS/API/cloud mới**.

## Agent tự xử lý gì?

Ở v5.2, Agent chạy theo **Strict Escalation**. Hệ thống chỉ tự hướng dẫn khi tìm thấy Enterprise Playbook đã duyệt, procedure được phép hướng dẫn người dùng, rủi ro không cao và confidence đạt ngưỡng. Knowledge Base đơn lẻ không đủ quyền để Agent đưa checklist.

Khi request nằm ngoài Playbook, Ollama không sẵn sàng, Playbook yêu cầu kỹ thuật viên hoặc confidence thấp, hệ thống **escalate ngay** và không đưa gợi ý mơ hồ.

Luôn chuyển kỹ thuật viên đối với:

- Quên mật khẩu, khóa tài khoản, OTP và quyền admin.
- Phishing, malware, ransomware hoặc mất dữ liệu.
- BSOD, BIOS, phần cứng, server, switch hoặc firewall.
- Cài phần mềm và thay đổi cấu hình hạ tầng.
- Trường hợp không đủ dữ liệu hoặc độ chắc chắn thấp.

Agent không điều khiển máy người dùng. Nó thực hiện triage, tìm checklist nội bộ và escalation.

## Kiến trúc

```text
Nhân viên trên Zalo
        │
        ▼
Zalo Mini App
        │ HTTPS + app session token
        ▼
Node.js API chạy tại doanh nghiệp
   ├── Ticket / Message / Attachment / Notification JSON store
   ├── Rule Engine + Knowledge Base
   ├── Ollama local (optional)
   └── Admin dashboard
```

Không có OpenAI API, embedding API trả phí, vector database managed, managed database hoặc Zalo OA adapter. Embedding được tạo cục bộ bằng Ollama và lưu trong file JSON local.

## Cấu trúc thư mục

```text
zalo-helpdesk-ai/
├── backend/
│   ├── data/db.json + data/uploads/
│   ├── public/                 # Dashboard quản trị
│   ├── src/                    # API, auth, local agent, KB, store
│   └── test/                   # Test rule engine
├── miniapp/
│   ├── app-config.json
│   └── src/                    # Giao diện Zalo Mini App
├── scripts/
│   ├── windows/                # Start, tunnel, backup
│   └── linux/
├── FREE_DEPLOYMENT.md
├── DEPLOYMENT_CHECKLIST.md
└── README.md
```

## 1. Chạy backend miễn phí

Yêu cầu Node.js 20 trở lên.

```bash
cd backend
cp .env.example .env
```

Windows có thể chạy trực tiếp:

```text
scripts\windows\start-backend.bat
```

Sửa tối thiểu:

```env
APP_SECRET=chuoi-ngau-nhien-dai-it-nhat-32-ky-tu
ADMIN_PASSWORD=mat-khau-quan-tri-manh
ZALO_AUTH_MODE=development
AGENT_MODE=rules
```

Chạy:

```bash
npm start
```

Mặc định:

- API: `http://localhost:8080`
- Health: `http://localhost:8080/health`
- Dashboard: `http://localhost:8080/admin`

Backend tự đọc `.env`; không cần `npm install`.

## 2. Chạy Mini App local

```bash
cd miniapp
cp .env.example .env
npm install
npm start
```

`miniapp/.env`:

```env
VITE_API_BASE_URL=http://localhost:8080
```

Trong browser preview, ứng dụng dùng tài khoản demo. Trên Zalo, ứng dụng gọi SDK để lấy access token, user ID và tên/ảnh đại diện khi người dùng cấp quyền.

Trên điện thoại, `localhost` là điện thoại. Mini App cần URL backend HTTPS có thể truy cập từ Internet.

## 3. Chế độ Agent

### Rules — mặc định và nhẹ nhất

```env
AGENT_MODE=rules
AUTO_RESOLVE_THRESHOLD=0.78
```

Luồng:

1. Chuẩn hóa nội dung ticket.
2. Phân loại bằng từ khóa và luật rủi ro.
3. Chấm điểm các bài Knowledge Base.
4. Chỉ tự hướng dẫn khi bài KB có `autoEligible=true`, không rủi ro cao và điểm vượt threshold.
5. Nếu không đạt, chuyển kỹ thuật viên.

### Ollama — local LLM tùy chọn

```env
AGENT_MODE=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3.5:9b
OLLAMA_TIMEOUT_MS=30000
```

Ví dụ:

```bash
ollama pull qwen3.5:9b
ollama serve
```

Guardrail:

- Model chỉ hỗ trợ phân loại, tóm tắt và chọn KB.
- Checklist kỹ thuật luôn lấy từ KB đã duyệt, không dùng lệnh do model tự sinh.
- Backend áp lại risk/priority/threshold sau kết quả model.
- Khi Ollama lỗi hoặc chưa cài, backend tự chuyển sang `rules-local-fallback`.

Vì vậy app không bị phụ thuộc local LLM.

## 4. HTTPS miễn phí bằng ngrok

Khởi động backend trước, sau đó mở tunnel:

```bash
ngrok http 8080
```

Đặt Dev Domain cố định được cấp vào `miniapp/.env`:

```env
VITE_API_BASE_URL=https://your-domain.ngrok-free.app
```

Khi tắt máy, URL vẫn giữ nguyên nhưng backend sẽ offline cho tới khi chạy lại Node.js và ngrok.

## 5. Xác thực Zalo

`ZALO_AUTH_MODE=development` chỉ dành cho demo/pilot vì backend tin vào user ID client gửi.

Khi dùng thật:

```env
ZALO_AUTH_MODE=remote
ZALO_TOKEN_VERIFY_URL=https://internal-auth.example.com/verify-zalo-miniapp-token
```

Backend gửi access token và identity đã claim tới verifier. Verifier phải xác thực theo cơ chế chính thức mà Zalo App của doanh nghiệp được phép sử dụng, rồi trả identity đã xác minh. Backend sau đó phát session token riêng.

Không đưa chế độ `development` ra public production.

## 6. Build và deploy Mini App

```bash
npm install -g zmp-cli
cd miniapp
zmp init
npm install
npm run deploy
```

Đặt `VITE_API_BASE_URL` thành URL HTTPS đúng trước khi build. Cần liên kết project với Zalo Mini App ID và đăng nhập bằng tài khoản Admin/Developer của Mini App.

## 7. Dashboard quản trị

Dashboard tại `/admin` hỗ trợ:

- Tổng quan ticket, quá SLA và điểm hài lòng.
- Tìm/lọc ticket.
- Xem SLA, file đính kèm, timeline, đánh giá tự động và hội thoại.
- Phân công kỹ thuật viên.
- Đổi status/priority và ghi resolution.
- Phản hồi người dùng.
- Thêm, sửa, bật/tắt Knowledge Base.
- Chỉ định bài KB nào được phép tự hướng dẫn.

## 8. Sao lưu

Windows:

```text
scripts\windows\backup-data.bat
```

Linux/macOS:

```bash
./scripts/linux/backup-data.sh
```

File backup gồm cả `db.json` và thư mục file đính kèm, được lưu trong `backups/`. Có thể lên lịch bằng Windows Task Scheduler hoặc cron.

## 9. Kiểm thử

```bash
cd backend
npm run check
npm test
```

Test hiện có:

- Ricoh Offline được hướng dẫn tự động.
- Account/password luôn escalation.
- Ticket mơ hồ không được tự bịa quy trình.

## API chính

| Method | Endpoint | Mục đích |
|---|---|---|
| POST | `/api/auth/zalo` | Đổi identity Zalo thành app session |
| GET | `/api/me` | Hồ sơ hiện tại |
| GET/POST | `/api/tickets` | Danh sách / tạo ticket |
| GET | `/api/tickets/:id` | Chi tiết và hội thoại |
| POST | `/api/tickets/:id/messages` | Gửi phản hồi |
| POST | `/api/tickets/:id/confirm-resolved` | Xác nhận xử lý xong |
| POST | `/api/auth/admin` | Đăng nhập dashboard |
| GET | `/api/admin/stats` | Thống kê |
| PATCH | `/api/admin/tickets/:id` | Cập nhật ticket |
| GET/POST/PATCH | `/api/admin/knowledge-base` | Quản trị KB |

## Giới hạn thực tế

- JSON store phù hợp pilot nhỏ hoặc một backend instance; không phù hợp tải cao.
- Không có push notification; người dùng xem cập nhật trong Mini App.
- Không upload ảnh/file để tránh object storage và antivirus service.
- Không có SSO/AD/Entra ID, SLA calendar, CMDB hoặc email ingestion.
- Không remote execution.
- PC backend phải bật và có Internet để Mini App truy cập.
- Quick Tunnel không phù hợp production ổn định.


## 9. Tính năng v3

- Upload ảnh/PDF/Office/ZIP tối đa theo cấu hình.
- SLA theo priority và tự động ghi cảnh báo quá hạn.
- Notification inbox trong Mini App, cập nhật mỗi 20 giây.
- Timeline trạng thái, priority, assignment, file, reopen và rating.
- Reopen ticket và đánh giá 1–5 sao.

Xem hướng dẫn nâng cấp tại [UPGRADE_V3.md](UPGRADE_V3.md).

## Khởi động tự động với URL ngrok thay đổi

Trên Windows, chạy:

```powershell
.\scripts\windows\start-helpdesk-auto.ps1
```

Hoặc nhấp đúp `START_HELPDESK_AUTO.bat`.

Script sẽ tự khởi động backend/ngrok, đọc URL HTTPS hiện tại từ ngrok Agent API, cập nhật `miniapp/.env`, build và gọi `zmp deploy` khi URL thay đổi. Xem `AUTO_NGROK.md` để biết các tham số.

## AI HelpDesk Agent v4

Phiên bản v4 hỗ trợ AI Agent cục bộ qua Ollama. Agent dùng lịch sử hội thoại và Knowledge Base để tạo phản hồi động; các bước kỹ thuật vẫn bị giới hạn trong quy trình đã được quản trị viên phê duyệt. Xem `README_AI_AGENT.md` và chạy `INSTALL_AI_AGENT.bat` hoặc VS Code Task `HelpDesk: Cài/kiểm tra AI Agent`.


## Enterprise Playbook RAG (v5)

Phiên bản v5 bổ sung 173 procedure đã chuẩn hóa và ưu tiên playbook doanh nghiệp trước Knowledge Base/kiến thức chung của model. Raw config Aruba/FortiGate/OS9700 không được đưa vào index và các secret đã được loại bỏ.

Cài đặt:

```text
INSTALL_ENTERPRISE_PLAYBOOK.bat
```

Tài liệu chi tiết: `README_ENTERPRISE_PLAYBOOK.md` và `CHANGES_V5_ENTERPRISE_PLAYBOOK.md`.
