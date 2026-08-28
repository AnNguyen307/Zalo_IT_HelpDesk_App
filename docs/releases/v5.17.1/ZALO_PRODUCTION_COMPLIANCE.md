# v5.17.1 — Zalo Production Compliance

## Outcome

This backend-only compliance hardening completes the public artifacts and server behavior required by the Zalo Mini App Production review flow:

- Public Terms of Use: `/legal/terms.html`
- Public Privacy Policy: `/legal/privacy.html`
- Public support email: `nguyenphantruongan123@gmail.com`
- Official Mini App name: `Nguyễn Phan Trường An HelpDesk`
- Owner display: `Nguyễn Phan Trường An` (individual owner)
- Webhook endpoint: `/api/webhooks/zalo`
- Supported event: `user.revoke.consent`
- Signature verification: SHA-256 over alphabetically ordered payload values plus `ZALO_OPEN_API_KEY`, compared with `X-ZEvent-Signature`
- Data erasure: removes the matching user, access records, tickets, messages, attachments, notifications, history, Copilot runs and related audit details
- Durable attachment deletion: failed object-storage cleanup remains queued and is retried at backend startup

## Render configuration

Non-secret:

```text
ZALO_MINI_APP_ID=4185582976193315701
```

Secret, configured only after Zalo generates the Open API Key:

```text
ZALO_OPEN_API_KEY=<generated in Zalo Open APIs>
```

Never commit, log, screenshot or place the Open API Key in the Mini App frontend.

The Zalo Open APIs `IP Access` list must use every outbound CIDR shown for the Render service under `Connect -> Outbound`. It must not use the developer workstation's public IP.

## Verification

- `GET /api/webhooks/zalo` returns endpoint readiness without exposing secrets.
- `POST /api/webhooks/zalo` rejects a missing or invalid signature.
- A valid `user.revoke.consent` event is idempotent and removes related user data.
- `/health` exposes `privacy.configured` and the feature markers `zalo-consent-revocation-webhook`, `signed-webhook-verification` and `privacy-data-erasure`.
- Regression coverage: `backend/test/zalo-webhook-v5171.test.mjs`.

## Deployment impact

- Backend/Admin Render deploy: required.
- Mini App rebuild/deploy: not required; no Mini App source or backend URL changed.
- Database migration: not required. Existing state schema and PostgreSQL Playbook Governance schema remain version 1; SQL Server schema remains version 10.

## Rollback

Roll back the Render service to the previous v5.17.1 image if the new backend fails its health or regression checks. Do not enter the webhook URL in Zalo until the deployed endpoint returns HTTP 200. If an Open API Key has already been generated, preserve it in Render and do not expose it during rollback.
