# Apply Progress: appointment-notes

## Status

All tasks completed. 23/23 tasks marked `[x]`.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `src/lib/admin/__tests__/validate.test.ts` | Unit | ✅ 4/4 (parseHexColor baseline) | ✅ Written | ✅ Passed | ✅ 6 cases | ✅ Extracted `MAX_NOTES_LENGTH` |
| 1.2 | `src/lib/admin/__tests__/validate.test.ts` | Unit | N/A (new function) | ✅ Failing | ✅ Passed | ✅ 6 cases | ✅ Extracted constant |
| 1.3 | `app/api/booking/_lib/validate.test.ts` | Unit | ✅ 12/12 (existing parsers) | ✅ Written | ✅ Passed | ✅ 6 cases | ✅ Extracted `MAX_NOTES_LENGTH` |
| 1.4 | `app/api/booking/_lib/validate.test.ts` | Unit | N/A (new function) | ✅ Failing | ✅ Passed | ✅ 6 cases | ✅ Extracted constant |
| 1.5 | N/A | Structural | N/A | N/A | N/A | ➖ Type-only | ➖ None needed |
| 2.1 | `src/lib/admin/__tests__/appointments.test.ts` | Unit | ✅ 12/12 | ✅ Written | ✅ Passed | ✅ 4 cases (mapRow, trim, empty, cap) | ✅ Clean |
| 2.2 | `src/lib/admin/__tests__/appointments.test.ts` | Unit | N/A | ✅ Failing | ✅ Passed | ✅ 4 cases | ✅ Clean |
| 2.3 | `app/api/admin/appointments/route.test.ts` `app/api/admin/appointments/[id]/route.test.ts` | Unit | ✅ 7/7 and 4/4 | ✅ Written | ✅ Passed | ✅ 2 cases (POST + PATCH) | ✅ Clean |
| 2.4 | `app/api/admin/appointments/route.test.ts` `app/api/admin/appointments/[id]/route.test.ts` | Unit | N/A | ✅ Failing | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 3.1 | `src/components/booking/__tests__/ConfirmStep.test.tsx` | Integration | ✅ 6/6 | ✅ Written | ✅ Passed | ✅ 3 cases (render, maxLength, payload) | ✅ Clean |
| 3.2 | `src/components/booking/__tests__/ConfirmStep.test.tsx` | Integration | N/A | ✅ Failing | ✅ Passed | ✅ 3 cases | ✅ Clean |
| 3.3 | `src/components/booking/BookingWizard.test.tsx` | Integration | ✅ 3/3 | ✅ Written | ✅ Passed | ✅ 1 focused flow | ✅ Clean |
| 3.4 | `src/components/booking/BookingWizard.test.tsx` | Integration | N/A | ✅ Failing | ✅ Passed | ✅ 1 focused flow | ✅ Clean |
| 3.5 | `app/api/booking/book/route.test.ts` `app/api/admin/booking/book/route.test.ts` | Unit | ✅ 9/9 and 4/4 | ✅ Written | ✅ Passed | ✅ 4 cases (valid, >1000, whitespace, missing) | ✅ Clean |
| 3.6 | `app/api/booking/book/route.test.ts` `app/api/admin/booking/book/route.test.ts` | Unit | N/A | ✅ Failing | ✅ Passed | ✅ 4 cases | ✅ Clean |
| 3.7 | `src/lib/booking/__tests__/booking.test.ts` | Unit | N/A (new file) | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Clean |
| 3.8 | `src/lib/booking/__tests__/booking.test.ts` | Unit | N/A | ✅ Failing | ✅ Passed | ✅ 3 cases | ✅ Clean |
| 4.1 | `app/(admin)/appointments/page.test.tsx` | Integration | ✅ 2/2 | ✅ Written | ✅ Passed | ✅ 4 cases (truncation, dash, bind, clear) | ✅ Clean |
| 4.2 | `app/(admin)/appointments/page.test.tsx` | Integration | N/A | ✅ Failing | ✅ Passed | ✅ 4 cases | ✅ Clean |
| 5.1 | `npx tsc --noEmit` | Typecheck | N/A | N/A | ✅ Zero errors | ➖ N/A | ➖ None needed |
| 5.2 | `npm run lint` | Lint | N/A | N/A | ✅ No script/config | ➖ N/A | ➖ None needed |
| 5.3 | `npm run test` | Full suite | N/A | N/A | ✅ 302 passed | ➖ N/A | ➖ None needed |
| 5.4 | `npm run build` | Build | N/A | N/A | ✅ Success | ➖ N/A | ➖ None needed |

### Test Summary

