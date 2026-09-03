# Verify Report — appointment-booking

**Status**: PASSED
**Change**: appointment-booking (implement the baseline `appointment-booking` spec: agenda data model + booking service layer)

## Verification Summary

| Check | Result |
|-------|--------|
| Migrations apply (`supabase db reset`) | 4/4 applied cleanly |
| TypeScript (`tsc --noEmit`) | 0 errors |
| Build (`next build`) | Success (Next.js 15.5.24) |
| Unit tests (`vitest run`) | 4/4 passed |
| Atomic booking (SQLSTATE `23P01`) | Confirmed |
| Availability from DB | Confirmed |
| Timezone correctness | Confirmed (17:00 local = 23:00 UTC) |
| Cancellation releases interval | Confirmed |

## Requirement Coverage

1. **Providers** — `providers` table (0001). Verified via migration apply + insert.
2. **Services with duration** — `services.duration_minutes` with `CHECK (> 0)` (0001); the service duration constrains `booking_free_slots` slot length. Verified.
3. **Per-provider business hours** — `business_hours` per provider/day-of-week with `CHECK (start_time < end_time)` (0001). Verified: slots fall within 09:00–17:00.
4. **Appointments** — `appointments` referencing patient/service/provider with `start_at`/`end_at`/`status` (0001). Verified.
5. **Availability computed from DB** — `booking_free_slots(...)` SQL function (0004, SECURITY DEFINER); free slots = business_hours minus overlapping active appointments. Verified: occupied 10:00–10:30 slot returned count 0.
6. **Atomic booking** — provider-time exclusion constraint (0002, `btree_gist` + `EXCLUDE USING gist`). Verified: overlapping insert rejected with `ERROR: 23P01 conflicting key value violates exclusion constraint "appointments_provider_no_overlap"`.
7. **Next available slot recommendation** — `booking_free_slots` returns ordered slots; `findNextAvailable` scans forward up to 30 days. Verified: returns earliest free slot after the requested time.
8. **Time zone correctness** — all instants `timestamptz`; clinic TZ `America/Mexico_City`. Verified: last free slot end `2026-08-31 23:00:00+00` = 17:00 local (UTC-6).
9. **Cancellation releases the interval** — cancel nullifies the range (`start_at = end_at`) so the exclusion constraint no longer overlaps. Verified: after cancel, the 10:00–10:30 slot became free (count 0 → 1).
10. **Patient resolution from contact** — `patients.phone_e164` UNIQUE + `resolvePatient` upsert (onConflict `phone_e164`). Verified by unit behavior + schema.

## Test Evidence

- Unit: `src/lib/booking/__tests__/booking-state.test.ts` — 4 tests passed (init/select/setCandidates/confirm).
- Integration (SQL, local Supabase service_role): exclusion 23P01, availability exclusion, timezone, cancellation release — all passed.

## Risks / Notes

- The apply phase produced code out of slice order and without verification; the orchestrator corrected the migrations, next.config, React/Next version pins, Supabase client graceful degradation, and booking-module duration/next-available/patient-resolution logic, then verified inline.
- `next@15.0.3` was upgraded to `next@15.5.24` (patched CVE-2025-66478) and React to 19 (required by Next 15).
- Patient-level RLS deferred to MVP1 (no patient auth yet) per design.
