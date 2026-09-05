# Proposal: Appointment Notes

## Intent

The `appointments.notes` column already exists (migration `0007_appointment_notes.sql`) and `bookAppointment` already accepts and writes it, but no UI or API path exposes it. Patients cannot communicate special considerations, and staff cannot see them. Surface and persist appointment notes end-to-end.

## Scope

### In Scope
- Add `notes` to admin `Appointment` / `AppointmentInput` types, `SELECT_COLUMNS`, `mapRow`, and `validateAppointmentInput`.
- Show notes in the admin appointments list ("Notas" column) and edit modal (textarea).
- Add a notes textarea to the booking wizard final step (`ConfirmStep`) with label "¿Quieres agregar algo más para tener en consideración para tu cita?", for both public and internal flows.
- Thread notes through wizard state and both booking routes; validate server-side (trim, max 1000 chars).
- Tests for each touched layer (strict TDD).

### Out of Scope
- Separate `appointment_notes` table / note history / audit trail.
- Read-only appointment detail page (edit modal remains the detail surface).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-panel`: Appointments CRUD gains a `notes` field (list column + edit textarea); internal booking wizard final step captures optional notes.
- `appointment-booking`: the appointment record and booking layer carry an optional `notes` field.
- `public-booking`: the public booking form and endpoint accept an optional notes field (trimmed, length-limited) forwarded to `bookAppointment`.

## Approach

Use the existing `appointments.notes` column (Approach 1 from exploration). Add `notes` to types, selects, and validators; render it in the admin list/modal; add a textarea to `ConfirmStep`, thread it through `wizard-state` and both booking routes, and pass it to `bookAppointment` (which already writes it).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/admin/types.ts` | Modified | Add `notes` to `Appointment` / `AppointmentInput` |
| `src/lib/admin/appointments.ts` | Modified | `SELECT_COLUMNS`, `mapRow`, `validateAppointmentInput` |
| `app/(admin)/appointments/page.tsx` | Modified | "Notas" column + edit modal textarea |
| `src/components/booking/ConfirmStep.tsx` | Modified | Notes textarea with requested label |
| `src/components/booking/wizard-state.ts` | Modified | Carry `notes` through wizard |
| `src/components/booking/BookingWizard.tsx` | Modified | Forward `notes` to booking API |
| `app/api/booking/book/route.ts` | Modified | Accept, validate, forward `notes` |
| `app/api/admin/booking/book/route.ts` | Modified | Accept, validate, forward `notes` |
| `src/lib/booking/booking.ts` | Unchanged | Already accepts `notes` |
| Tests | Modified | `ConfirmStep`, `BookingWizard`, `appointments`, both `route` tests, appointments page test |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Type/select mismatch leaves `notes` undefined | Low | Update `SELECT_COLUMNS` + `mapRow` + types together; test coverage |
| Public endpoint abuse via free text | Med | Trim + 1000-char max, validated server-side |
| Label confusion with `patients.notes` | Low | Use "Notas de la cita" labels |
| Long notes clutter the list column | Low | Truncate in list; full text in modal |

## Rollback Plan

Revert the change commits. The `notes` column already exists and is nullable, so no DB rollback is needed. `bookAppointment` note-writing is additive and harmless if the UI is reverted.

## Dependencies

- Existing migration `0007_appointment_notes.sql` (already applied).

## Success Criteria

- [ ] Admin list shows a "Notas" column and the edit modal shows/edits notes.
- [ ] Public and internal booking final steps show the notes field with the requested label.
- [ ] Notes persist to `appointments.notes` on both flows and round-trip on read.
- [ ] Typecheck, lint, unit, e2e, and build all pass.