- **Total tests written**: 42
- **Total tests passing**: 302 (full suite)
- **Layers used**: Unit, Integration
- **Approval tests**: None — no refactoring tasks
- **Pure functions created**: `parseNotes` (admin + booking), `formatNotes`

## Work Unit Evidence

| Unit | Focused test command and result | Runtime harness | Rollback boundary |
|------|--------------------------------|-----------------|-------------------|
| 1 | `npx vitest run src/lib/admin/__tests__/validate.test.ts src/lib/admin/__tests__/appointments.test.ts app/api/admin/appointments/route.test.ts app/api/admin/appointments/[id]/route.test.ts` — all pass | `npx tsc --noEmit && npm run build` | Revert admin types, validate, appointments.ts, admin routes |
| 2 | `npx vitest run app/api/booking/_lib/validate.test.ts src/components/booking/__tests__/ConfirmStep.test.tsx src/components/booking/BookingWizard.test.tsx app/api/booking/book/route.test.ts app/api/admin/booking/book/route.test.ts src/lib/booking/__tests__/booking.test.ts` — all pass | N/A — unit tests cover data flow | Revert ConfirmStep, BookingWizard, both book routes, booking.ts |
| 3 | `npx vitest run app/(admin)/appointments/page.test.tsx` — passes | `npx tsc --noEmit` | Revert `app/(admin)/appointments/page.tsx` |

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/lib/admin/types.ts` | Modified | Added `notes` to `Appointment` and `AppointmentInput` |
| `src/lib/admin/appointments.ts` | Modified | Added `notes` to `SELECT_COLUMNS`, `mapRow`, and `validateAppointmentInput` |
| `src/lib/admin/validate.ts` | Modified | Added `parseNotes` helper |
| `app/api/booking/_lib/validate.ts` | Modified | Added booking `parseNotes` helper |
| `app/api/admin/appointments/route.ts` | Modified | Forward `notes` to `createAppointment` |
| `app/api/admin/appointments/[id]/route.ts` | Modified | Forward `notes` to `updateAppointment` |
| `src/components/booking/ConfirmStep.tsx` | Modified | Added notes textarea; updated `ConfirmPatient` type |
| `src/components/booking/BookingWizard.tsx` | Modified | Forward `patient.notes` into request body |
| `app/api/booking/book/route.ts` | Modified | Validate and forward `notes` to `bookAppointment` |
| `app/api/admin/booking/book/route.ts` | Modified | Validate and forward `notes` to `bookAppointment` |
| `src/lib/booking/booking.ts` | Modified | Trim notes and normalize empty to null |
| `app/(admin)/appointments/page.tsx` | Modified | Added "Notas" column + edit modal textarea |
| `src/lib/admin/__tests__/validate.test.ts` | Modified | Added `parseNotes` tests |
| `app/api/booking/_lib/validate.test.ts` | Modified | Added `parseNotes` tests |
| `src/lib/admin/__tests__/appointments.test.ts` | Modified | Added notes CRUD tests |
| `app/api/admin/appointments/route.test.ts` | Modified | Added POST notes test |
| `app/api/admin/appointments/[id]/route.test.ts` | Modified | Added PATCH notes test |
| `src/components/booking/__tests__/ConfirmStep.test.tsx` | Modified | Added notes textarea tests |
| `src/components/booking/BookingWizard.test.tsx` | Modified | Added notes forwarding test |
| `app/api/booking/book/route.test.ts` | Modified | Added notes validation/forwarding tests |
| `app/api/admin/booking/book/route.test.ts` | Modified | Added notes validation/forwarding tests |
| `src/lib/booking/__tests__/booking.test.ts` | Created | Added `bookAppointment` notes normalization tests |
| `app/(admin)/appointments/page.test.tsx` | Modified | Added notes column/modal tests |

## Deviations from Design

None — implementation matches design.

## Issues Found

- `app/api/admin/booking/book/route.ts` uses booking `parseIsoDate` (booking `ValidationError`) while `handleAdminRequest` catches only admin `ValidationError`. For `notes`, the route uses admin `parseNotes` so validation errors route correctly. The pre-existing latent 500 for bad `startAt`/`endAt` remains out of scope as noted in `design.md`.

## Verification Results

- `npx tsc --noEmit`: ✅ zero errors
- `npm run lint`: ✅ no lint script/config present; skipped
- `npm run test`: ✅ 302 passed
- `npm run build`: ✅ success

## Workload / PR Boundary

- Mode: single PR
- Current work unit: full change (foundation + admin CRUD + booking flow + admin UI)
- Boundary: entire `appointment-notes` change
- Estimated review budget impact: ~340 changed lines (within 400-line budget)
