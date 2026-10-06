-- Down migration para bindings de identidad de delegación (20261006080000).
-- Revierte exactamente lo creado en 20261006080000_agent_delegation_bindings.sql:
-- índice y tabla. No hay políticas RLS que revertir (la tabla se creó sin
-- políticas públicas, solo accesible por service role).

DROP INDEX IF EXISTS public.idx_agent_delegation_bindings_created_at;

DROP TABLE IF EXISTS public.agent_delegation_bindings;
