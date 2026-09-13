# Apply Progress: Patient Record Summary

## Completed

- Added patient record read model and admin API route.
- Added shared patient record view and modal components.
- Added `/patients/[id]` record page.
- Added patient record action to the patients list.
- Added appointment list patient-name action that opens the record modal.
- Added calendar patient-name action that opens the record modal while preserving block click-to-edit behavior.
- Added focused tests for data classification, API auth, patient list link, appointments modal trigger, and calendar patient-name selection.

## Verification

- `npm run test -- src/lib/admin/__tests__/patient-record.test.ts 'app/api/admin/patients/[id]/record/route.test.ts' src/components/admin/calendar/__tests__/MonthCalendar.test.tsx 'app/(admin)/patients/page.test.tsx' 'app/(admin)/appointments/page.test.tsx'` — passed.
- `npm run typecheck` — passed.
- `npm run test` — passed.
- `npm run build` — passed with an existing Supabase Edge Runtime warning.
