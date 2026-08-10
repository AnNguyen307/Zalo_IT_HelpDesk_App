# Upgrade to v5.14.0

Run these steps only after the UI review is approved and v5.14.0 is merged into `main`.

```powershell
git switch main
git status --short
git pull --ff-only origin main
git log -1 --oneline

cd .\backend
npm ci
npm start
```

Confirm `/health` reports version `5.14.0` and these features:

```text
warm-industrial-ui
signal-system
ticket-workspace-three-zone
employee-ai-detail-isolation
```

No database migration is required; schema remains version `9`.

Unlike backend-only releases, v5.14.0 changes the Zalo Mini App UI. After local validation, build and deploy the Mini App through the project's normal Zalo deployment flow:

```powershell
cd ..\miniapp
npm ci
npm run build
npm run deploy
```

Hard-refresh Admin with `Ctrl+F5` after restarting the backend.
