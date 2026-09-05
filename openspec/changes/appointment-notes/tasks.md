# Tasks: Appointment Notes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300–380 (production ~160 + tests ~180) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-chain |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | parseNotes helpers + types + admin CRUD wiring | PR 1 | `npx vitest run src/lib/admin/__tests__/validate.test.ts src/lib/admin/__tests__/appointments.test.ts app/api/admin/appointments/route.test.ts app/api/admin/appointments/[id]/route.test.ts` | `npx tsc --noEmit && npm run build` | Revert admin types, validate, appointments.ts, admin routes — column stays nullable |
| 2 | Booking flow notes (ConfirmStep, routes, booking.ts) | PR 1 (same) | `npx vitest run app/api/booking/_lib/validate.test.ts src/components/booking/__tests__/ConfirmStep.test.tsx src/components/booking/BookingWizard.test.tsx app/api/booking/book/route.test.ts app/api/admin/booking/book/route.test.ts` | N/A — unit tests cover data flow | Revert ConfirmStep, BookingWizard, both book routes, booking.ts — admin side unaffected |

## Phase 1: Foundation — Types & parseNotes Helpers (TDD)

- [x] 1.1 **RED** — Add `parseNotes` tests in `src/lib/admin/__tests__/validate.test.ts`: trim→value, whitespace→null, >1000 chars throws ValidationError, undefined→null.
- [x] 1.2 **GREEN** — Implement `parseNotes(value, field='notes')` in `src/lib/admin/validate.ts`: trim, empty→null, >1000 throws `ValidationError(field)`.
- [x] 1.3 **RED** — Add `parseNotes` tests in `app/api/booking/_lib/validate.test.ts` (same cases, booking `ValidationError`).
- [x] 1.4 **GREEN** — Implement `parseNotes` in `app/api/booking/_lib/validate.ts` (booking `ValidationError` class).
- [x] 1.5 Add `notes: string | null` to `Appointment` and `notes?: string | null` to `AppointmentInput` in `src/lib/admin/types.ts`.

## Phase 2: Admin CRUD Wiring (TDD)

- [x] 2.1 **RED** — Add tests in `src/lib/admin/__tests__/appointments.test.ts`: `validateAppointmentInput` trims notes, caps at 1000, empty→null; `mapRow` includes notes; `SELECT_COLUMNS` includes notes.
- [x] 2.2 **GREEN** — Add `notes` to `SELECT_COLUMNS` and `mapRow` in `src/lib/admin/appointments.ts`; add trim/cap logic in `validateAppointmentInput`.
- [x] 2.3 **RED** — Add tests in `app/api/admin/appointments/route.test.ts` and `app/api/admin/appointments/[id]/route.test.ts`: POST/PATCH forwards notes to create/update.
- [x] 2.4 **GREEN** — Forward `notes` from request body in `app/api/admin/appointments/route.ts` (create) and `app/api/admin/appointments/[id]/route.ts` (update).

## Phase 3: Booking Flow — ConfirmStep & Routes (TDD)

- [x] 3.1 **RED** — Add tests in `src/components/booking/__tests__/ConfirmStep.test.tsx`: textarea renders with label "Notas de la cita", placeholder text, maxLength 1000; notes included in ConfirmPatient payload.
- [x] 3.2 **GREEN** — Add `notes?: string` to `ConfirmPatient` type; render textarea in `src/components/booking/ConfirmStep.tsx` with label, placeholder, maxLength.
- [x] 3.3 **RED** — Add test in `src/components/booking/BookingWizard.test.tsx`: `patient.notes` forwarded into request body.
- [x] 3.4 **GREEN** — Forward `patient.notes` into body in `src/components/booking/BookingWizard.tsx`.
- [x] 3.5 **RED** — Add tests in `app/api/booking/book/route.test.ts` and `app/api/admin/booking/book/route.test.ts`: parseNotes called, >1000 rejected, valid notes forwarded to bookAppointment.
- [x] 3.6 **GREEN** — Call `parseNotes(body.notes)` and pass result to `bookAppointment` in `app/api/booking/book/route.ts` and `app/api/admin/booking/book/route.ts`.
- [x] 3.7 **RED** — Add test in `src/lib/booking/__tests__/booking.test.ts` (if exists) or `src/lib/admin/__tests__/appointments.test.ts`: bookAppointment trims notes, empty→null (defense in depth).
- [x] 3.8 **GREEN** — Add trim + empty→null normalization for `notes` in `src/lib/booking/booking.ts`.

## Phase 4: Admin UI — List Column & Modal (TDD)

- [x] 4.1 **RED** — Add tests in `app/(admin)/appointments/page.test.tsx`: "Notas" column shows truncated text (~80 chars), "—" when empty; modal textarea binds notes, maxLength 1000; clearing notes saves null.
- [x] 4.2 **GREEN** — Add "Notas" column to appointments table in `app/(admin)/appointments/page.tsx` (truncate ~80 chars, "—" empty); add textarea in edit modal with label "Notas de la cita", maxLength 1000; include `notes` in `emptyAppointment` and `openEdit`.

## Phase 5: Verification

- [x] 5.1 Run `npx tsc --noEmit` — zero errors.
- [x] 5.2 Run `npm run lint` — zero errors. *(No lint script/config present; skipped.)*
- [x] 5.3 Run `npm run test` — all tests pass.
- [x] 5.4 Run `npm run build` — build succeeds.
