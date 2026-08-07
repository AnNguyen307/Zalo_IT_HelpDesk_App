SET XACT_ABORT ON;
SET NOCOUNT ON;

IF OBJECT_ID(N'helpdesk.staff_accounts', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.staff_accounts (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_staff_accounts PRIMARY KEY,
        username nvarchar(80) NOT NULL,
        display_name nvarchar(120) NOT NULL,
        role nvarchar(30) NOT NULL CONSTRAINT DF_helpdesk_staff_accounts_role DEFAULT N'technician',
        password_hash nvarchar(512) NOT NULL,
        active bit NOT NULL CONSTRAINT DF_helpdesk_staff_accounts_active DEFAULT 1,
        session_version int NOT NULL CONSTRAINT DF_helpdesk_staff_accounts_session_version DEFAULT 1,
        last_login_at datetime2(3) NULL,
        created_by nvarchar(64) NOT NULL CONSTRAINT DF_helpdesk_staff_accounts_created_by DEFAULT N'',
        created_at datetime2(3) NOT NULL,
        updated_at datetime2(3) NOT NULL,
        row_version rowversion NOT NULL,
        CONSTRAINT UQ_helpdesk_staff_accounts_username UNIQUE (username),
        CONSTRAINT CK_helpdesk_staff_accounts_role CHECK (role IN (N'admin', N'technician', N'viewer'))
    );
END;

IF COL_LENGTH(N'helpdesk.tickets', N'assigned_to_id') IS NULL
    ALTER TABLE helpdesk.tickets ADD assigned_to_id nvarchar(64) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.tickets') AND name = N'IX_helpdesk_tickets_assigned_to_id')
    CREATE INDEX IX_helpdesk_tickets_assigned_to_id ON helpdesk.tickets(assigned_to_id, status, updated_at);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.tickets') AND name = N'IX_helpdesk_tickets_smart_queue')
    CREATE INDEX IX_helpdesk_tickets_smart_queue ON helpdesk.tickets(status, priority, updated_at) INCLUDE (assigned_to_id, assigned_to);

IF NOT EXISTS (SELECT 1 FROM helpdesk.schema_version WHERE version_number = 7)
    INSERT INTO helpdesk.schema_version(version_number, description)
    VALUES (7, N'v5.7 staff accounts, role-based operations, smart assignment and business-hours SLA');
