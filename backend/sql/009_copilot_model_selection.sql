USE ZaloHelpDesk;
GO

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF COL_LENGTH(N'helpdesk.ai_copilot_runs', N'requested_provider_key') IS NULL
BEGIN
    ALTER TABLE helpdesk.ai_copilot_runs
      ADD requested_provider_key nvarchar(30) NOT NULL
        CONSTRAINT DF_helpdesk_ai_copilot_runs_requested_provider DEFAULT N'auto';
END;
GO

IF COL_LENGTH(N'helpdesk.ai_copilot_runs', N'requested_model') IS NULL
BEGIN
    ALTER TABLE helpdesk.ai_copilot_runs
      ADD requested_model nvarchar(200) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'helpdesk.ai_copilot_runs')
      AND name = N'CK_helpdesk_ai_copilot_runs_requested_provider'
)
BEGIN
    ALTER TABLE helpdesk.ai_copilot_runs WITH CHECK
      ADD CONSTRAINT CK_helpdesk_ai_copilot_runs_requested_provider
      CHECK (requested_provider_key IN (N'auto', N'gemini', N'groq', N'openrouter', N'sambanova'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM helpdesk.schema_version WHERE version_number = 9)
BEGIN
    INSERT INTO helpdesk.schema_version(version_number, description)
    VALUES (9, N'Staff Copilot model selection with requested and actual model audit');
END;
GO
