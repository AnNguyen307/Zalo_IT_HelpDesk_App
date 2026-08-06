/*
Run this template in SQL Server Management Studio using an administrator account.
Replace every CHANGE_ME value before running. Do not commit the real password.

For an existing database/login, skip this file and configure backend/.env directly.
*/

USE master;
GO

IF DB_ID(N'ZaloHelpDesk') IS NULL
    CREATE DATABASE ZaloHelpDesk;
GO

IF NOT EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = N'zalo_helpdesk_app')
    CREATE LOGIN zalo_helpdesk_app WITH PASSWORD = N'truongan123', CHECK_POLICY = ON, CHECK_EXPIRATION = ON;
GO

USE ZaloHelpDesk;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'zalo_helpdesk_app')
    CREATE USER zalo_helpdesk_app FOR LOGIN zalo_helpdesk_app;
GO

-- Initial migration requires DDL permission. After migration, revoke db_ddladmin.
ALTER ROLE db_datareader ADD MEMBER zalo_helpdesk_app;
ALTER ROLE db_datawriter ADD MEMBER zalo_helpdesk_app;
ALTER ROLE db_ddladmin ADD MEMBER zalo_helpdesk_app;
GO
