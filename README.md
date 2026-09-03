# Nguyễn Phan Trường An HelpDesk v5.18.6 — Official App Identity

Zalo IT HelpDesk là hệ thống ticket nội bộ gồm Zalo Mini App cho nhân viên, Node.js API + Admin cho HelpDesk, Enterprise Playbook RAG và Cloud AI Router có Rules fallback.

v5.18.6 đồng bộ tên ứng dụng đã được Zalo xác thực vào tài liệu công khai và metadata Mini App v5.17.2. Nhãn chức năng bên trong vẫn dùng `IT HelpDesk` ngắn gọn. Zalo Mini App phiên bản 33 đã hoàn tất Production Pilot, được xét duyệt và đang Live 100%.

Hướng dẫn thao tác cho nhân viên, HelpDesk và quản trị viên: [docs/guides/USER_GUIDE.md](docs/guides/USER_GUIDE.md).

| Profile | Backend | Database | File đính kèm | Mục đích |
|---|---|---|---|---|
| `free-hosting` | Render Free | Supabase PostgreSQL state schema `1` + Playbook Governance schema `1` | Supabase private Storage | Thử nghiệm/pilot không SLA |
| `nas` | Container trên NAS/server doanh nghiệp | SQL Server schema `10` | Docker volume/filesystem | Vận hành nội bộ ổn định |
| `local` | Node.js trên máy phát triển | JSON, PostgreSQL hoặc SQL Server | Filesystem | Phát triển và regression test |

Không profile nào được hard-code secret. Mini App chỉ chứa URL API public; `APP_SECRET`, Zalo App Secret, database credential, Supabase Secret Key và AI keys chỉ nằm ở backend secret store.

## Trạng thái release

- Backend/Admin: `5.18.6`
- Mini App metadata: `5.17.2`
- Zalo Mini App Production: phiên bản `33`, Live 100%
- Mini App dependency baseline: Vite `5.4.21`, ZMP SDK `2.53.0`, Nano ID `3.3.18`
- Cloud AI: `Gemini → Groq → OpenRouter → SambaNova`, có retry/failover kể cả khi HelpDesk chọn model ưu tiên
- SQL Server: schema `10`, không có migration mới
- PostgreSQL pilot: state schema `1` giữ nguyên; thêm Playbook Governance schema `1`
- Mini App phiên bản 33 đã được build, kiểm thử E2E, Zalo xét duyệt và publish Production

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

Endpoint Zalo cũ vẫn được giữ để rollback tương thích, nhưng Mini App v5.17.2 không gửi Zalo access token và không phụ thuộc vị trí IP của Backend.

## Triển khai

