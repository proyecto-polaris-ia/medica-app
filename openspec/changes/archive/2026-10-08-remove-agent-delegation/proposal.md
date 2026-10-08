# Proposal: Remove the Eva→Mora Delegation System (issue #160, Fase 3)

**Issue**: [#160 — Fase 3: Eliminar sistema de delegación Eva→Mora](https://github.com/proyecto-polaris-ia/medica-app/issues/160)
**Épico**: [#140 — Separación de agentes](https://github.com/proyecto-polaris-ia/medica-app/issues/140) · **Depends on**: [#159](https://github.com/proyecto-polaris-ia/medica-app/issues/159) (Fase 2, merged)

## Why

After Fase 2 (#159), Mora is an independent root agent with its own Discord
channel (`agents/mora/agent/`). Collections identity is now resolved by an
authorized doctor who names the patient, so the Eva→Mora delegation system has
no remaining consumers:

- `src/lib/agent/delegation-bindings.ts` (binding module) is imported only by
  its own test files; no production code references it.
- The root hook `agents/eva/agent/hooks/delegation-identity.ts` was already
  removed in Fase 2.
- The `agent_delegation_bindings` table (migration
  `20261006080000_agent_delegation_bindings.sql`) is no longer read or written.

Keeping this dead surface adds migration weight, documentation noise, and a
security-relevant table that no longer serves a purpose. This is a pure-cleanup
change: **no behavior change and no new functionality**.

## What Changes

### REMOVED — delegation binding module and tests

- Delete `src/lib/agent/delegation-bindings.ts`.
- Delete `src/lib/agent/__tests__/delegation-bindings.test.ts`.
- Delete `src/lib/agent/__tests__/delegation-bindings.local.test.ts`.
- Remove the now-empty `src/lib/agent/` directory.

### REMOVED — `agent_delegation_bindings` table and index

- Add a **new forward migration** that drops the index and the table.
- **Why a new forward migration and not the existing down migration**:
  `supabase db reset` replays the up migrations in order. Applying only the
  existing `20261006080000_agent_delegation_bindings.down.sql` would leave the
  table in place after every fresh reset. A forward migration removes it from
  every rebuilt database.
- Ship an up/down pair: the down migration recreates the table and index
  exactly as `20261006080000_agent_delegation_bindings.sql` defined them.

### Docs cleanup

- `docs/eve-runbook.md`: remove the sentence that references
  `src/lib/agent/delegation-bindings.ts` and the `agent_delegation_bindings`
  table (lines 24–26). This edit is described here for completeness but is
  **outside this change's edit surface**; a separate docs writer owns it.

### Historical records NOT touched

- `openspec/changes/separate-mora-agent/`
- `odd/tasks/separacion-de-agentes.md`
- `agents/eva/agent/hooks/delegation-identity.ts` — already removed in Fase 2;
  nothing to do.

## Impact

- **Capabilities**: none. **No spec deltas are required.** No requirement in
  `openspec/specs/` references the delegation binding mechanism. A grep of
  `openspec/specs/` for `delegation|agent_delegation_bindings|delegation-bindings`
  returns a single match: `openspec/specs/mora-agent/spec.md` line 169, a
  historical sentence stating that inbound WhatsApp is no longer routed by
  delegation to a Mora subagent. That text describes the current post-Fase-2
  behavior and is not modified. Observable behavior already matches the main
  specs.
- **Code**: dead code only; no production import references the module.
- **Data**: the table is service-role only and has **no RLS policies**
  (`ENABLE`/`FORCE ROW LEVEL SECURITY` with no public policies), so nothing
  else needs to be reverted.

## Risk note

Dropping a production table is **irreversible**. The table held only ephemeral,
per-delegation identity bindings with a one-hour TTL and no consumers, so no
durable data is lost. Coordinate at deploy time with the team (issue #160)
before the migration runs against production.

## Rollback plan

The change is git-revertible. The new migration ships with a **down migration
that recreates the table and index exactly as the original
`20261006080000` migration did**, so a rollback that applies the down migration
restores the previous schema. Because the restored table is unused, the schema
delta is safe to keep or revert independently of the code.
