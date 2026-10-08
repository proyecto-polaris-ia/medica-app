-- Down migration: recrea la tabla e índice de bindings de delegación de
-- identidad (issue #160) exactamente como los definió
-- 20261006080000_agent_delegation_bindings.sql.
-- Idempotente: tabla e índice usan IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS public.agent_delegation_bindings (
  child_session_id text PRIMARY KEY,
  trusted_patient_phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- TTL-friendly: `purgeExpiredDelegationBindings` borra por `created_at`.
CREATE INDEX IF NOT EXISTS idx_agent_delegation_bindings_created_at
  ON public.agent_delegation_bindings (created_at);

-- Solo backend (service role). RLS habilitado SIN políticas públicas: ningún rol
-- anon/authenticated puede leer ni escribir; el service role bypassa RLS.
ALTER TABLE public.agent_delegation_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_delegation_bindings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.agent_delegation_bindings FROM anon;
REVOKE ALL ON public.agent_delegation_bindings FROM authenticated;
