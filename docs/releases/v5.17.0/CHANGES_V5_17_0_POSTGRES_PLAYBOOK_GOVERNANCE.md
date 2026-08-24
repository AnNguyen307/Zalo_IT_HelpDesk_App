# v5.17.0 — PostgreSQL Playbook Governance

## Kết quả

Profile `free-hosting` nay dùng PostgreSQL cho toàn bộ Playbook Governance thay vì rơi về file tĩnh. Backend/Admin được nâng lên `5.17.0`; Mini App giữ nguyên `5.16.6` và không cần build hoặc publish lại.

Vòng đời được hỗ trợ thống nhất giữa PostgreSQL và SQL Server:

1. Admin hoặc Technician tạo/sửa Draft.
2. Người tạo gửi Submitted để Admin Review.
3. Chỉ Admin được Publish, Reject, thay đổi lifecycle hoặc Rollback.
4. Mỗi lần publish làm phiên bản Published trước đó thành Superseded.
5. RAG chỉ nạp phiên bản Published của procedure Active.

## Thiết kế dữ liệu

Migration `backend/sql/postgres/002_playbook_governance.sql` tạo các bảng chuẩn hóa:

- `helpdesk_playbook_procedures`: định danh và lifecycle hiện tại;
- `helpdesk_playbook_versions`: nội dung JSONB theo phiên bản, trạng thái review/publish và unique version number;
- `helpdesk_playbook_events`: audit trail append-only;
- `helpdesk_playbook_index_state`: trạng thái re-index;
- `helpdesk_schema_migrations`: dấu migration idempotent.

Mọi mutation chạy trong transaction `SERIALIZABLE`, dùng PostgreSQL advisory transaction lock và retry giới hạn cho serialization failure/deadlock. Partial unique index bảo đảm mỗi procedure chỉ có một phiên bản Published. Các bảng bật RLS và thu hồi quyền từ `PUBLIC`, `anon`, `authenticated`; backend tiếp tục truy cập qua database credential phía server.

PostgreSQL runtime state schema vẫn là `1`; SQL Server/NAS schema vẫn là `10`. Release không copy, xóa hoặc biến đổi ticket/attachment/runtime state hiện có.

## Khởi tạo và tương thích

Container Render chạy `npm run db:postgres:init` trước khi start. Script áp dụng tuần tự migration `001` và `002`, đều idempotent. Khi Governance sẵn sàng nhưng database chưa có procedure, backend import baseline 173 procedure đúng một lần và xếp hàng re-index. Nếu Governance tạm thời không khả dụng, file Playbook vẫn là fallback để giữ khả năng phục vụ.

Với môi trường PostgreSQL tự quản lý:

```bash
cd backend
DB_PROVIDER=postgres POSTGRES_URL='postgresql://...' npm run db:postgres:init
```

## Kiểm thử phát hành

- Syntax gate trực tiếp trên toàn bộ `src`, `scripts`, `public`: đạt.
- Regression `node --test test/*.test.mjs`: `134/134` đạt.
- Test v5.17.0 kiểm tra migration idempotent/RLS, transaction retry/rollback, phân quyền, guardrail high-risk, wiring startup/RAG/Render.
- Playbook benchmark: `Hit@1=0,90`, `Hit@5=1,00`, `MRR=0,95`.
- Credential scan trên staged diff: không phát hiện mẫu credential độ tin cậy cao.
- Render build phải hoàn tất `npm ci --omit=dev`, migration `001 + 002`, baseline seed và start backend.
- Runtime `/health` phải báo `version=5.17.0`, `playbookGovernance.ready=true`, `provider=postgres`, `schemaVersion=1`, nguồn Playbook `postgres-governance` và đủ 173 Published + Active procedure.

## Rollback

Rollback ứng dụng bằng cách deploy lại commit v5.16.9 và đặt `PLAYBOOK_GOVERNANCE_ENABLED=false` để dùng file fallback ngay. Không xóa các bảng Governance khi rollback: migration chỉ bổ sung, dữ liệu phiên bản/audit cần được giữ để deploy lại an toàn. SQL Server và Mini App không có thao tác rollback cho release này.
