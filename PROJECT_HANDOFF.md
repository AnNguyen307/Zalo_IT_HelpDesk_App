# Project Handoff — Nguyễn Phan Trường An HelpDesk

Tài liệu bàn giao sống cho người tiếp tục phát triển hoặc vận hành repository. Cập nhật khi trạng thái Production, schema, version, kiến trúc hoặc quy trình phát hành thay đổi.

## 1. Trạng thái hiện tại

| Hạng mục | Giá trị |
|---|---|
| Repository | `AnNguyen307/Zalo_IT_HelpDesk_App` |
| Nhánh chuẩn | `main` |
| Tên Zalo đã xác thực | `Nguyễn Phan Trường An HelpDesk` |
| Zalo Mini App ID | `4185582976193315701` |
| Mini App Production | Phiên bản `33`, Live 100% |
| Mini App source | `5.17.2` |
| Backend/Admin | `5.18.6` |
| Production Backend | `https://zalo-it-helpdesk-pilot.onrender.com` |
| Production profile | Render Free + Supabase Free |
| SQL Server schema | `10` |
| PostgreSQL state schema | `1` |
| PostgreSQL governance schema | `1` |
| Validation baseline | `154/154` backend tests + Mini App Production E2E version 33 |
| Migration đang chờ | Không |
| Mini App deploy đang chờ | Không |

Tài liệu hiện hành bắt đầu tại [docs/INDEX.md](docs/INDEX.md). Hồ sơ trong `docs/releases/` là lịch sử theo phiên bản, không tự động trở thành hướng dẫn vận hành hiện tại.

## 2. Những gì đang chạy

### Mini App

- Nhân viên đăng nhập bằng mã mời dùng một lần và rolling device session.
- Các tab chính: Trang chủ, Yêu cầu, Thông báo, Cá nhân.
- Ticket hỗ trợ hội thoại, file private, self-service, human handoff, reopen và rating.
- Production version 33 đã được Zalo duyệt và Publish 100%.

### Backend/Admin

- Node.js Backend, Admin responsive và trang đăng nhập đã tinh gọn.
- Account menu có lớp hiển thị riêng trên mobile.
- Ticket Workspace gồm queue, conversation, context/dispatch.
- RBAC: `admin`, `technician`, `viewer`.
- Reports, SLA, smart queues, CSV, Knowledge Base, Playbook Governance và AI quality.

### Zalo Bot

- Endpoint: `/api/webhooks/zalo-bot`.
- Production đã cấu hình Bot Token và webhook secret server-side.
- Bot ưu tiên Playbook, có bounded generative fallback và tự tạo ticket khi self-service thất bại.
- Webhook được đăng ký lại sau Render startup khi cấu hình Production cho phép.
- Render Free cold start vẫn là giới hạn vận hành thực tế.

## 3. Kiến trúc hiện hành

```text
Mini App / Admin / Zalo Bot
            │
            ▼
       Node.js API
       ├── Auth + RBAC + rate limit
       ├── Ticket/message/SLA/audit
       ├── Attachment authorization
       ├── Playbook Governance + retrieval
       ├── User AI Agent
       └── Staff Copilot
            │
     ┌──────┴──────┐
     ▼             ▼
Database       Private storage
```

Chi tiết: [System Overview](docs/architecture/SYSTEM_OVERVIEW.md).

## 4. Các bất biến phải giữ

1. Mọi cloud provider lỗi vẫn phải tạo được ticket hoặc bàn giao rõ ràng.
2. AI Agent kênh nhân viên chỉ dùng bước thuộc Playbook đã duyệt.
3. Staff Copilot không tự gửi, tự thực thi, đổi trạng thái hoặc đóng ticket.
4. Copilot/provider/model/confidence/internal routing không xuất hiện ở Employee API/UI.
5. Runtime Playbook chỉ dùng procedure `Published + Active`.
6. Technician được soạn/gửi duyệt nhưng chỉ Admin được publish/reject/rollback.
7. File private và quyền tải gắn với ticket.
8. Không xóa ticket đang hoạt động trong retention.
9. Secret không vào source, log, tài liệu, screenshot hoặc PR.
10. UI/docs-only release không có database migration.

## 5. AI và Playbook

Cloud route:

```text
Gemini → Groq → OpenRouter → SambaNova → Rules fallback
```

- Provider được chọn thủ công là ưu tiên đầu tiên, không phải điểm thất bại duy nhất; router vẫn failover qua cloud provider phù hợp còn lại.
- Missing quota header là `unknown`, không phải `0`.
- Không có Ollama/local model.
- Baseline retrieval là BM25 lexical; Gemini embedding hybrid là tùy chọn.
- Staff Copilot có `matched | partial | none`, đưa nhiều giả thuyết/hướng giải quyết và điều kiện dừng.

Chi tiết: [AI Agent](docs/components/README_AI_AGENT.md), [Enterprise Playbook](docs/components/README_ENTERPRISE_PLAYBOOK.md), [Playbook Lifecycle](docs/components/README_PLAYBOOK_LIFECYCLE.md).

