-- v5.17.0 PostgreSQL Playbook Governance.
-- Idempotent normalized lifecycle storage; the runtime JSON state remains schema 1.

CREATE TABLE IF NOT EXISTS public.helpdesk_schema_migrations (
    migration_key text PRIMARY KEY,
    description text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.helpdesk_playbook_procedures (
    id text PRIMARY KEY,
    code text NOT NULL UNIQUE,
    title text NOT NULL,
    category text NOT NULL,
    audience text NOT NULL,
    lifecycle_status text NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active','deprecated','archived')),
    current_version_id text NULL,
    owner_id text NOT NULL DEFAULT '',
    owner_name text NOT NULL DEFAULT '',
    created_by text NOT NULL,
    created_by_name text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_helpdesk_playbook_procedures_status_updated
    ON public.helpdesk_playbook_procedures(lifecycle_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.helpdesk_playbook_versions (
    id text PRIMARY KEY,
    procedure_id text NOT NULL REFERENCES public.helpdesk_playbook_procedures(id) ON DELETE CASCADE,
    version_number integer NOT NULL CHECK (version_number > 0),
    status text NOT NULL CHECK (status IN ('draft','submitted','rejected','published','superseded','archived')),
    content_json jsonb NOT NULL,
    change_summary text NOT NULL DEFAULT '',
    source_ticket_id text NULL,
    created_by text NOT NULL,
    created_by_name text NOT NULL,
    created_by_role text NOT NULL,
    submitted_at timestamptz NULL,
    reviewed_by text NULL,
    reviewed_by_name text NULL,
    reviewed_at timestamptz NULL,
    review_note text NOT NULL DEFAULT '',
    published_at timestamptz NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (procedure_id, version_number)
);

CREATE INDEX IF NOT EXISTS ix_helpdesk_playbook_versions_status_updated
    ON public.helpdesk_playbook_versions(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_helpdesk_playbook_versions_procedure_version
    ON public.helpdesk_playbook_versions(procedure_id, version_number DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_playbook_versions_published
    ON public.helpdesk_playbook_versions(procedure_id) WHERE status = 'published';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_helpdesk_playbook_procedures_current_version') THEN
        ALTER TABLE public.helpdesk_playbook_procedures
            ADD CONSTRAINT fk_helpdesk_playbook_procedures_current_version
            FOREIGN KEY (current_version_id) REFERENCES public.helpdesk_playbook_versions(id)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.helpdesk_playbook_events (
    id text PRIMARY KEY,
    procedure_id text NOT NULL REFERENCES public.helpdesk_playbook_procedures(id) ON DELETE CASCADE,
    version_id text NULL REFERENCES public.helpdesk_playbook_versions(id) ON DELETE SET NULL,
    action text NOT NULL,
    actor_id text NOT NULL,
    actor_name text NOT NULL,
    actor_role text NOT NULL,
    detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_helpdesk_playbook_events_procedure_created
    ON public.helpdesk_playbook_events(procedure_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.helpdesk_playbook_index_state (
    state_id smallint PRIMARY KEY CHECK (state_id = 1),
    status text NOT NULL CHECK (status IN ('idle','queued','building','ready','failed')),
    requested_at timestamptz NULL,
    requested_by text NOT NULL DEFAULT '',
    started_at timestamptz NULL,
    completed_at timestamptz NULL,
    source_fingerprint text NOT NULL DEFAULT '',
    indexed_entries integer NOT NULL DEFAULT 0,
    error_message text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL
);

INSERT INTO public.helpdesk_playbook_index_state(state_id, status, updated_at)
VALUES (1, 'idle', NOW())
ON CONFLICT (state_id) DO NOTHING;

REVOKE ALL ON TABLE public.helpdesk_schema_migrations FROM PUBLIC;
REVOKE ALL ON TABLE public.helpdesk_playbook_procedures FROM PUBLIC;
REVOKE ALL ON TABLE public.helpdesk_playbook_versions FROM PUBLIC;
REVOKE ALL ON TABLE public.helpdesk_playbook_events FROM PUBLIC;
REVOKE ALL ON TABLE public.helpdesk_playbook_index_state FROM PUBLIC;

DO $$
DECLARE role_name text;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('REVOKE ALL ON TABLE public.helpdesk_schema_migrations FROM %I', role_name);
            EXECUTE format('REVOKE ALL ON TABLE public.helpdesk_playbook_procedures FROM %I', role_name);
            EXECUTE format('REVOKE ALL ON TABLE public.helpdesk_playbook_versions FROM %I', role_name);
            EXECUTE format('REVOKE ALL ON TABLE public.helpdesk_playbook_events FROM %I', role_name);
            EXECUTE format('REVOKE ALL ON TABLE public.helpdesk_playbook_index_state FROM %I', role_name);
        END IF;
    END LOOP;
END
$$;

ALTER TABLE public.helpdesk_schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helpdesk_playbook_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helpdesk_playbook_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helpdesk_playbook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helpdesk_playbook_index_state ENABLE ROW LEVEL SECURITY;

INSERT INTO public.helpdesk_schema_migrations(migration_key, description)
VALUES ('playbook-governance-v1', 'Normalized PostgreSQL Playbook lifecycle and index state for v5.17.0')
ON CONFLICT (migration_key) DO NOTHING;
