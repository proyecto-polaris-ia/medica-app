# Design: Patient Record Summary

## Data Boundary

`src/lib/admin/patient-record.ts` owns the read model. It validates the patient id, fetches the patient row, fetches linked appointments with embedded service/provider names, and returns a UI-ready `PatientRecord` object. The API route requires `requireUser()` before calling the reader.

## Classification

- Future appointments: `start_at >= now` and status not in `cancelled`, `rescheduled`, `no_show`, or `attended`, sorted ascending.
- Attended appointments: status `attended`, sorted descending.

## UI

`PatientRecordView` is pure and shared by:
- `/patients/[id]` full page.
- `PatientRecordModal` opened from appointments list/calendar.

Patient list navigation uses a record action. Appointment list patient names and calendar patient-name actions open the modal, while the rest of a calendar block keeps the edit behavior.

## Security

No client code imports Supabase admin helpers. All record data flows through `/api/admin/patients/[id]/record`, protected by the existing admin session requirement.
