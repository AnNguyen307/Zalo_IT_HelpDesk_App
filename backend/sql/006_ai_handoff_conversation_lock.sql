USE ZaloHelpDesk;
GO

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF COL_LENGTH(N'helpdesk.tickets', N'ai_handoff_locked') IS NULL
BEGIN
    ALTER TABLE helpdesk.tickets
      ADD ai_handoff_locked bit NOT NULL
          CONSTRAINT DF_helpdesk_tickets_ai_handoff_locked DEFAULT (0);
END;
GO

IF COL_LENGTH(N'helpdesk.tickets', N'ai_handoff_at') IS NULL
    ALTER TABLE helpdesk.tickets ADD ai_handoff_at datetime2(3) NULL;
GO

IF COL_LENGTH(N'helpdesk.tickets', N'ai_handoff_reason') IS NULL
BEGIN
    ALTER TABLE helpdesk.tickets
      ADD ai_handoff_reason nvarchar(100) NOT NULL
          CONSTRAINT DF_helpdesk_tickets_ai_handoff_reason DEFAULT N'';
END;
GO

IF COL_LENGTH(N'helpdesk.tickets', N'ai_handoff_by') IS NULL
BEGIN
    ALTER TABLE helpdesk.tickets
      ADD ai_handoff_by nvarchar(64) NOT NULL
          CONSTRAINT DF_helpdesk_tickets_ai_handoff_by DEFAULT N'';
END;
GO

IF COL_LENGTH(N'helpdesk.tickets', N'ai_handoff_by_name') IS NULL
BEGIN
    ALTER TABLE helpdesk.tickets
      ADD ai_handoff_by_name nvarchar(200) NOT NULL
          CONSTRAINT DF_helpdesk_tickets_ai_handoff_by_name DEFAULT N'';
END;
GO

/* Backfill every ticket where the AI already escalated. */
UPDATE ticket
SET
    ai_handoff_locked = 1,
    ai_handoff_at = COALESCE(ticket.ai_handoff_at, ticket.updated_at, ticket.created_at, SYSUTCDATETIME()),
    ai_handoff_reason = CASE
        WHEN NULLIF(JSON_VALUE(ticket.ai_analysis_json, N'$.escalationCode'), N'') IS NOT NULL
          THEN LEFT(JSON_VALUE(ticket.ai_analysis_json, N'$.escalationCode'), 100)
        ELSE N'legacy_ai_escalation'
    END,
    ai_handoff_by = N'ai-agent',
    ai_handoff_by_name = N'AI HelpDesk Agent'
FROM helpdesk.tickets AS ticket
WHERE ticket.ai_handoff_locked = 0
  AND ticket.ai_analysis_json IS NOT NULL
  AND ISJSON(ticket.ai_analysis_json) = 1
  AND (
      JSON_VALUE(ticket.ai_analysis_json, N'$.escalated') = N'true'
      OR JSON_VALUE(ticket.ai_analysis_json, N'$.outcome') = N'escalate'
      OR JSON_VALUE(ticket.ai_analysis_json, N'$.canAutoHandle') = N'false'
  );
GO

/* Backfill tickets where a technician/admin already joined the conversation. */
;WITH first_staff_message AS (
    SELECT ticket_id, MIN(created_at) AS first_staff_at
    FROM helpdesk.messages
    WHERE role = N'technician'
    GROUP BY ticket_id
)
UPDATE ticket
SET
    ai_handoff_locked = 1,
    ai_handoff_at = COALESCE(ticket.ai_handoff_at, staff.first_staff_at, ticket.updated_at, SYSUTCDATETIME()),
    ai_handoff_reason = CASE WHEN ticket.ai_handoff_reason = N'' THEN N'staff_joined_conversation' ELSE ticket.ai_handoff_reason END,
    ai_handoff_by = CASE WHEN ticket.ai_handoff_by = N'' THEN N'legacy-staff' ELSE ticket.ai_handoff_by END,
    ai_handoff_by_name = CASE WHEN ticket.ai_handoff_by_name = N'' THEN N'Kỹ thuật viên HelpDesk' ELSE ticket.ai_handoff_by_name END
FROM helpdesk.tickets AS ticket
JOIN first_staff_message AS staff ON staff.ticket_id = ticket.id
WHERE ticket.ai_handoff_locked = 0;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'helpdesk.tickets')
      AND name = N'IX_helpdesk_tickets_handoff_status_updated'
)
BEGIN
    CREATE INDEX IX_helpdesk_tickets_handoff_status_updated
      ON helpdesk.tickets(ai_handoff_locked, status, updated_at DESC)
      WHERE ai_handoff_locked = 1;
END;
GO

IF NOT EXISTS (SELECT 1 FROM helpdesk.schema_version WHERE version_number = 6)
BEGIN
    INSERT INTO helpdesk.schema_version(version_number, description)
    VALUES (6, N'Immutable human handoff: AI leaves ticket conversation after escalation or staff takeover');
END;
GO
