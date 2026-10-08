# Design: Remove the Eva→Mora Delegation System

**Change**: `remove-agent-delegation` · **Issue**: [#160](https://github.com/proyecto-polaris-ia/medica-app/issues/160) · **Type**: pure cleanup (no behavior change)

Every action below is pinned to an exact repository-relative path.

## 1. Deletions — module, tests, empty directory

| Path | Action | Notes |
| --- | --- | --- |
| `src/lib/agent/delegation-bindings.ts` | delete | binding module; only imported by its own tests |
| `src/lib/agent/__tests__/delegation-bindings.test.ts` | delete | unit tests (mocked admin client) |
| `src/lib/agent/__tests__/delegation-bindings.local.test.ts` | delete | local Supabase data suite |
| `src/lib/agent/__tests__/` | remove directory | empty after deleting the two test files |
| `src/lib/agent/` | remove directory | empty after deleting the module and `__tests__/` |

Pre-deletion check: grep the repo (excluding `node_modules`) for
`delegation-bindings|agent_delegation_bindings|saveDelegationBinding|resolveDelegationBinding|purgeExpiredDelegationBindings|deleteDelegationBinding`.
The only matches live inside `src/lib/agent/**` itself, confirming the module is
dead. `knip.json` has no `delegation` ignore entry to remove.

## 2. Migration — drop the table and index

### Timestamp selection

Latest applied migration in `supabase/migrations/`:
`20261201000000_payment_intent_source_discord.sql`. The next free timestamp is
`20261202000000`, so the new migration keeps the repo's chronological ordering.

### Up: `supabase/migrations/20261202000000_drop_agent_delegation_bindings.sql`

```sql
-- Elimina el sistema de delegación Eva→Mora (issue #160, Fase 3).
-- La tabla `agent_delegation_bindings` respaldaba la resolución de identidad de
-- la sesión hija de Mora cuando era subagente de Eva. Tras la Fase 2 (#159),
-- Mora es agente raíz y el doctor nombra al paciente, así que la tabla y su
-- índice quedaron sin consumidores.
-- La tabla tenía RLS habilitado SIN políticas públicas (solo service role), así
-- que no hay nada más que revertir. Idempotente vía IF EXISTS.

DROP INDEX IF EXISTS public.idx_agent_delegation_bindings_created_at;

DROP TABLE IF EXISTS public.agent_delegation_bindings;
```

### Down: `supabase/migrations/down/20261202000000_drop_agent_delegation_bindings.down.sql`

Recreates exactly what `20261006080000_agent_delegation_bindings.sql` defined:

```sql
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
```

### RLS

The original table was created with RLS enabled and forced and **no public
policies**; access was service-role only. Dropping the table requires no policy
cleanup, and the down migration restores the same RLS posture.

## 3. Already removed in Fase 2 — no action

`agents/eva/agent/hooks/delegation-identity.ts` does not exist in the tree
(verified). There is nothing to delete or redirect.

## 4. Documentation — NOT in this change's edit surface

`docs/eve-runbook.md` is the only doc that references the delegation system.
The reference is at **lines 24–26** (inside the Mora topology bullet):

> resuelve contra `patients`. El sistema de delegación
> (`src/lib/agent/delegation-bindings.ts` + tabla `agent_delegation_bindings`)
> quedó sin consumidores y se elimina en Fase 3 (issue #160).

The docs writer removes that trailing sentence and keeps the surrounding Mora
topology text intact.

Note: the runbook also contains the word "binding" at line 10, but it refers to
Eva's single WhatsApp **channel** binding — unrelated to delegation — and stays.

This edit is documented here for design completeness. It is owned by a separate
writer and is **not part of this change's allowed edit surfaces**.

## 5. Historical records — do not touch

- `openspec/changes/separate-mora-agent/`
- `odd/tasks/separacion-de-agentes.md`

## 6. Verification approach

This is a no-behavior-change cleanup, so there is no RED/GREEN cycle to run.
Validation is structural and regression-oriented: reset the local database to
prove the forward migration removes the table on a fresh replay, run the test
suite, typecheck, build, and build the Eve agents. The exact commands live in
`tasks.md` §4.
