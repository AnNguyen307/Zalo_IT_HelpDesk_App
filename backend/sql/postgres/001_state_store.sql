-- v5.15.0 free-hosting pilot state store.
-- The NAS/SQL Server profile continues to use SQL Server schema version 9.

CREATE TABLE IF NOT EXISTS public.helpdesk_runtime_state (
    id smallint PRIMARY KEY CHECK (id = 1),
    revision bigint NOT NULL DEFAULT 0,
    state jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT NOW()
);

REVOKE ALL ON TABLE public.helpdesk_runtime_state FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.helpdesk_runtime_state FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.helpdesk_runtime_state FROM authenticated';
    END IF;
END
$$;
ALTER TABLE public.helpdesk_runtime_state ENABLE ROW LEVEL SECURITY;

INSERT INTO public.helpdesk_runtime_state (id, revision, state)
VALUES (1, 0, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
