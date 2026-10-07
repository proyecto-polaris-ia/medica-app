-- Bindings de identidad para la delegación de subagentes (issue #140, fase 1).
-- El hook raíz observa `subagent.called` cuando Eva delega a Mora y persiste
-- child_session_id -> trusted_patient_phone. La sesión hija corre en una ruta
-- interna del runtime: no trae `auth.current`/`auth.initiator` del canal, así que
-- las tools de Mora resuelven la identidad con este binding server-side y nunca
-- con texto del paciente.
--
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
