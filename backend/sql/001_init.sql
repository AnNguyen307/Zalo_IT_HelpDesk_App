SET XACT_ABORT ON;
SET NOCOUNT ON;

IF SCHEMA_ID(N'helpdesk') IS NULL
    EXEC(N'CREATE SCHEMA helpdesk');

IF OBJECT_ID(N'helpdesk.schema_version', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.schema_version (
        version_number int NOT NULL CONSTRAINT PK_helpdesk_schema_version PRIMARY KEY,
        applied_at datetime2(3) NOT NULL CONSTRAINT DF_helpdesk_schema_version_applied_at DEFAULT SYSUTCDATETIME(),
        description nvarchar(300) NOT NULL
    );
END;

IF OBJECT_ID(N'helpdesk.users', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.users (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_users PRIMARY KEY,
        zalo_user_id nvarchar(200) NULL,
        name nvarchar(200) NOT NULL CONSTRAINT DF_helpdesk_users_name DEFAULT N'',
        avatar nvarchar(2048) NOT NULL CONSTRAINT DF_helpdesk_users_avatar DEFAULT N'',
        phone nvarchar(80) NOT NULL CONSTRAINT DF_helpdesk_users_phone DEFAULT N'',
        department nvarchar(200) NOT NULL CONSTRAINT DF_helpdesk_users_department DEFAULT N'',
        role nvarchar(30) NOT NULL CONSTRAINT DF_helpdesk_users_role DEFAULT N'user',
        created_at datetime2(3) NOT NULL,
        updated_at datetime2(3) NOT NULL,
        row_version rowversion NOT NULL
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.users') AND name = N'UX_helpdesk_users_zalo_user_id')
    CREATE UNIQUE INDEX UX_helpdesk_users_zalo_user_id ON helpdesk.users(zalo_user_id) WHERE zalo_user_id IS NOT NULL;

IF OBJECT_ID(N'helpdesk.tickets', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.tickets (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_tickets PRIMARY KEY,
        code nvarchar(50) NOT NULL,
        user_id nvarchar(64) NOT NULL,
        title nvarchar(160) NOT NULL,
        description nvarchar(max) NOT NULL,
        category nvarchar(40) NOT NULL,
        priority nvarchar(20) NOT NULL,
        risk nvarchar(20) NOT NULL,
        status nvarchar(30) NOT NULL,
        location nvarchar(160) NOT NULL CONSTRAINT DF_helpdesk_tickets_location DEFAULT N'',
        device nvarchar(160) NOT NULL CONSTRAINT DF_helpdesk_tickets_device DEFAULT N'',
        assigned_to nvarchar(120) NOT NULL CONSTRAINT DF_helpdesk_tickets_assigned_to DEFAULT N'',
        ai_analysis_json nvarchar(max) NULL,
        resolution nvarchar(1000) NOT NULL CONSTRAINT DF_helpdesk_tickets_resolution DEFAULT N'',
        satisfaction_json nvarchar(max) NULL,
        reopen_count int NOT NULL CONSTRAINT DF_helpdesk_tickets_reopen_count DEFAULT 0,
        last_reopened_at datetime2(3) NULL,
        sla_json nvarchar(max) NULL,
        created_at datetime2(3) NOT NULL,
        updated_at datetime2(3) NOT NULL,
        resolved_at datetime2(3) NULL,
        row_version rowversion NOT NULL,
        CONSTRAINT CK_helpdesk_tickets_ai_analysis_json CHECK (ai_analysis_json IS NULL OR ISJSON(ai_analysis_json) = 1),
        CONSTRAINT CK_helpdesk_tickets_satisfaction_json CHECK (satisfaction_json IS NULL OR ISJSON(satisfaction_json) = 1),
        CONSTRAINT CK_helpdesk_tickets_sla_json CHECK (sla_json IS NULL OR ISJSON(sla_json) = 1)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.tickets') AND name = N'UX_helpdesk_tickets_code')
    CREATE UNIQUE INDEX UX_helpdesk_tickets_code ON helpdesk.tickets(code);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.tickets') AND name = N'IX_helpdesk_tickets_user_updated')
    CREATE INDEX IX_helpdesk_tickets_user_updated ON helpdesk.tickets(user_id, updated_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.tickets') AND name = N'IX_helpdesk_tickets_status_updated')
    CREATE INDEX IX_helpdesk_tickets_status_updated ON helpdesk.tickets(status, updated_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.tickets') AND name = N'IX_helpdesk_tickets_priority_status')
    CREATE INDEX IX_helpdesk_tickets_priority_status ON helpdesk.tickets(priority, status, updated_at DESC);

IF OBJECT_ID(N'helpdesk.messages', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.messages (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_messages PRIMARY KEY,
        ticket_id nvarchar(64) NOT NULL,
        author_id nvarchar(64) NOT NULL,
        author_name nvarchar(200) NOT NULL,
        role nvarchar(30) NOT NULL,
        body nvarchar(max) NOT NULL,
        created_at datetime2(3) NOT NULL,
        CONSTRAINT FK_helpdesk_messages_ticket FOREIGN KEY (ticket_id) REFERENCES helpdesk.tickets(id) ON DELETE CASCADE
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.messages') AND name = N'IX_helpdesk_messages_ticket_created')
    CREATE INDEX IX_helpdesk_messages_ticket_created ON helpdesk.messages(ticket_id, created_at, id);

IF OBJECT_ID(N'helpdesk.attachments', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.attachments (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_attachments PRIMARY KEY,
        ticket_id nvarchar(64) NOT NULL,
        uploader_id nvarchar(64) NOT NULL,
        uploader_name nvarchar(200) NOT NULL,
        file_name nvarchar(180) NOT NULL,
        mime_type nvarchar(160) NOT NULL,
        size_bytes bigint NOT NULL,
        storage_path nvarchar(1024) NOT NULL,
        created_at datetime2(3) NOT NULL,
        CONSTRAINT FK_helpdesk_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES helpdesk.tickets(id) ON DELETE CASCADE,
        CONSTRAINT CK_helpdesk_attachments_size CHECK (size_bytes >= 0)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.attachments') AND name = N'IX_helpdesk_attachments_ticket_created')
    CREATE INDEX IX_helpdesk_attachments_ticket_created ON helpdesk.attachments(ticket_id, created_at, id);

IF OBJECT_ID(N'helpdesk.notifications', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.notifications (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_notifications PRIMARY KEY,
        user_id nvarchar(64) NOT NULL,
        ticket_id nvarchar(64) NULL,
        type nvarchar(40) NOT NULL,
        title nvarchar(160) NOT NULL,
        body nvarchar(1000) NOT NULL,
        read_at datetime2(3) NULL,
        created_at datetime2(3) NOT NULL
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.notifications') AND name = N'IX_helpdesk_notifications_user_read_created')
    CREATE INDEX IX_helpdesk_notifications_user_read_created ON helpdesk.notifications(user_id, read_at, created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.notifications') AND name = N'IX_helpdesk_notifications_ticket')
    CREATE INDEX IX_helpdesk_notifications_ticket ON helpdesk.notifications(ticket_id) WHERE ticket_id IS NOT NULL;

IF OBJECT_ID(N'helpdesk.ticket_history', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.ticket_history (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_ticket_history PRIMARY KEY,
        ticket_id nvarchar(64) NOT NULL,
        actor_id nvarchar(64) NOT NULL,
        actor_name nvarchar(200) NOT NULL,
        type nvarchar(50) NOT NULL,
        from_value nvarchar(200) NULL,
        to_value nvarchar(200) NULL,
        note nvarchar(1000) NOT NULL CONSTRAINT DF_helpdesk_ticket_history_note DEFAULT N'',
        created_at datetime2(3) NOT NULL,
        CONSTRAINT FK_helpdesk_ticket_history_ticket FOREIGN KEY (ticket_id) REFERENCES helpdesk.tickets(id) ON DELETE CASCADE
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.ticket_history') AND name = N'IX_helpdesk_ticket_history_ticket_created')
    CREATE INDEX IX_helpdesk_ticket_history_ticket_created ON helpdesk.ticket_history(ticket_id, created_at, id);

IF OBJECT_ID(N'helpdesk.knowledge_base', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.knowledge_base (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_knowledge_base PRIMARY KEY,
        slug nvarchar(200) NOT NULL,
        title nvarchar(180) NOT NULL,
        category nvarchar(40) NOT NULL,
        keywords_json nvarchar(max) NOT NULL,
        risk nvarchar(20) NOT NULL,
        auto_eligible bit NOT NULL,
        summary nvarchar(1000) NOT NULL CONSTRAINT DF_helpdesk_knowledge_base_summary DEFAULT N'',
        steps_json nvarchar(max) NOT NULL,
        active bit NOT NULL,
        created_at datetime2(3) NOT NULL,
        updated_at datetime2(3) NOT NULL,
        row_version rowversion NOT NULL,
        CONSTRAINT CK_helpdesk_knowledge_base_keywords_json CHECK (ISJSON(keywords_json) = 1),
        CONSTRAINT CK_helpdesk_knowledge_base_steps_json CHECK (ISJSON(steps_json) = 1)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.knowledge_base') AND name = N'UX_helpdesk_knowledge_base_slug')
    CREATE UNIQUE INDEX UX_helpdesk_knowledge_base_slug ON helpdesk.knowledge_base(slug);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.knowledge_base') AND name = N'IX_helpdesk_knowledge_base_active_category')
    CREATE INDEX IX_helpdesk_knowledge_base_active_category ON helpdesk.knowledge_base(active, category, updated_at DESC);

IF OBJECT_ID(N'helpdesk.audit_log', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.audit_log (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_audit_log PRIMARY KEY,
        actor nvarchar(64) NOT NULL,
        action nvarchar(80) NOT NULL,
        entity_type nvarchar(80) NOT NULL,
        entity_id nvarchar(128) NOT NULL,
        detail_json nvarchar(max) NOT NULL,
        created_at datetime2(3) NOT NULL,
        CONSTRAINT CK_helpdesk_audit_log_detail_json CHECK (ISJSON(detail_json) = 1)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.audit_log') AND name = N'IX_helpdesk_audit_log_created')
    CREATE INDEX IX_helpdesk_audit_log_created ON helpdesk.audit_log(created_at DESC, id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.audit_log') AND name = N'IX_helpdesk_audit_log_entity')
    CREATE INDEX IX_helpdesk_audit_log_entity ON helpdesk.audit_log(entity_type, entity_id, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM helpdesk.schema_version WHERE version_number = 1)
    INSERT INTO helpdesk.schema_version(version_number, description)
    VALUES (1, N'Initial SQL Server schema for Zalo IT HelpDesk v5.3');
