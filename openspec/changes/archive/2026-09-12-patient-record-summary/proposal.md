# Proposal: Patient Record Summary

## Intent

Create the first patient record surface for clinic staff so patient identity, upcoming appointments, and attended appointment history can be reviewed from the patient list and appointment calendar without changing booking semantics.

## Scope

### In Scope
- Add a read-only patient record summary endpoint for authenticated admin users.
- Add a patient record page reachable from the patient list.
- Add patient-record modal access from appointment calendar/list patient names.
- Show patient contact data, notes, future appointments, and attended appointments.

### Out of Scope
- Clinical notes, diagnosis, prescriptions, payments, documents, and file uploads.
- Patient self-service record access.
- Appointment mutations from the record view.

## Capabilities

### New Capabilities
- `patient-record-summary`: Read-only initial patient record summary for staff.

### Modified Capabilities
- `admin-panel`: Patient list and appointment list actions expose record access.
- `appointments-calendar-view`: Calendar patient names can open the record modal.

## Approach

Add a server-side admin data reader that fetches patient data and appointment rows through Supabase service-role access behind an authenticated API route. Reuse a shared React record panel for both the dedicated page and the modal. Keep the LLM and WhatsApp paths out of scope; this is an admin UI read surface.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/admin` | New | Patient record summary data reader and types. |
| `app/api/admin/patients/[id]/record` | New | Authenticated record summary API. |
| `app/(admin)/patients` | Modified | Adds record navigation from the patient list. |
| `app/(admin)/appointments` | Modified | Adds patient record modal access from patient names. |
| `src/components/admin/calendar` | Modified | Calendar blocks expose patient-name click handling. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Misclassifying appointment history | Medium | Define future appointments by start time and non-terminal status; define attended history by `attended` status. |
| Secret leakage to client | Low | Keep Supabase service-role reads in server-side admin API routes only. |
| Calendar click conflicts with edit flow | Medium | Keep block click for edit; stop propagation only on patient-name button. |

## Rollback Plan

Revert the branch. The change is additive and does not introduce schema changes or data migrations.

## Dependencies

- Existing `patients`, `appointments`, `services`, and `providers` tables.
- Existing admin authentication/session enforcement.

## Success Criteria

- [ ] Staff can open `/patients/{id}` from the patient list.
- [ ] The record shows patient data, future appointments, and attended appointments.
- [ ] Appointment list/calendar patient names open the record modal.
- [ ] Admin record API requires an authenticated user.
- [ ] Typecheck, tests, and build pass.