- Hướng dẫn sử dụng đầy đủ: [docs/guides/USER_GUIDE.md](docs/guides/USER_GUIDE.md)
- Official App Identity v5.18.6 / Mini App v5.17.2: [docs/releases/v5.18.6/CHANGES_V5_18_6_OFFICIAL_APP_IDENTITY.md](docs/releases/v5.18.6/CHANGES_V5_18_6_OFFICIAL_APP_IDENTITY.md)
- Account Menu Layer Hotfix v5.18.3: [docs/releases/v5.18.3/CHANGES_V5_18_3_ACCOUNT_MENU_LAYER.md](docs/releases/v5.18.3/CHANGES_V5_18_3_ACCOUNT_MENU_LAYER.md)
- Admin Mobile Responsive v5.18.2: [docs/releases/v5.18.2/CHANGES_V5_18_2_ADMIN_MOBILE_RESPONSIVE.md](docs/releases/v5.18.2/CHANGES_V5_18_2_ADMIN_MOBILE_RESPONSIVE.md)
- Free-hosting ưu tiên: [docs/deployment/FREE_HOSTING_V5_15.md](docs/deployment/FREE_HOSTING_V5_15.md)
- NAS chuẩn bị sẵn: [docs/deployment/NAS_V5_15.md](docs/deployment/NAS_V5_15.md)
- Production Pilot v5.17.1: [docs/releases/v5.17.1/CHANGES_V5_17_1_PRODUCTION_PILOT.md](docs/releases/v5.17.1/CHANGES_V5_17_1_PRODUCTION_PILOT.md)
- Checklist pilot v5.17.1: [docs/releases/v5.17.1/PRODUCTION_PILOT_CHECKLIST.md](docs/releases/v5.17.1/PRODUCTION_PILOT_CHECKLIST.md)
- PostgreSQL Playbook Governance v5.17.0: [docs/releases/v5.17.0/CHANGES_V5_17_0_POSTGRES_PLAYBOOK_GOVERNANCE.md](docs/releases/v5.17.0/CHANGES_V5_17_0_POSTGRES_PLAYBOOK_GOVERNANCE.md)
- Sidebar thích ứng Admin v5.16.9: [docs/releases/v5.16.9/CHANGES_V5_16_9_ADAPTIVE_ADMIN_SIDEBAR.md](docs/releases/v5.16.9/CHANGES_V5_16_9_ADAPTIVE_ADMIN_SIDEBAR.md)
- Menu Tài khoản Admin v5.16.8: [docs/releases/v5.16.8/CHANGES_V5_16_8_COMPACT_ACCOUNT_MENU.md](docs/releases/v5.16.8/CHANGES_V5_16_8_COMPACT_ACCOUNT_MENU.md)
- Banner Tổng quan Admin v5.16.7: [docs/releases/v5.16.7/CHANGES_V5_16_7_OVERVIEW_BANNER_FIT.md](docs/releases/v5.16.7/CHANGES_V5_16_7_OVERVIEW_BANNER_FIT.md)
- Bảo trì dependency Mini App v5.16.6: [docs/releases/v5.16.6/CHANGES_V5_16_6_MINIAPP_DEPENDENCY_SECURITY.md](docs/releases/v5.16.6/CHANGES_V5_16_6_MINIAPP_DEPENDENCY_SECURITY.md)
- UI Admin v5.16.5: [docs/releases/v5.16.5/CHANGES_V5_16_5_FUNCTIONAL_ADMIN_UI.md](docs/releases/v5.16.5/CHANGES_V5_16_5_FUNCTIONAL_ADMIN_UI.md)
- Độ ổn định Cloud AI v5.16.4: [docs/releases/v5.16.4/CHANGES_V5_16_4_AI_RELIABILITY.md](docs/releases/v5.16.4/CHANGES_V5_16_4_AI_RELIABILITY.md)
- Thay đổi UI Backend v5.16.3: [docs/releases/v5.16.3/CHANGES_V5_16_3_ADMIN_VISUAL_REFRESH.md](docs/releases/v5.16.3/CHANGES_V5_16_3_ADMIN_VISUAL_REFRESH.md)
- Release/rollback: [docs/releases/v5.16.0/UPGRADE_V5_16_0_ONE_TIME_INVITES.md](docs/releases/v5.16.0/UPGRADE_V5_16_0_ONE_TIME_INVITES.md)
- Working agreement cho Agent: [AGENTS.md](AGENTS.md)

`render.yaml` để `autoDeployTrigger: off`; workflow phát hành UI/UX sẽ chủ động deploy dịch vụ Render đã được chủ dự án phê duyệt sau khi merge và kiểm thử đạt. `deploy/nas/compose.yaml` chỉ bind backend vào `127.0.0.1:8080`; HTTPS cần named tunnel/reverse proxy riêng.

## Lưu ý free tier

Free-hosting là môi trường thử nghiệm:

- Render Free sleep khi idle và filesystem là ephemeral.
- Supabase Free có quota giới hạn, có thể pause khi ít hoạt động và không có downloadable backup managed.
- PostgreSQL pilot lưu ticket/runtime state dạng JSONB transactionally và Playbook lifecycle trong các bảng quan hệ chuẩn hóa riêng.
- Dataset free-hosting độc lập và mặc định rỗng. Không tự động copy dữ liệu/file local lên cloud.

Không dùng profile này cho dữ liệu nhạy cảm hoặc cam kết SLA doanh nghiệp.