## 6. Storage và retention

### Free-hosting Production

- PostgreSQL state-document adapter dùng transaction/revision.
- PostgreSQL Playbook Governance schema riêng.
- Attachment trong Supabase private bucket.
- Hard-cap 30 ticket, 8 file/ticket, 4 file mỗi phản hồi, 10 MB/ticket.
- Ticket terminal cũ nhất có thể bị loại khi cần chỗ; ticket active không bị tự xóa.

### NAS

- SQL Server schema `10`.
- Persistent Docker volume/filesystem cho attachment/index.
- Không public SQL Server `1433`.
- Chuyển dữ liệu giữa PostgreSQL pilot và SQL Server cần migration/đối soát riêng.

## 7. Authentication

- Mã mời: `XXXX-XXXX-XXXX`, dùng một lần, mặc định 24 giờ, lưu HMAC hash.
- Access token nhân viên: tối đa 60 phút.
- Refresh session: gắn thiết bị, rotation, tối đa 90 ngày.
- Revocation có hiệu lực ngay.
- Staff account dùng RBAC; không dùng chung tài khoản.
- Production Zalo verification thực hiện server-side.

## 8. Cấu hình quan trọng

Không ghi giá trị secret vào tài liệu. Các nhóm biến cần biết:

- Core: `APP_SECRET`, `DEPLOYMENT_PROFILE`, `ALLOWED_ORIGINS`.
- Database: `DB_PROVIDER`, `POSTGRES_URL`, `SQLSERVER_*`.
- Attachment: `ATTACHMENT_STORAGE_PROVIDER`, `SUPABASE_*`.
- Zalo: `ZALO_AUTH_MODE`, `ZALO_APP_SECRET`, `ZALO_MINI_APP_ID`.
- Bot: `ZALO_BOT_*`.
- AI: `AI_CLOUD_ENABLED`, `AI_PROVIDER_ORDER`, provider flags/keys.
- Playbook: `PLAYBOOK_RETRIEVAL_MODE`, `PLAYBOOK_GOVERNANCE_ENABLED`.
- Limits: `MAX_STORED_TICKETS`, `MAX_TICKET_ATTACHMENT_MB`.

Nguồn đầy đủ: `backend/.env.example`, `render.yaml`, `deploy/nas/.env.example`.

## 9. Validation

Backend/cross-system:

```powershell
cd .\backend
npm ci
npm run check
npm test
```

Playbook:

```powershell
npm run playbook:benchmark
```

Mini App:

```powershell
cd ..\miniapp
npm ci
npm run build
```

Release phải có credential scan, regression coverage phù hợp, migration statement, deployment statement và rollback.

## 10. Deploy hiện tại

- Render Blueprint: `render.yaml`, `autoDeployTrigger: off`.
- Render chạy image Backend bằng Node.js 22 Alpine, user không phải root.
- Container init PostgreSQL idempotent rồi mới start Backend.
- Mini App CI/CD nằm trong `.github/workflows/` và dùng ZMP CLI `4.0.3`.
- Mini App chỉ deploy khi có yêu cầu phát hành riêng.

Runbook: [docs/operations/OPERATIONS_RUNBOOK.md](docs/operations/OPERATIONS_RUNBOOK.md).

## 11. Khi bắt đầu một thay đổi mới

1. Đọc `AGENTS.md`, `README.md`, tài liệu hiện hành liên quan và release note gần nhất.
2. Kiểm tra `git status -sb`, nhánh và remote base.
3. Không đè thay đổi của chủ dự án.
4. Tạo nhánh tập trung.
5. Triển khai, test và cập nhật tài liệu.
6. Tạo PR có outcome, impact, validation, rollback.
7. Sau merge, xác minh `main`, version, schema và yêu cầu deploy.

## 12. Nợ kỹ thuật và hướng tiếp theo

- Chuyển Backend webhook sang hạ tầng always-on nếu cần phản hồi Bot thời gian thực ổn định.
- Thiết lập backup/restore được kiểm thử trước khi dùng dữ liệu quan trọng.
- Xây pipeline CI backend đầy đủ cho mọi PR, không chỉ Mini App deployment workflow.
- Đưa quota/circuit/queue state khỏi process memory nếu chạy multi-instance.
- Thiết kế migration có đối soát từ PostgreSQL pilot sang SQL Server/NAS khi cần.
- Xây monitoring/alerting và retention audit phù hợp môi trường doanh nghiệp.

## 13. Tài liệu ưu tiên

- [Documentation Index](docs/INDEX.md)
- [User Guide](docs/guides/USER_GUIDE.md)
- [Developer Guide](docs/development/DEVELOPER_GUIDE.md)
- [Deployment](docs/deployment/README.md)
- [Operations Runbook](docs/operations/OPERATIONS_RUNBOOK.md)
- [Security Guide](docs/security/SECURITY_GUIDE.md)
- [Troubleshooting](docs/troubleshooting/README.md)

Cập nhật lần cuối: 2026-09-03, theo Production Mini App version 33 và Backend/Admin `5.18.6`.
