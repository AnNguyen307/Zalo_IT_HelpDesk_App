# v5.15.0 — Production Deployment Foundation

## Outcome

Một codebase hiện hỗ trợ hai profile triển khai: free-hosting pilot ưu tiên trước và NAS enterprise chuẩn bị sẵn. Release không tự deploy service, tạo secret, chạy migration cloud hoặc publish Zalo Mini App.

## Thay đổi

- Sửa Docker image: `npm ci --omit=dev`, copy đúng runtime assets, không copy `data`, chạy non-root, health check.
- PostgreSQL state adapter có transaction row lock, revision, status counts và state schema `1`.
- Supabase private Storage adapter tách file khỏi filesystem ephemeral.
- Render Blueprint Free, Singapore, auto-deploy off, secret `sync: false`.
- NAS Compose read-only root filesystem, persistent `/app/data`, localhost binding và no-new-privileges.
- Hosted configuration fail-fast cho CORS wildcard, APP_SECRET mặc định, development Zalo auth, sai database/storage profile và cloud AI chưa redaction.
- Direct Zalo authentication bằng `appsecret_proof`; profile lấy từ Zalo Open API và không tin claimed `userId`.
- Bounded rate limiting cho auth/write/upload endpoint, trả `429` + `Retry-After`.
- SQL bootstrap credential trong source được thay bằng placeholder `CHANGE_ME`.
- Backend/Admin/Mini App metadata đồng bộ `5.15.0`.

## Data/schema

- SQL Server/NAS: giữ schema version `9`; không có SQL Server migration mới.
- PostgreSQL/free-hosting: migration mới `sql/postgres/001_state_store.sql`, tạo state schema `1`.
- File metadata vẫn nằm trong state/database; binary nằm trong Supabase Storage hoặc filesystem volume.
- Không tự động di chuyển dữ liệu local lên cloud.

## Validation

- Syntax check cho backend/runtime/deployment modules.
- Regression test cho config fail-fast, Postgres serial transactions, filesystem/Supabase bytes, manifest safety, direct Zalo proof/mismatch và existing behavior.
- Production Mini App build bắt buộc vì system version và backend URL handoff.
- Docker build/smoke cần được chạy nếu Docker daemon khả dụng.

## Rollback

1. Không đổi/deploy Mini App nếu backend hosted chưa đạt smoke test.
2. Nếu đã đổi, restore `VITE_API_BASE_URL` về backend trước đó và deploy lại Mini App.
3. Tắt Render service; giữ nguyên Supabase project để điều tra/backup.
4. Revert source về v5.14.1/v5.14.0; SQL Server schema `9` không cần rollback.
5. Không xóa PostgreSQL table, Supabase bucket, SQL database hoặc NAS volume trong rollback.

## Known limitations

- Render/Supabase Free có cold start, pause/quota và không có SLA.
- PostgreSQL state document phù hợp pilot nhỏ, không thay normalized SQL Server enterprise schema.
- SQL Server Playbook lifecycle governance chưa được port sang PostgreSQL pilot.
- In-memory rate limiter phù hợp một free/NAS instance; multi-instance production cần distributed limiter.
