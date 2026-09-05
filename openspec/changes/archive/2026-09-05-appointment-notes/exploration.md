## Exploration: appointment-notes

### Current State

The database already has a `notes` column on `appointments` (`text`, nullable), added in migration `0007_appointment_notes.sql`. However, the application currently ignores it:

- `Appointment` type and `SELECT_COLUMNS` in `src/lib/admin/appointments.ts` do not include `notes`, so the admin list/detail never sees it.
- `bookAppointment` in `src/lib/booking/booking.ts` already accepts an optional `notes` argument and writes it to the column, but no caller passes it.
- The public (`/api/booking/book`) and internal (`/api/admin/booking/book`) booking endpoints do not read or forward `notes`.
- `ConfirmStep.tsx` — the last step of the booking wizard for both public and internal flows — only asks for phone, full name, and (for public) Turnstile. There is no notes textarea.
- The admin appointments list (`app/(admin)/appointments/page.tsx`) uses an editable modal as both list and the closest thing to a detail view. There is no separate read-only appointment detail page.
- Existing patient notes UI/API (`app/(admin)/patients/page.tsx`, `app/api/admin/patients/*`) provides a pattern to copy: a "Notas" column in the list and a textarea in the form.

### Affected Areas

- `supabase/migrations/0007_appointment_notes.sql` — existing column definition.
- `src/lib/admin/types.ts` — `Appointment` / `AppointmentInput` lack `notes`.
- `src/lib/admin/appointments.ts` — `SELECT_COLUMNS`, `mapRow`, `validateAppointmentInput`, `createAppointment`, `updateAppointment` ignore `notes`.
- `app/(admin)/appointments/page.tsx` — list columns and edit modal need a notes field.
- `src/components/booking/ConfirmStep.tsx` — needs a notes textarea with the requested label.
- `src/components/booking/wizard-state.ts` — needs to carry `notes` through the wizard.
- `src/components/booking/BookingWizard.tsx` — needs to forward `notes` to the booking API.
- `app/api/booking/book/route.ts` — needs to accept and validate `notes`, pass to `bookAppointment`.
- `app/api/admin/booking/book/route.ts` — same for the internal flow.
- `src/lib/booking/booking.ts` — already supports `notes`; no change required unless validation is added.
- Tests: `ConfirmStep.test.tsx`, `BookingWizard.test.tsx`, `appointments.test.ts`, `route.test.ts` files for both booking routes, and `app/(admin)/appointments/page.test.tsx`.

### Approaches

1. **Use the existing `appointments.notes` column** — add the field to types, API payloads, the admin list/detail, and the booking wizard.
   - Pros: schema already exists; `bookAppointment` already writes `notes`; lowest effort; fits the single note-per-appointment mental model.
   - Cons: no history of note edits; list column can get noisy with long text.
   - Effort: Low

2. **Introduce a separate `appointment_notes` table** (one-to-many, linked to `appointments`) and keep `appointments.notes` as a summary or drop it.
   - Pros: supports multiple notes, audit trail, and future requirements.
   - Cons: contradicts the existing schema; over-engineering for "one note at booking"; requires migration, RLS, new types, and new repository functions.
   - Effort: Medium/High

### Recommendation

Use **Approach 1**: surface and write to the existing `appointments.notes` column. It matches the current schema, the existing `bookAppointment` signature, and the scope of the request. A future change can migrate to a dedicated notes table if multi-note/history becomes a real requirement.

### Risks

- **Type/select mismatch**: if `notes` is added to the UI but not to `SELECT_COLUMNS` and the `Appointment` type, the field will be silently `undefined`.
- **Public endpoint abuse**: accepting free-form text from the public booking flow requires a length limit and basic sanitization (e.g., trim, max 1000 chars) before persistence.
- **Ambiguous terminology**: `patients.notes` already exists; UI labels must say "Notas de la cita" or similar to avoid confusion.
- **No dedicated detail view**: the edit modal is currently the only place to see full appointment data. Adding notes there is acceptable, but if the product later wants a read-only detail, the modal should be split.
- **Test debt**: strict TDD is enabled; every touched layer needs a corresponding test update.

### Ready for Proposal

Yes. The next phase should produce a delta spec for adding `notes` to the appointment type, admin list/detail, and both booking flows, with test scenarios for each layer.
