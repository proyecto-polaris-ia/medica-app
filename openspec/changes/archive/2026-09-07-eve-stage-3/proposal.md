# Proposal: Eve Stage 3 — Write Tools for Booking and Patient Resolution

## Intent
Add the write-side Eve tools required by Issue #33 so Eva can resolve/create patients, book appointments, and recover from unavailable slots while preserving the existing deterministic booking backend.

## Context
Stage 1 and Stage 2 are complete on `feat/eve-migration`: PR #38 merged the Eve scaffold and PR #39 merged the read-only tools. Current checkout contains `agent/agent.ts`, `agent/instructions.md`, and the Stage 2 tools `list-catalog`, `check-availability`, and `search-knowledge`.

## Scope
- Create `agent/tools/resolve-patient.ts`.
- Create `agent/tools/book-appointment.ts`.
- Create `agent/tools/get-next-available.ts`.
- Add unit tests for each write tool under `tests/agent/tools/`.
- Add a booking-flow integration test under `tests/agent/tools/`.
- Update `agent/instructions.md` so write behavior is explicit and still bounded by clinical guardrails.

## Scope Adaptation
Issue #33 suggests `agent/tools/__tests__/`, but Stage 2 proved the Eve/Vercel agent root treats unsupported directories under `agent/` as tool entries. Tests MUST stay outside the `agent/` root in `tests/agent/tools/`.

## Non-goals
- Do not create Eve skills; Stage 4 owns skills.
- Do not create the WhatsApp channel; Stage 5 owns channel work.
- Do not modify existing `src/lib/booking/` business logic.
- Do not modify Stage 2 read-only tools except through shared tests if needed.
- Do not change Supabase schema or migrations.

## Rollback
Remove the three new write tool files, the new tests, and the write-tool section in `agent/instructions.md`. No schema rollback is required because this change does not alter database structure.
