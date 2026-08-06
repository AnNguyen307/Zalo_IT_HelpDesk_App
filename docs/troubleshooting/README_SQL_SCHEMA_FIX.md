# SQL Server schema hotfix

This hotfix fixes migration failure when the application login has `db_ddladmin`
but cannot create a schema owned by `dbo`.

## Why it failed

The original migration ran:

```sql
CREATE SCHEMA helpdesk AUTHORIZATION dbo
```

The application login could run DDL, but it could not assign ownership to `dbo`.

## Fix

The migration now creates `helpdesk` under the current migration user. After the
migration, an administrator runs `002_harden_app_user_template.sql` to transfer schema
ownership to `dbo` and remove `db_ddladmin`.

## Existing failed installation

1. Extract this patch over the project.
2. In PowerShell, run from `backend`:

```powershell
npm run db:migrate
npm run db:status
npm run db:import-json -- --force
```

3. In SSMS, run `backend/sql/002_harden_app_user_template.sql` as administrator.
4. Restart the backend and check `/health`.

Alternative: before rerunning the original migration, an administrator may run
`003_create_helpdesk_schema_admin.sql` in SSMS.
