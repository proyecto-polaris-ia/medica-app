# Apply Progress: Eve Stage 2 — Read-Only Tools

## Status

Complete.

## Implemented

- Added `zod` as a direct dependency for Eve tool schemas.
- Created `agent/tools/list-catalog.ts` to read services and providers through existing catalog functions.
- Created `agent/tools/check-availability.ts` to validate date input, resolve service/provider names, and return up to five DB-derived slots.
- Created `agent/tools/search-knowledge.ts` to query only approved `whatsapp_knowledge_entries` and deterministically rank matches.
- Updated `agent/instructions.md` with read-only tool guidance while preserving clinical guardrails.
- Extended `agent/eve-shim.d.ts` for `eve/tools` because the current `tsconfig` still uses Node-style module resolution.
- Added unit tests for all three tools under `agent/tools/__tests__/`.

## Read-Only Evidence

- No migrations were added.
- No existing booking business logic was modified.
- Knowledge search uses `.select(...).eq("status", "approved")`; tests assert write-like Supabase methods are not called.
- Availability delegates to existing `getFreeSlots` and does not book appointments.

## Verification Snapshot

- `npm run test -- agent/tools/__tests__` passed: 3 files / 11 tests.
- `npm run test` passed: 57 files / 394 tests.
- `npm run typecheck` passed after adding the localized `eve/tools` shim.
- `npm run build` passed.
