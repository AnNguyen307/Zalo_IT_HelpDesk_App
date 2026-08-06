/*
Run this file in SQL Server Management Studio with a database administrator account
after 001_init.sql has completed successfully.

Replace the application user if you chose a different login.
This transfers schema ownership to dbo, then removes temporary DDL permission while
retaining normal runtime read/write access.
*/
USE ZaloHelpDesk;
GO

IF SCHEMA_ID(N'helpdesk') IS NOT NULL
    ALTER AUTHORIZATION ON SCHEMA::helpdesk TO dbo;
GO

IF IS_ROLEMEMBER(N'db_ddladmin', N'zalo_helpdesk_app') = 1
    ALTER ROLE db_ddladmin DROP MEMBER zalo_helpdesk_app;
GO

-- db_datareader and db_datawriter are sufficient for the current runtime.
-- Before a future schema migration, temporarily add db_ddladmin again.
