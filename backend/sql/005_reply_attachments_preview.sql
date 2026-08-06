USE ZaloHelpDesk;
GO

SET XACT_ABORT ON;
SET NOCOUNT ON;

IF COL_LENGTH(N'helpdesk.attachments', N'message_id') IS NULL
BEGIN
    ALTER TABLE helpdesk.attachments ADD message_id nvarchar(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_helpdesk_attachments_message'
)
BEGIN
    ALTER TABLE helpdesk.attachments WITH CHECK
      ADD CONSTRAINT FK_helpdesk_attachments_message
      FOREIGN KEY (message_id) REFERENCES helpdesk.messages(id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'helpdesk.attachments')
      AND name = N'IX_helpdesk_attachments_message_created'
)
BEGIN
    CREATE INDEX IX_helpdesk_attachments_message_created
      ON helpdesk.attachments(message_id, created_at, id)
      WHERE message_id IS NOT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM helpdesk.schema_version WHERE version_number = 5)
BEGIN
    INSERT INTO helpdesk.schema_version(version_number, description)
    VALUES (5, N'Unified reply attachments, secure inline preview and responsive typography');
END;
GO
