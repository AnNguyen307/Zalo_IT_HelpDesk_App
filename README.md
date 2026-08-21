# Zalo IT HelpDesk v5.16.3 — Admin Visual Refresh

Zalo IT HelpDesk là hệ thống ticket nội bộ gồm Zalo Mini App cho nhân viên, Node.js API + Admin cho HelpDesk, Enterprise Playbook RAG và Cloud AI Router có Rules fallback.

v5.16.3 làm mới các vùng vận hành chính của Admin: Tổng quan có banner tín hiệu động phản ánh trạng thái thật, Playbook được tổ chức theo luồng sẵn sàng → tra cứu → kết quả, và Hệ thống & AI ưu tiên sức khỏe runtime/provider trước dữ liệu chất lượng và sandbox. Các banner nguyên tắc/chuyển đổi cứng nhắc đã được loại bỏ; API và nghiệp vụ không thay đổi.

| Profile | Backend | Database | File đính kèm | Mục đích |
|---|---|---|---|---|
| `free-hosting` | Render Free | Supabase PostgreSQL state schema `1` | Supabase private Storage | Thử nghiệm/pilot không SLA |
| `nas` | Container trên NAS/server doanh nghiệp | SQL Server schema `10` | Docker volume/filesystem | Vận hành nội bộ ổn định |
| `local` | Node.js trên máy phát triển | JSON hoặc SQL Server | Filesystem | Phát triển và regression test |

Không profile nào được hard-code secret. Mini App chỉ chứa URL API public; `APP_SECRET`, Zalo App Secret, database credential, Supabase Secret Key và AI keys chỉ nằm ở backend secret store.

## Trạng thái release

- Backend: `5.16.3`
- Mini App metadata: `5.16.0`
- UI/UX: banner vận hành động, Playbook workspace và AI Control Plane theo Warm Industrial + Signal System
- SQL Server: schema `10`, không có migration mới
- PostgreSQL pilot: state schema `1`, không thay đổi
- Mini App không cần build hoặc deploy lại cho bản Admin-only này

## Kiến trúc

```text
Zalo Mini App (Zalo host)
        │ HTTPS + one-time invite / rolling device session
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
- Mã mời chỉ dùng một lần, mặc định hết hạn sau 24 giờ và chỉ được lưu dưới dạng HMAC hash.
- Refresh token gắn với một thiết bị, được xoay mỗi lần dùng và có thời hạn trượt tối đa 90 ngày.
- Thu hồi phiên trong Admin làm access token hiện tại mất hiệu lực ngay.

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

## Xác thực người dùng Mini App

Luồng mặc định:

1. Admin mở **Nhân sự → Mã mời nhân viên**, nhập mã nhân viên, tên và phòng ban.
2. Hệ thống hiển thị mã `XXXX-XXXX-XXXX` đúng một lần.
3. Nhân viên nhập mã đó trong Mini App để xác nhận thiết bị.
4. Các lần sau Mini App tự xoay refresh token; không gọi Zalo Graph và không hỏi lại mã.

Các biến kiểm soát:

```env
USER_ACCESS_TTL_MINUTES=60
USER_REFRESH_TTL_DAYS=90
USER_INVITE_TTL_HOURS=24
RATE_LIMIT_INVITE_MAX=10
```

Endpoint Zalo cũ vẫn được giữ để rollback tương thích, nhưng Mini App v5.16.0 không gửi Zalo access token và không phụ thuộc vị trí IP của Backend.

## Triển khai

- Free-hosting ưu tiên: [docs/deployment/FREE_HOSTING_V5_15.md](docs/deployment/FREE_HOSTING_V5_15.md)
- NAS chuẩn bị sẵn: [docs/deployment/NAS_V5_15.md](docs/deployment/NAS_V5_15.md)
- Thay đổi UI Backend v5.16.3: [docs/releases/v5.16.3/CHANGES_V5_16_3_ADMIN_VISUAL_REFRESH.md](docs/releases/v5.16.3/CHANGES_V5_16_3_ADMIN_VISUAL_REFRESH.md)
- Release/rollback: [docs/releases/v5.16.0/UPGRADE_V5_16_0_ONE_TIME_INVITES.md](docs/releases/v5.16.0/UPGRADE_V5_16_0_ONE_TIME_INVITES.md)
- Working agreement cho Agent: [AGENTS.md](AGENTS.md)

`render.yaml` để `autoDeployTrigger: off`: merge GitHub không tự ý phát hành. `deploy/nas/compose.yaml` chỉ bind backend vào `127.0.0.1:8080`; HTTPS cần named tunnel/reverse proxy riêng.

## Lưu ý free tier

Free-hosting là môi trường thử nghiệm:

- Render Free sleep khi idle và filesystem là ephemeral.
- Supabase Free có quota giới hạn, có thể pause khi ít hoạt động và không có downloadable backup managed.
- PostgreSQL pilot lưu state dạng JSONB transactionally; Playbook lifecycle governance quan hệ chỉ có đầy đủ trên SQL Server/NAS.
- Dataset free-hosting độc lập và mặc định rỗng. Không tự động copy dữ liệu/file local lên cloud.

Không dùng profile này cho dữ liệu nhạy cảm hoặc cam kết SLA doanh nghiệp.
