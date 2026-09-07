# Archive Report: Eve Stage 2 — Read-Only Tools

## Final State

Stage 2 is complete and archived. The Eve framework capability spec now includes the read-only catalog, availability, knowledge search, and tool-instruction requirements.

## Delivered

- `agent/tools/list-catalog.ts`
- `agent/tools/check-availability.ts`
- `agent/tools/search-knowledge.ts`
- `tests/agent/tools/list-catalog.test.ts`
- `tests/agent/tools/check-availability.test.ts`
- `tests/agent/tools/search-knowledge.test.ts`
- `agent/instructions.md` read-only tool guidance
- `agent/eve-shim.d.ts` localized `eve/tools` TypeScript shim
- Direct `zod` dependency in `package.json` / `package-lock.json`

## Verification Evidence

- `npm run test -- tests/agent/tools` passed: 3 files / 11 tests.
- `npm run test` passed: 57 files / 394 tests.
- `npm run typecheck` passed.
- `npm run build` passed.

## Warnings

- Local shell used Node `v20.19.6`, so `npm install` emitted engine warnings. Stage 1 already declares Node `24.x`, and the verification commands still passed locally.
- `npm run lint` does not exist in `package.json`.

## Spec Sync

- Synced `openspec/changes/2026-09-07-eve-stage-2/specs/eve-framework/spec.md` into `openspec/specs/eve-framework/spec.md` by adding the Stage 2 requirements.

## Outcome

No CRITICAL issues. No stale unchecked tasks remain.

- Moved all agent tests outside `agent/` to prevent Eve from treating test folders as agent capabilities during Vercel builds.
