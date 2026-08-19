# Upgrade to v5.15.0

## Local Windows checkout

```powershell
cd <repository-root>
git switch main
git status --short
git pull --ff-only origin main
git log -1 --oneline

cd .\backend
npm ci
npm run check
npm test
```

Local SQL Server giữ schema `9`:

```powershell
npm run db:status
```

Không chạy `npm run db:migrate` nếu status đã là `9`.

## Free-hosting

Làm theo `docs/deployment/FREE_HOSTING_V5_15.md`. PostgreSQL state schema `1` được tạo bằng:

```text
npm run db:postgres:init
```

Render Blueprint chạy lệnh này idempotently trước backend start.

## Mini App

Sau khi URL backend hosted đã qua smoke test:

```powershell
cd .\miniapp
npm ci
# đặt VITE_API_BASE_URL trong miniapp/.env thành URL HTTPS mới
npm run build
npm run deploy
```

Không commit `miniapp/.env`, ZMP token hoặc backend URL tạm thời vào source.
