SET XACT_ABORT ON;
SET NOCOUNT ON;

IF OBJECT_ID(N'helpdesk.user_invites', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.user_invites (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_user_invites PRIMARY KEY,
        employee_code nvarchar(40) NOT NULL,
        display_name nvarchar(120) NOT NULL,
        department nvarchar(120) NOT NULL CONSTRAINT DF_helpdesk_user_invites_department DEFAULT N'',
        code_hash char(64) NOT NULL,
        created_by nvarchar(64) NOT NULL,
        created_at datetime2(3) NOT NULL,
        expires_at datetime2(3) NOT NULL,
        used_at datetime2(3) NULL,
        used_by_user_id nvarchar(64) NULL,
        revoked_at datetime2(3) NULL,
        revoked_by nvarchar(64) NULL,
        revoke_reason nvarchar(80) NOT NULL CONSTRAINT DF_helpdesk_user_invites_revoke_reason DEFAULT N''
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.user_invites') AND name = N'UX_helpdesk_user_invites_code_hash')
    CREATE UNIQUE INDEX UX_helpdesk_user_invites_code_hash ON helpdesk.user_invites(code_hash);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.user_invites') AND name = N'IX_helpdesk_user_invites_employee_created')
    CREATE INDEX IX_helpdesk_user_invites_employee_created ON helpdesk.user_invites(employee_code, created_at DESC);

IF OBJECT_ID(N'helpdesk.user_refresh_sessions', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.user_refresh_sessions (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_user_refresh_sessions PRIMARY KEY,
        user_id nvarchar(64) NOT NULL,
        device_hash char(64) NOT NULL,
        token_hash char(64) NOT NULL,
        expires_at datetime2(3) NOT NULL,
        created_at datetime2(3) NOT NULL,
        last_refreshed_at datetime2(3) NOT NULL,
        revoked_at datetime2(3) NULL,
        revoked_by nvarchar(64) NULL,
        revoke_reason nvarchar(80) NOT NULL CONSTRAINT DF_helpdesk_user_refresh_sessions_revoke_reason DEFAULT N'',
        CONSTRAINT FK_helpdesk_user_refresh_sessions_user FOREIGN KEY (user_id) REFERENCES helpdesk.users(id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.user_refresh_sessions') AND name = N'IX_helpdesk_user_refresh_sessions_user_active')
    CREATE INDEX IX_helpdesk_user_refresh_sessions_user_active ON helpdesk.user_refresh_sessions(user_id, revoked_at, expires_at DESC);

IF NOT EXISTS (SELECT 1 FROM helpdesk.schema_version WHERE version_number = 10)
    INSERT INTO helpdesk.schema_version(version_number, description)
    VALUES (10, N'One-time employee invites and rolling device refresh sessions');
GO
