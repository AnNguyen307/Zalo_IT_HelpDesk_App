USE ZaloHelpDesk;
GO
SET XACT_ABORT ON;
SET NOCOUNT ON;

IF SCHEMA_ID(N'helpdesk') IS NULL
    EXEC(N'CREATE SCHEMA helpdesk');

IF OBJECT_ID(N'helpdesk.playbook_procedures', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.playbook_procedures (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_playbook_procedures PRIMARY KEY,
        code nvarchar(100) NOT NULL,
        title nvarchar(220) NOT NULL,
        category nvarchar(50) NOT NULL,
        audience nvarchar(30) NOT NULL,
        lifecycle_status nvarchar(30) NOT NULL CONSTRAINT DF_helpdesk_playbook_procedures_status DEFAULT N'active',
        current_version_id nvarchar(64) NULL,
        owner_id nvarchar(64) NOT NULL CONSTRAINT DF_helpdesk_playbook_procedures_owner DEFAULT N'',
        owner_name nvarchar(200) NOT NULL CONSTRAINT DF_helpdesk_playbook_procedures_owner_name DEFAULT N'',
        created_by nvarchar(64) NOT NULL,
        created_by_name nvarchar(200) NOT NULL,
        created_at datetime2(3) NOT NULL,
        updated_at datetime2(3) NOT NULL,
        row_version rowversion NOT NULL,
        CONSTRAINT CK_helpdesk_playbook_procedure_status CHECK (lifecycle_status IN (N'active',N'deprecated',N'archived'))
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.playbook_procedures') AND name = N'UX_helpdesk_playbook_procedures_code')
    CREATE UNIQUE INDEX UX_helpdesk_playbook_procedures_code ON helpdesk.playbook_procedures(code);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.playbook_procedures') AND name = N'IX_helpdesk_playbook_procedures_status_updated')
    CREATE INDEX IX_helpdesk_playbook_procedures_status_updated ON helpdesk.playbook_procedures(lifecycle_status, updated_at DESC);

IF OBJECT_ID(N'helpdesk.playbook_versions', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.playbook_versions (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_playbook_versions PRIMARY KEY,
        procedure_id nvarchar(64) NOT NULL,
        version_number int NOT NULL,
        status nvarchar(30) NOT NULL,
        content_json nvarchar(max) NOT NULL,
        change_summary nvarchar(1000) NOT NULL CONSTRAINT DF_helpdesk_playbook_versions_change DEFAULT N'',
        source_ticket_id nvarchar(64) NULL,
        created_by nvarchar(64) NOT NULL,
        created_by_name nvarchar(200) NOT NULL,
        created_by_role nvarchar(30) NOT NULL,
        submitted_at datetime2(3) NULL,
        reviewed_by nvarchar(64) NULL,
        reviewed_by_name nvarchar(200) NULL,
        reviewed_at datetime2(3) NULL,
        review_note nvarchar(1000) NOT NULL CONSTRAINT DF_helpdesk_playbook_versions_review DEFAULT N'',
        published_at datetime2(3) NULL,
        created_at datetime2(3) NOT NULL,
        updated_at datetime2(3) NOT NULL,
        row_version rowversion NOT NULL,
        CONSTRAINT FK_helpdesk_playbook_versions_procedure FOREIGN KEY (procedure_id) REFERENCES helpdesk.playbook_procedures(id) ON DELETE CASCADE,
        CONSTRAINT CK_helpdesk_playbook_versions_status CHECK (status IN (N'draft',N'submitted',N'rejected',N'published',N'superseded',N'archived')),
        CONSTRAINT CK_helpdesk_playbook_versions_content_json CHECK (ISJSON(content_json) = 1),
        CONSTRAINT UQ_helpdesk_playbook_versions_number UNIQUE (procedure_id, version_number)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.playbook_versions') AND name = N'IX_helpdesk_playbook_versions_status_updated')
    CREATE INDEX IX_helpdesk_playbook_versions_status_updated ON helpdesk.playbook_versions(status, updated_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.playbook_versions') AND name = N'IX_helpdesk_playbook_versions_procedure_version')
    CREATE INDEX IX_helpdesk_playbook_versions_procedure_version ON helpdesk.playbook_versions(procedure_id, version_number DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.playbook_versions') AND name = N'UX_helpdesk_playbook_versions_published')
    CREATE UNIQUE INDEX UX_helpdesk_playbook_versions_published ON helpdesk.playbook_versions(procedure_id) WHERE status = N'published';

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_helpdesk_playbook_procedures_current_version')
BEGIN
    ALTER TABLE helpdesk.playbook_procedures
      ADD CONSTRAINT FK_helpdesk_playbook_procedures_current_version
      FOREIGN KEY (current_version_id) REFERENCES helpdesk.playbook_versions(id);
END;

IF OBJECT_ID(N'helpdesk.playbook_events', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.playbook_events (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_playbook_events PRIMARY KEY,
        procedure_id nvarchar(64) NOT NULL,
        version_id nvarchar(64) NULL,
        action nvarchar(50) NOT NULL,
        actor_id nvarchar(64) NOT NULL,
        actor_name nvarchar(200) NOT NULL,
        actor_role nvarchar(30) NOT NULL,
        detail_json nvarchar(max) NOT NULL CONSTRAINT DF_helpdesk_playbook_events_detail DEFAULT N'{}',
        created_at datetime2(3) NOT NULL,
        CONSTRAINT FK_helpdesk_playbook_events_procedure FOREIGN KEY (procedure_id) REFERENCES helpdesk.playbook_procedures(id) ON DELETE CASCADE,
        CONSTRAINT CK_helpdesk_playbook_events_detail_json CHECK (ISJSON(detail_json) = 1)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'helpdesk.playbook_events') AND name = N'IX_helpdesk_playbook_events_procedure_created')
    CREATE INDEX IX_helpdesk_playbook_events_procedure_created ON helpdesk.playbook_events(procedure_id, created_at DESC);

IF OBJECT_ID(N'helpdesk.playbook_index_state', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.playbook_index_state (
        state_id int NOT NULL CONSTRAINT PK_helpdesk_playbook_index_state PRIMARY KEY,
        status nvarchar(30) NOT NULL,
        requested_at datetime2(3) NULL,
        requested_by nvarchar(200) NOT NULL CONSTRAINT DF_helpdesk_playbook_index_requested_by DEFAULT N'',
        started_at datetime2(3) NULL,
        completed_at datetime2(3) NULL,
        source_fingerprint nvarchar(128) NOT NULL CONSTRAINT DF_helpdesk_playbook_index_fingerprint DEFAULT N'',
        indexed_entries int NOT NULL CONSTRAINT DF_helpdesk_playbook_index_entries DEFAULT 0,
        error_message nvarchar(2000) NOT NULL CONSTRAINT DF_helpdesk_playbook_index_error DEFAULT N'',
        updated_at datetime2(3) NOT NULL,
        CONSTRAINT CK_helpdesk_playbook_index_status CHECK (status IN (N'idle',N'queued',N'building',N'ready',N'failed'))
    );
END;

IF NOT EXISTS (SELECT 1 FROM helpdesk.playbook_index_state WHERE state_id = 1)
    INSERT INTO helpdesk.playbook_index_state(state_id,status,updated_at) VALUES (1,N'idle',SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM helpdesk.schema_version WHERE version_number = 4)
    INSERT INTO helpdesk.schema_version(version_number, description) VALUES (4, N'Playbook lifecycle governance and automatic semantic reindex');
