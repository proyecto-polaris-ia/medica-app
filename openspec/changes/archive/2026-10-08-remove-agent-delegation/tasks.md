# Tasks: remove-agent-delegation

## Workload forecast

**Size: small.** 4 deletions (`src/lib/agent/delegation-bindings.ts`, its two
test files, and the empty `src/lib/agent/` directory), 2 files added (up + down
migration), 1 documentation edit in `docs/eve-runbook.md` owned by a separate
writer, plus validation runs. Completable in a single focused session. No spec
deltas are needed (no capability requirement references the delegation binding
mechanism).

## 1. Delete the delegation binding module, its tests, and the empty directory

- [x] 1.1 Delete `src/lib/agent/delegation-bindings.ts`.
- [x] 1.2 Delete `src/lib/agent/__tests__/delegation-bindings.test.ts`.
- [x] 1.3 Delete `src/lib/agent/__tests__/delegation-bindings.local.test.ts`.
- [x] 1.4 Remove the now-empty `src/lib/agent/__tests__/` and `src/lib/agent/` directories.
- [x] 1.5 Confirm no imports remain: grep for `delegation-bindings` and its exported symbols outside `src/lib/agent/**` returns nothing; confirm `knip.json` has no delegation ignore entry.

## 2. Add the drop migration and its down pair

- [x] 2.1 Create `supabase/migrations/20261202000000_drop_agent_delegation_bindings.sql` with the Spanish header comment and `DROP INDEX IF EXISTS` + `DROP TABLE IF EXISTS` (content in `design.md` §2).
- [x] 2.2 Create `supabase/migrations/down/20261202000000_drop_agent_delegation_bindings.down.sql` recreating the table, index, RLS, and REVOKE statements exactly as `20261006080000_agent_delegation_bindings.sql` (content in `design.md` §2).
- [x] 2.3 Verify the timestamp `20261202000000` sorts after the latest existing migration and is unused.

## 3. Clean `docs/eve-runbook.md` references

- [x] 3.1 (separate docs writer, outside this change's edit surface) Remove the delegation sentence at lines 24–26 referencing `src/lib/agent/delegation-bindings.ts` and the `agent_delegation_bindings` table; keep the surrounding Mora topology text.
- [x] 3.2 Confirm `grep -n "delegation-bindings\|agent_delegation_bindings" docs/eve-runbook.md` returns no matches, and that line 10 (Eva's WhatsApp channel binding) is left untouched.

## 4. Validate

- [x] 4.1 `supabase db reset` — fresh replay includes the drop migration; `agent_delegation_bindings` and `idx_agent_delegation_bindings_created_at` are absent (verified via information_schema/to_regclass/pg_indexes).
- [x] 4.2 `SUPABASE_LOCAL=1 npx vitest run --exclude 'tests/e2e/**' --no-file-parallelism` — suite green: 168 files / 1643 tests passed (sequential form avoids the pre-existing advisory-lock fragility under load).
- [x] 4.3 `npm run build` — build green (24 pre-existing eslint `no-unused-vars` warnings, unattributed).
- [x] 4.4 `npx tsc --noEmit` — no type errors.
- [x] 4.5 `eve build` — agent builds green (`agents/eva` and `agents/mora` exit 0, what `vercel.json` `buildCommand` runs; the literal root `eve build` refuses by design in a repo with a Vercel service graph). `eve info --agent eva|mora`: 0 diagnostics, 0 subagents.

## 5. Verify report and archive

- [ ] 5.1 Create `openspec/changes/remove-agent-delegation/verify-report.md` with the observed results of §4.
- [ ] 5.2 Archive `openspec/changes/remove-agent-delegation/` → `openspec/changes/archive/YYYY-MM-DD-remove-agent-delegation/`.
