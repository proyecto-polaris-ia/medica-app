# Design: Appointment Notes

## Technical Approach

Surface the existing `appointments.notes` column (`text`, nullable; migration `0007_appointment_notes.sql`) end-to-end: add `notes` to the admin `Appointment`/`AppointmentInput` types, `SELECT_COLUMNS`, `mapRow`, and `validateAppointmentInput`; render a truncated "Notas" column and a "Notas de la cita" textarea in the edit modal; add the same textarea to the shared `ConfirmStep` (public + internal) and thread it through both booking routes into `bookAppointment` (which already writes the column). This is Approach 1 from exploration.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Existing `appointments.notes` column | No history/multi-note; lowest effort, matches schema | ✅ Chosen (Approach 1) |
| New `appointment_notes` table | History + multi-note; needs migration/RLS/repo | ❌ Rejected (over-engineering) |

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Notes via `ConfirmPatient` (like `captchaToken`) | Local to ConfirmStep, no reducer churn | ✅ Chosen — follows existing pattern |
| Notes in `WizardState`/reducer | Global state, but notes never cross steps | ❌ Rejected (proposal listed it; unnecessary) |

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `parseNotes` in both validate modules | Duplication, but two distinct `ValidationError` classes exist | ✅ Chosen — mirrors existing parseUuid/parseIsoDate duplication |
| Single shared helper | DRY, but cross-class `instanceof` breaks error routing | ❌ Rejected |

## Data Flow

```
Public:   /booking → ConfirmStep(textarea) → body.notes → POST /api/booking/book
Internal: /appointments/new → same ConfirmStep → body.notes → POST /api/admin/booking/book
              └─ parseNotes(trim + 1000 cap) → bookAppointment(trim + null) → appointments.notes
Admin CRUD: modal textarea → POST/PATCH /api/admin/appointments[/id] → validateAppointmentInput → notes
Admin read: listAppointments(SELECT_COLUMNS+notes) → mapRow → "Notas" column
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/admin/types.ts` | Modify | `Appointment.notes: string \| null`; `AppointmentInput.notes?: string \| null` |
| `src/lib/admin/appointments.ts` | Modify | `notes` in `SELECT_COLUMNS` + `mapRow`; trim/cap in `validateAppointmentInput` |
| `src/lib/admin/validate.ts` | Modify | Add `parseNotes(value, field)` → trim, empty→null, >1000 throws |
| `app/api/booking/_lib/validate.ts` | Modify | Add `parseNotes` (booking `ValidationError`) |
| `src/lib/booking/booking.ts` | Modify | Trim `notes`; empty→null (defense in depth) |
| `src/components/booking/ConfirmStep.tsx` | Modify | Notes textarea; add `notes?` to `ConfirmPatient` + payload |
| `src/components/booking/BookingWizard.tsx` | Modify | Forward `patient.notes` into request `body` |
| `app/api/booking/book/route.ts` | Modify | `parseNotes(body.notes)`; pass to `bookAppointment` |
| `app/api/admin/booking/book/route.ts` | Modify | `parseNotes(body.notes)`; pass to `bookAppointment` |
| `app/api/admin/appointments/route.ts` | Modify | Forward `notes` into `createAppointment` |
| `app/api/admin/appointments/[id]/route.ts` | Modify | Forward `notes` into `updateAppointment` |
| `app/(admin)/appointments/page.tsx` | Modify | "Notas" column (~80 chars, "—" empty); textarea + `maxLength={1000}` in modal; `notes` in `emptyAppointment`/`openEdit` |
| Tests (see below) | Modify | `ConfirmStep`, `BookingWizard`, `appointments`, both `route`, page test |

## Interfaces / Contracts

```ts
type Appointment = { /* ... */ notes: string | null };
type AppointmentInput = { /* ... */ notes?: string | null };
type ConfirmPatient = { /* ... */ notes?: string };

// Both validate modules:
function parseNotes(value: unknown, field = 'notes'): string | null;
// trim → '' becomes null; length > 1000 throws ValidationError(field)
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `parseNotes` trim/cap/null; `validateAppointmentInput`; `bookAppointment` trim | Vitest, `validate.test.ts`, `appointments.test.ts` |
| Unit | `ConfirmStep` renders textarea, enforces 1000, forwards notes; `BookingWizard` body | `ConfirmStep.test.tsx`, `BookingWizard.test.tsx` |
| Integration | Both `book` routes accept/reject/forward notes | `route.test.ts` (public + admin) |
| Component | "Notas" column truncation + "—" + modal round-trip | `app/(admin)/appointments/page.test.tsx` |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required — column exists and is nullable. Rollback = revert commits; `bookAppointment` note-writing is additive.

## Open Questions

- [ ] Label wording: public spec says label "Notas de la cita"; admin-panel spec says the confirm-step prompt "¿Quieres agregar algo más para tener en consideración para tu cita?". Resolution: label "Notas de la cita" + that prompt as `placeholder` (satisfies both).
- [ ] Pre-existing: `app/api/admin/booking/book/route.ts` imports `parseIsoDate` from booking validate (booking `ValidationError`) but `handleAdminRequest` catches admin `ValidationError` — latent 500 on bad input. Out of scope; flag only.
