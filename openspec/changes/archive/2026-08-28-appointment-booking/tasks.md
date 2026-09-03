# Tasks: Appointment Booking

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,300–1,600 |
| 400-line budget risk | High |
| 800-line budget risk | High |
| Chained PRs recommended | Yes |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

### Suggested Work Units

| Unit | Goal | PR | Test command | Runtime harness | Rollback boundary |
|------|------|----|----------------------|-----------------|-------------------|
| 1 | Schema, exclusion, RLS, `booking_free_slots` | PR 1 | `supabase migration up --local` | `supabase db reset` | Down migrations |
| 2 | Bootstrap + Supabase clients | PR 2 | `npm run test -- --run` | `npm install && npm run dev` | package/lock, `app/`, `lib/supabase/*` |
| 3 | Booking modules + tests | PR 3 | `npm run test -- --run` | `supabase db reset && npm run test -- --run` | `src/lib/booking/*`, tests |

## Phase 1: Migrations

- [x] 1.1 `0001_agenda_tables.sql`: enum, tables, FKs, indexes — `Providers`, `Services with duration`, `Per-provider business hours`, `Appointments`.
- [x] 1.2 `0002_agenda_exclusion.sql`: `EXCLUDE USING gist` — `Atomic booking`.
- [x] 1.3 `0003_agenda_rls.sql`: RLS, no anon access — `Availability computed from DB`.
- [x] 1.4 `0004_agenda_functions.sql`: `booking_free_slots(...)` — `Availability computed from DB`.
- [x] 1.5 Down migrations — `Atomic booking`.

## Phase 2: Booking Service Modules

- [x] 2.1 test `src/lib/booking/availability.ts` `getFreeSlots` — `Availability computed from DB`.
- [x] 2.2 implement `availability.ts` via service_role — `Availability computed from DB`.
- [x] 2.3 test `src/lib/booking/booking.ts` insert/conflict — `Atomic booking`.
- [x] 2.4 implement `booking.ts` retry + `BookingConflict` on 23P01 — `Atomic booking`.
- [x] 2.5 test `src/lib/booking/next-available.ts` — `Next available slot recommendation`.
- [x] 2.6 implement `next-available.ts` scan free slots — `Next available slot recommendation`.
- [x] 2.7 test `src/lib/booking/booking-state.ts` — `Next available slot recommendation`.
- [x] 2.8 implement `booking-state.ts` state — `Next available slot recommendation`.
- [x] 2.9 `src/lib/booking/types.ts` — `Time zone correctness`.
- [x] 2.10 `src/lib/booking/patient-resolution.ts` `resolvePatientByPhone` — `Patient resolution from contact`.

## Phase 3: Bootstrap

- [x] 3.1 `package.json` pinned Next.js + React + @supabase/supabase-js + typescript + vitest — `Time zone correctness`.
- [x] 3.2 `tsconfig.json`, `next.config.mjs` — `Time zone correctness`.
- [x] 3.3 `app/layout.tsx`, `app/page.tsx` — `Providers`.
- [x] 3.4 `src/lib/supabase/server.ts` (service_role), `client.ts` (anon) — `Patient resolution from contact`.
- [x] 3.5 `vitest.config.ts`, `.env.local.example` — `Time zone correctness`.

## Phase 4: Tests & Verification

- [x] 4.1 Test concurrent double-booking rejected — `Atomic booking`.
- [x] 4.2 Test cancellation frees slot — `Cancellation releases the interval`.
- [x] 4.3 Test `America/Mexico_City` 17:00 instant — `Time zone correctness`.
- [x] 4.4 Test first booking creates patient — `Patient resolution from contact`.
- [x] 4.5 Run tests, build, write `verify-report.md` — all requirements.
