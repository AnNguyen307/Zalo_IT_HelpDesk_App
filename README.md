# Zalo IT HelpDesk v5.15.2 — Zalo Authentication Hotfix

Zalo IT HelpDesk là hệ thống ticket nội bộ gồm Zalo Mini App cho nhân viên, Node.js API + Admin cho HelpDesk, Enterprise Playbook RAG và Cloud AI Router có Rules fallback.

v5.15.2 là hotfix Backend cho đăng nhập Zalo trên bản Testing/Live. Backend nay yêu cầu rõ các trường Profile `id,name,picture` theo mẫu chính thức của Zalo; thiết kế **Warm Industrial + Signal System**, giới hạn lưu trữ và Mini App v5.15.1 không thay đổi.

| Profile | Backend | Database | File đính kèm | Mục đích |
|---|---|---|---|---|
| `free-hosting` | Render Free | Supabase PostgreSQL state schema `1` | Supabase private Storage | Thử nghiệm/pilot không SLA |
| `nas` | Container trên NAS/server doanh nghiệp | SQL Server schema `9` | Docker volume/filesystem | Vận hành nội bộ ổn định |
| `local` | Node.js trên máy phát triển | JSON hoặc SQL Server | Filesystem | Phát triển và regression test |

Không profile nào được hard-code secret. Mini App chỉ chứa URL API public; `APP_SECRET`, Zalo App Secret, database credential, Supabase Secret Key và AI keys chỉ nằm ở backend secret store.

## Trạng thái release

- Backend: `5.15.2`
- Mini App metadata: `5.15.1`
- UI/UX: không thay đổi so với bản v5.14.1 đã duyệt
- SQL Server: schema `9`, không có migration mới
- PostgreSQL pilot: state schema `1`, cần khởi tạo lần đầu
- Mini App cần deploy lại khi đổi `VITE_API_BASE_URL` sang URL backend mới

## Kiến trúc

```text
Zalo Mini App (Zalo host)
        │ HTTPS + verified Zalo identity
        ▼
Node.js Backend + Admin
   ├── Ticket / message / audit transactional state
   ├── Private attachment storage
   ├── Enterprise Playbook + Rules fallback
   └── Gemini → Groq → OpenRouter → SambaNova
```

Các bất biến vẫn được giữ:

- AI User chỉ hướng dẫn theo Playbook đã duyệt và strict escalation.
- Khi handoff cho kỹ thuật viên, AI User bị khóa; Staff Copilot vẫn là kênh nội bộ độc lập.
- Toàn bộ cloud provider lỗi vẫn phải tạo được ticket.
- Copilot/provider/confidence/internal routing không xuất hiện trên Client.
- Toàn hệ thống lưu tối đa 30 ticket; khi tạo ticket mới ở ngưỡng này, ticket `resolved`/`closed` cũ nhất được xóa.
- Không xóa ticket đang hoạt động; nếu cả 30 ticket đều đang hoạt động, ticket mới bị từ chối rõ ràng.
- Tổng ảnh/file tối đa 10 MB cho mỗi ticket, tính cộng dồn qua mọi lần upload/reply; file nằm ở private object storage/filesystem, không nằm trong database.

## Chạy local

Yêu cầu Node.js 20+.

```bash
cd backend
cp .env.example .env
npm ci
npm run check
npm test
npm start
```

Mặc định:

- API/health: `http://127.0.0.1:8080/health`
- Admin: `http://127.0.0.1:8080/admin`

Mini App:

```bash
cd miniapp
cp .env.example .env
npm ci
npm start
```

Browser preview dùng `VITE_API_BASE_URL=http://127.0.0.1:8080`. Điện thoại/Zalo phải dùng URL HTTPS truy cập được từ Internet.

## Xác thực Zalo hosted

Hosted profile dùng:

```env
ZALO_AUTH_MODE=zalo
ZALO_APP_SECRET=<backend-secret-only>
```

Backend tạo `appsecret_proof` HMAC-SHA256, gọi `https://graph.zalo.me/v2.0/me` và lấy `id/name/avatar` từ phản hồi đã xác minh. Nó không tin `userId` Client tự gửi.

`ZALO_AUTH_MODE=development` chỉ dành cho local và bị fail-fast khi dùng trong `free-hosting` hoặc `nas`.

## Triển khai

- Free-hosting ưu tiên: [docs/deployment/FREE_HOSTING_V5_15.md](docs/deployment/FREE_HOSTING_V5_15.md)
- NAS chuẩn bị sẵn: [docs/deployment/NAS_V5_15.md](docs/deployment/NAS_V5_15.md)
- Release/rollback: [docs/releases/v5.15.2/CHANGES_V5_15_2_ZALO_AUTH_PROFILE_FIELDS.md](docs/releases/v5.15.2/CHANGES_V5_15_2_ZALO_AUTH_PROFILE_FIELDS.md)
- Working agreement cho Agent: [AGENTS.md](AGENTS.md)

`render.yaml` để `autoDeployTrigger: off`: merge GitHub không tự ý phát hành. `deploy/nas/compose.yaml` chỉ bind backend vào `127.0.0.1:8080`; HTTPS cần named tunnel/reverse proxy riêng.

## Lưu ý free tier

Free-hosting là môi trường thử nghiệm:

- Render Free sleep khi idle và filesystem là ephemeral.
- Supabase Free có quota giới hạn, có thể pause khi ít hoạt động và không có downloadable backup managed.
- PostgreSQL pilot lưu state dạng JSONB transactionally; Playbook lifecycle governance quan hệ chỉ có đầy đủ trên SQL Server/NAS.
- Dataset free-hosting độc lập và mặc định rỗng. Không tự động copy dữ liệu/file local lên cloud.

Không dùng profile này cho dữ liệu nhạy cảm hoặc cam kết SLA doanh nghiệp.
