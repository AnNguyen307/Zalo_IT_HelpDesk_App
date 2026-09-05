# v5.18.5 — Login Copy and Focus Polish

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Scope

- Backend/Admin only.
- Replace promotional login copy with short, functional labels.
- Replace the nested blue input focus frame with a restrained neutral focus treatment.
- Preserve keyboard accessibility, password visibility, loading and error behavior from v5.18.4.

## Verification

- Login regression coverage validates the final copy and CSS override order.
- Full Backend/Admin test suite must pass before merge.
- Production HTML, CSS and JavaScript hashes must match the verified release assets.

## Deployment

- Deploy the existing Render service after merge to `main`.
- No PostgreSQL or SQL Server migration.
- Mini App remains v5.17.1 and does not require build or deployment.
- Mini App build/deployment: not required.
- Rollback target: Backend/Admin v5.18.4.
