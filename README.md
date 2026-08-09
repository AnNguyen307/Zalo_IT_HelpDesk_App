# Zalo IT HelpDesk v5.9.1 - Cloud-only AI Router

Ứng dụng HelpDesk nội bộ chạy trên Zalo Mini App. Router V2 chỉ dùng các model cloud có free tier và luôn giữ Rules/HelpDesk làm fallback vận hành; backend không cần local AI service.

Để tiếp tục phát triển hoặc bàn giao giữa các agent, đọc và cập nhật [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) trước tiên.

## Thành phần

- **Zalo Mini App** cho nhân viên tạo, xem và phản hồi ticket.
- **Backend Node.js 20** gọi provider bằng native `fetch`, không thêm AI SDK.
- **AI Router V2** điều phối Gemini, Groq, OpenRouter và SambaNova.
- **AI Quality Control** lưu decision record, telemetry và phản hồi Đúng/Cần sửa của Admin.
- **Enterprise Playbook RAG** dùng BM25 lexical mặc định; Gemini embedding là tùy chọn.
- **Không phụ thuộc local AI** trong router, retrieval hoặc quy trình khởi động Windows.
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
| Cloud AI | Gemini/Groq/OpenRouter/SambaNova tùy chọn | 0 trong free tier; phụ thuộc quota hiện hành |
| Backend | PC/NAS/máy chủ sẵn có | 0 phí thuê mới |
| Database | JSON local | 0 |
| Dashboard | Static HTML/CSS/JS | 0 |
| Notification | Polling trong Mini App | 0 |
| HTTPS pilot | ngrok Free Dev Domain | 0, phù hợp test/pilot |

Lưu ý: vẫn có chi phí điện, Internet, vận hành máy và có thể cần domain nếu muốn URL production cố định. Mục tiêu của dự án là **không phát sinh phí SaaS/API/cloud mới**.

## Agent tự xử lý gì?

Ở v5.2, Agent chạy theo **Strict Escalation**. Hệ thống chỉ tự hướng dẫn khi tìm thấy Enterprise Playbook đã duyệt, procedure được phép hướng dẫn người dùng, rủi ro không cao và confidence đạt ngưỡng. Knowledge Base đơn lẻ không đủ quyền để Agent đưa checklist.

Khi request nằm ngoài Playbook, toàn bộ provider không sẵn sàng, Playbook yêu cầu kỹ thuật viên hoặc confidence thấp, hệ thống **escalate ngay** và không đưa gợi ý mơ hồ.

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
   ├── AI Router V2 → Gemini / Groq / OpenRouter / SambaNova
   ├── BM25 Playbook Retrieval → optional Gemini embeddings
   ├── Decision telemetry + Admin quality review
   └── Admin dashboard
```

Không bắt buộc API trả phí hoặc vector database managed. BM25 luôn hoạt động trong backend; semantic retrieval chỉ bật khi `PLAYBOOK_RETRIEVAL_MODE=hybrid` và `PLAYBOOK_EMBED_PROVIDER=gemini`.

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
├── PROJECT_HANDOFF.md             # Trạng thái và hướng dẫn tiếp tục dự án
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
AI_ROUTER_ENABLED=true
AI_PROVIDER_ORDER=gemini,groq,openrouter,sambanova
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
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

## 3. AI Router V2 và RAG

Chuỗi mặc định:

```text
Gemini → Groq → OpenRouter → SambaNova → Rules/HelpDesk
```

Router bỏ qua provider chưa bật/chưa có key, chuyển tiếp khi gặp `429`, timeout, `5xx`, JSON/schema lỗi hoặc confidence thấp, đồng thời lưu telemetry cho từng attempt. Các ngân sách request/token trong `.env` là giới hạn vận hành có thể chỉnh lại; quota thật vẫn do từng provider quyết định.

```env
AI_ROUTER_ENABLED=true
AI_PROVIDER_ORDER=gemini,groq,openrouter,sambanova
AI_ROUTING_POLICY=capability_then_free_quota
AI_CLOUD_ENABLED=true
AI_REDACTION_ENABLED=false
GEMINI_API_KEY=server-side-only
GROQ_API_KEY=server-side-only
OPENROUTER_API_KEY=server-side-only
SAMBANOVA_API_KEY=server-side-only
```

`AI_REDACTION_ENABLED=false` chỉ phù hợp môi trường mock hiện tại. API key luôn nằm trong `backend/.env`, không đưa vào Git, Mini App hoặc Admin JavaScript.

BM25 là retrieval mặc định và không cần AI service:

```env
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
```

Muốn thử hybrid bằng Gemini embedding:

```env
PLAYBOOK_RETRIEVAL_MODE=hybrid
PLAYBOOK_EMBED_PROVIDER=gemini
PLAYBOOK_EMBED_MODEL=gemini-embedding-001
PLAYBOOK_AUTO_INDEX=true
```

Rollback về single-provider:

```env
AI_ROUTER_ENABLED=false
AI_PROVIDER=rules
AI_CLOUD_ENABLED=false
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
```

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
- Xem dashboard chất lượng AI theo provider, độ trễ, escalation và lỗi provider.
- Admin đánh dấu quyết định AI **Đúng/Cần sửa** và áp dụng hiệu chỉnh category/priority/risk vào ticket.
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

## Enterprise Playbook RAG (v5)

Phiên bản v5 bổ sung 173 procedure đã chuẩn hóa và ưu tiên playbook doanh nghiệp trước Knowledge Base/kiến thức chung của model. Raw config Aruba/FortiGate/OS9700 không được đưa vào index và các secret đã được loại bỏ.

Cài baseline BM25:

```text
INSTALL_ENTERPRISE_PLAYBOOK.bat
```

Tài liệu chi tiết: `README_ENTERPRISE_PLAYBOOK.md` và `CHANGES_V5_ENTERPRISE_PLAYBOOK.md`.
