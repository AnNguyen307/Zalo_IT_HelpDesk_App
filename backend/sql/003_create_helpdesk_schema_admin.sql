/*
ONE-TIME REPAIR FOR THE ERROR:
  CREATE SCHEMA failed
  Cannot find the user 'dbo', because it does not exist or you do not have permission.

Run this file in SQL Server Management Studio using an administrator account.
Do NOT paste it into PowerShell.
*/
USE ZaloHelpDesk;
GO

IF SCHEMA_ID(N'helpdesk') IS NULL
    EXEC(N'CREATE SCHEMA helpdesk AUTHORIZATION dbo');
GO

SELECT
    DB_NAME() AS database_name,
    SCHEMA_ID(N'helpdesk') AS helpdesk_schema_id,
    USER_NAME(principal_id) AS schema_owner
FROM sys.schemas
WHERE name = N'helpdesk';
GO
