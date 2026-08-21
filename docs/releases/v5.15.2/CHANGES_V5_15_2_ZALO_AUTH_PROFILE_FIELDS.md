# v5.15.2 — Zalo Profile authentication hotfix

## Outcome

Backend direct Zalo authentication now calls the Profile API with the explicit query `fields=id,name,picture`, matching the current Zalo Mini App server-side login example. Previously the request omitted `fields`; a response without `id` was collapsed into the generic `Zalo token verification failed` error.

Rejected Profile responses now log only the HTTP status, numeric Zalo error code and whether an `id` was present. Access tokens, app secrets, user IDs, names and response bodies are never logged.

## Impact

- Backend version: `5.15.2`.
- Mini App remains compatible at `5.15.1`; no Mini App rebuild or deployment is required.
- SQL Server schema remains `9`.
- PostgreSQL state schema remains `1`.
- No database migration or data rewrite is required.
- UI/UX is unchanged.

## Validation

- Direct-auth regression coverage verifies both `appsecret_proof` and the required `fields` query.
- Run `npm ci`, `npm run check` and `npm test` in `backend`.
- Run a production Mini App build because the login flow crosses the Mini App/Backend boundary.
- After Render deploy, verify `/health` reports `5.15.2`, then open the existing Testing Version 29 and confirm Zalo login plus ticket creation.

## Rollback

Redeploy the previous Backend commit if the Zalo Profile request regresses. No database rollback is needed. Rolling back restores the request without explicit Profile fields and can reintroduce the Testing login failure.
