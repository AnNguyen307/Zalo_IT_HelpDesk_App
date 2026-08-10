USE ZaloHelpDesk;
GO

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'helpdesk.ai_copilot_runs', N'U') IS NULL
BEGIN
    CREATE TABLE helpdesk.ai_copilot_runs (
        id nvarchar(64) NOT NULL CONSTRAINT PK_helpdesk_ai_copilot_runs PRIMARY KEY,
        ticket_id nvarchar(64) NOT NULL,
        trigger_name nvarchar(80) NOT NULL CONSTRAINT DF_helpdesk_ai_copilot_runs_trigger DEFAULT N'manual',
        provider nvarchar(100) NOT NULL CONSTRAINT DF_helpdesk_ai_copilot_runs_provider DEFAULT N'',
        model nvarchar(200) NULL,
        suggestion_json nvarchar(max) NULL,
        playbook_ids_json nvarchar(max) NOT NULL CONSTRAINT DF_helpdesk_ai_copilot_runs_playbook_ids DEFAULT N'[]',
        confidence decimal(6,5) NULL,
        telemetry_json nvarchar(max) NULL,
        status nvarchar(30) NOT NULL CONSTRAINT DF_helpdesk_ai_copilot_runs_status DEFAULT N'queued',
        error_message nvarchar(1000) NOT NULL CONSTRAINT DF_helpdesk_ai_copilot_runs_error DEFAULT N'',
        requested_by nvarchar(64) NOT NULL,
        requested_by_name nvarchar(200) NOT NULL,
        created_at datetime2(3) NOT NULL,
        started_at datetime2(3) NULL,
        completed_at datetime2(3) NULL,
        row_version rowversion NOT NULL,
        CONSTRAINT FK_helpdesk_ai_copilot_runs_ticket FOREIGN KEY (ticket_id) REFERENCES helpdesk.tickets(id) ON DELETE CASCADE,
        CONSTRAINT CK_helpdesk_ai_copilot_runs_suggestion CHECK (suggestion_json IS NULL OR ISJSON(suggestion_json) = 1),
        CONSTRAINT CK_helpdesk_ai_copilot_runs_playbook_ids CHECK (ISJSON(playbook_ids_json) = 1),
        CONSTRAINT CK_helpdesk_ai_copilot_runs_telemetry CHECK (telemetry_json IS NULL OR ISJSON(telemetry_json) = 1),
        CONSTRAINT CK_helpdesk_ai_copilot_runs_status CHECK (status IN (N'queued', N'running', N'completed', N'failed')),
        CONSTRAINT CK_helpdesk_ai_copilot_runs_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'helpdesk.ai_copilot_runs')
      AND name = N'IX_helpdesk_ai_copilot_runs_ticket_created'
)
    CREATE INDEX IX_helpdesk_ai_copilot_runs_ticket_created
      ON helpdesk.ai_copilot_runs(ticket_id, created_at DESC, id);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'helpdesk.ai_copilot_runs')
      AND name = N'IX_helpdesk_ai_copilot_runs_status_created'
)
    CREATE INDEX IX_helpdesk_ai_copilot_runs_status_created
      ON helpdesk.ai_copilot_runs(status, created_at, id);
GO

IF NOT EXISTS (SELECT 1 FROM helpdesk.schema_version WHERE version_number = 8)
BEGIN
    INSERT INTO helpdesk.schema_version(version_number, description)
    VALUES (8, N'Staff-only AI Copilot channel with isolated suggestions and telemetry');
END;
GO
