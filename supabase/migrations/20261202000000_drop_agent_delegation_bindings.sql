-- Elimina el sistema de delegación Eva→Mora (issue #160, Fase 3).
-- La tabla `agent_delegation_bindings` respaldaba la resolución de identidad de
-- la sesión hija de Mora cuando era subagente de Eva. Tras la Fase 2 (#159),
-- Mora es agente raíz y el doctor nombra al paciente, así que la tabla y su
-- índice quedaron sin consumidores.
-- La tabla tenía RLS habilitado SIN políticas públicas (solo service role), así
-- que no hay nada más que revertir. Idempotente vía IF EXISTS.

DROP INDEX IF EXISTS public.idx_agent_delegation_bindings_created_at;

DROP TABLE IF EXISTS public.agent_delegation_bindings;
