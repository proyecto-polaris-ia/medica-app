# Apply Progress: Treatment Plans — Cumulative (PR 1 Foundation + PR 2 Data Layer + PR 3 API Routes + PR 4 UI)

## Cumulative State

| Phase | Task | Status |
|---|---|---|
| Phase 1 | 1.1 Migration `0015` (up) | ✅ Complete |
| Phase 1 | 1.2 Migration `0015` (down) | ✅ Complete |
| Phase 1 | 1.3 Types (`src/lib/admin/types.ts`) | ✅ Complete |
| Phase 1 | 1.4 Validators (`src/lib/admin/validate.ts`) + TDD tests | ✅ Complete |
| Phase 1 | 1.5 PR 1 Verification | ✅ Complete |
| Phase 2 | 2.1 Data layer unit tests (`treatment-plans.test.ts`) — RED | ✅ Complete |
| Phase 2 | 2.2 Data layer implementation (`treatment-plans.ts`) — GREEN | ✅ Complete |
| Phase 2 | 2.3 PR 2 Verification | ✅ Complete |
| Phase 3 | 3.1 Route list + create plans + tests | ✅ Complete |
| Phase 3 | 3.2 Route get + update + delete plan + tests | ✅ Complete |
| Phase 3 | 3.3 Route items CRUD + tests | ✅ Complete |
| Phase 3 | 3.4 PR 3 Verification | ✅ Complete |
| Phase 4 | 4.1 `PatientRecordTabs.tsx` — add `plans` tab | ✅ Complete |
| Phase 4 | 4.2 `TreatmentPlansTab.tsx` — list component | ✅ Complete |
| Phase 4 | 4.3 `TreatmentPlanForm.tsx` — editor component | ✅ Complete |
| Phase 4 | 4.4 `page.tsx` — wire data loading | ✅ Complete |
| Phase 4 | 4.5 PR 4 Verification | ✅ Complete |
| Phase 5 | 5.1–5.5 Final verification & cleanup | ⏳ Pending |

## TDD Cycle Evidence

### Phase 1 (from previous batch)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 Migration up | N/A | SQL / Manual | N/A (new file) | ✅ Reviewed SQL syntax | ✅ Idempotency checks present | ➖ Structural | ✅ Clean |
| 1.2 Migration down | N/A | SQL / Manual | N/A (new file) | ✅ Reviewed dependency order | ✅ Reverse order: indexes → tables → types | ➖ Structural | ✅ Clean |
| 1.3 Types | `src/lib/admin/__tests__/types-treatment-plans.test.ts` | Unit / Type | N/A (new file) | ✅ `tsc --noEmit` failed with missing exports | ✅ `tsc --noEmit` clean; 9 runtime tests pass | ➖ Structural type exports (single possible shape) | ✅ Clean |
| 1.4 Validators | `src/lib/admin/__tests__/validate-treatment-plans.test.ts` | Unit | ✅ Existing `validate.test.ts` 25/25 passed before edits | ✅ 38 tests failed (functions not exported) | ✅ 38 tests passed after implementation | ✅ Multiple cases per validator (happy path + edge cases + field-name assertions) | ✅ Removed duplicate assertion; `tsc --noEmit` clean |
| 1.5 Verification | Focused + full suite | N/A | ✅ Relevant admin tests 120/120 passed | N/A | ✅ Validator + type + admin tests green; typecheck green | ➖ Verification task | ✅ N/A |

### Phase 2 (from previous batch)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.1 Unit tests — RED | `src/lib/admin/__tests__/treatment-plans.test.ts` | Unit | ✅ Existing admin tests green before edits | ✅ 37 tests written referencing missing `treatment-plans.ts` exports; suite failed to load | N/A (tests written before implementation) | ✅ 2+ cases per behavior (happy path, not-found, conflict, invalid input, float arithmetic) | ✅ Clean |
| 2.2 Implementation — GREEN | `src/lib/admin/__tests__/treatment-plans.test.ts` | Unit | ✅ Existing admin tests still green | N/A | ✅ 37/37 data-layer tests pass after implementation | ✅ Coverage forced real logic: draft-only guards, transition validation, cent arithmetic, atomic cleanup | ✅ Extracted `normalizeClinicalVisitId`/`normalizeServiceId`; removed redundant `.order()` on single-item insert; `tsc --noEmit` clean |
| 2.3 Verification | Focused + full suite | Unit / Type | ✅ Relevant admin tests pass | N/A | ✅ Data-layer tests 37/37 pass; `tsc --noEmit` clean; full suite pre-existing failures isolated to booking tools | ➖ Verification task | ✅ N/A |

### Phase 3 (this batch)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 3.1 Route list + create | `app/api/admin/patients/[id]/treatment-plans/route.test.ts` | Route (unit with mocks) | ✅ Existing admin route tests green before edits | ✅ 9 tests written against stub route handlers; all failed with "not implemented" | ✅ 9/9 route tests pass after implementation | ✅ 401 + 200 list + empty list + 201 create + 400 name/providerId/unitPrice + 404 patient | ✅ Inline `parseItemInput` helper; explicit input type |
| 3.2 Route get + update + delete | `app/api/admin/patients/[id]/treatment-plans/[planId]/route.test.ts` | Route (unit with mocks) | ✅ Existing admin route tests still green | ✅ 12 tests written against stub handlers; all failed with "not implemented" | ✅ 12/12 route tests pass after implementation | ✅ 401 + 200 get + 404 + 200 valid transition + 400 invalid transition + 400 invalid status + 204 draft delete + 409 accepted delete + 404 delete missing | ✅ Inline `parseUpdateBody` helper; consistent error mapping |
| 3.3 Route items CRUD | `app/api/admin/patients/[id]/treatment-plans/[planId]/items/route.test.ts` | Route (unit with mocks) | ✅ Existing admin route tests still green | ✅ 15 tests written against stub handlers; all failed with "not implemented" | ✅ 15/15 route tests pass after implementation | ✅ 200 list + empty list + 201 draft create + 409 accepted create + 400 unitPrice/tooth + 200 status patch in accepted + 409 unitPrice patch in accepted + 400 invalid status + 204 draft delete + 409 accepted delete | ✅ Inline parse helpers in both `items/route.ts` and `items/[itemId]/route.ts` |
| 3.4 Verification | Focused + full suite | Route / Type | ✅ Existing admin tests pass | N/A | ✅ Focused route tests 36/36 pass; `tsc --noEmit` clean; full suite pre-existing failures isolated to booking tools | ➖ Verification task | ✅ N/A |

### Phase 4 (this batch)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.1 `PatientRecordTabs.tsx` | `app/(admin)/patients/[id]/page.test.tsx` | Component / Integration | ✅ Existing page tests 9/9 passed before edits | ✅ Updated test expected 5 tabs including "Plan de tratamiento"; failed because tab not yet added | ✅ 10/10 page tests pass after `PatientRecordTabs.tsx` change | ✅ Added plan tab rendering test + plan list test | ✅ Clean |
| 4.2 `TreatmentPlansTab.tsx` | `src/components/admin/patient-record/TreatmentPlansTab.test.tsx` | Component | N/A (new file) | ✅ 8 tests written against missing component; suite failed to load | ✅ 8/8 tests pass after implementation | ✅ Loading + error + empty + list with provider name + edit/delete draft-only + create/edit form open + delete refresh | ✅ Extracted `formatCurrency`/`formatDate` helpers; reused `STATUS_BADGES` map |
| 4.3 `TreatmentPlanForm.tsx` | `src/components/admin/patient-record/TreatmentPlanForm.test.tsx` | Component | N/A (new file) | ✅ 7 tests written against missing component; suite failed to load | ✅ 7/7 tests pass after implementation | ✅ Create empty fields + edit populate + read-only non-draft + live total + POST create + PATCH header/item mutations + status transition | ✅ Extracted `sumLineTotals`/`moneyToCents`/`formatCurrency` helpers; `FormModal` submitLabel made optional for read-only |
| 4.4 `page.tsx` wiring | `app/(admin)/patients/[id]/page.test.tsx` | Component / Integration | ✅ Existing page tests still green | ✅ Added treatment-plans fetch mock + tab test; failed before page wiring | ✅ 10/10 page tests pass after wiring | ✅ Tab visible + plan list fetched on tab click | ✅ Clean |
| 4.5 Verification | Focused + full suite + build | Component / Build | ✅ Existing admin + component tests pass | N/A | ✅ Focused component tests 25/25 pass; `npm run build` succeeds; `npx tsc --noEmit` clean; full suite pre-existing failures isolated to booking tools | ➖ Verification task | ✅ N/A |

### Test Summary (Phase 4)

- **Total tests written**: 25 (8 for `TreatmentPlansTab` + 7 for `TreatmentPlanForm` + 2 new/updated in `page.test.tsx` + 8 existing page tests retained as safety net)
- **Total tests passing**: 25
- **Layers used**: Component tests with mocked fetch (25)
- **Approval tests**: None — no refactoring tasks
- **Pure functions created**: 4 (`sumLineTotals`, `moneyToCents`, `formatCurrency`, `formatDate`)

### Test Summary (Phase 3)

- **Total tests written**: 36
- **Total tests passing**: 36
- **Layers used**: Route unit tests with mocks (36)
- **Approval tests**: None — no refactoring tasks
- **Pure functions created**: 4 (`parseCreateBody`, `parseUpdateBody`, `parseCreateItemBody`, `parseUpdateItemBody`)

## Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `npm run test -- --run src/components/admin/patient-record/TreatmentPlansTab.test.tsx src/components/admin/patient-record/TreatmentPlanForm.test.tsx` → `Test Files  2 passed (2)` / `Tests  15 passed (15)`; with `app/(admin)/patients/[id]/page.test.tsx`: `Test Files  3 passed (3)` / `Tests  25 passed (25)` |
| Runtime harness | `npm run build` successful production build + `npx tsc --noEmit` clean |
| Rollback boundary | Revert `PatientRecordTabs.tsx` + `app/(admin)/patients/[id]/page.tsx`; remove `TreatmentPlansTab.tsx`, `TreatmentPlanForm.test.tsx`, `TreatmentPlansTab.test.tsx`; PRs 1–3 (migration/types/validators/data layer/routes) still green |

## Deviations from Design

None — implementation matches `design.md` and `tasks.md` for Phase 4.

Small implementation refinements that stay within the design intent:
- `TreatmentPlansTab` fetches `/api/admin/providers` internally to map `providerId` to provider names for the list view; provider fetch failure is non-blocking.
- `TreatmentPlanForm` fetches `/api/admin/providers`, `/api/admin/services`, and `/api/admin/patients/[id]/clinical-visits` internally to populate selects, keeping the component self-contained.
- `TreatmentPlanForm` uses a wrapper (`TreatmentPlanEditFormWrapper`) inside `TreatmentPlansTab` to fetch the full plan with items (`TreatmentPlanWithItems`) when editing.
- `FormModal` now accepts an optional `submitLabel`; when undefined the submit button is hidden, enabling read-only plan views without a second modal component.

## Issues Found

- Pre-existing test failures in `tests/agent/tools/book-appointment.test.ts`, `tests/agent/tools/reschedule-appointment.test.ts`, and `tests/agent/tools/booking-flow.integration.test.ts` (11 tests). These appear related to expired date fixtures in the booking tools (“No se pueden agendar citas en fechas pasadas”) and are unrelated to treatment-plans. They were not fixed as part of this work unit.
- No new issues introduced by the UI work.

## PR Boundary

- **Strategy**: feature-branch-chain
- **Current PR**: PR 4 / Phase 4 — UI components + page/tabs wiring
- **Base branch**: PR 3 branch (same feature/tracker branch `feat-expediente-fase-2-planes-de-tratamiento`)
- **Scope of this batch**: `PatientRecordTabs.tsx`, `TreatmentPlansTab.tsx`, `TreatmentPlanForm.tsx`, `app/(admin)/patients/[id]/page.tsx`, plus component tests (`TreatmentPlansTab.test.tsx`, `TreatmentPlanForm.test.tsx`) and updated `page.test.tsx`.
- **Out of scope for this PR**: Phase 5 final verification; E2E smoke (`npm run test:e2e`) is optional and not executed here.
- **Estimated review budget impact**: The UI work unit is focused on the patient-record tab surface; the diff includes new components + tests + page wiring. Review is expected to exceed the 400-line guideline as a single PR, but it matches the pre-approved chain split (PR 4 is a deliverable work unit). Reported as a feature-branch-chain slice.

## Verification Commands Run

```bash
# Focused component tests (TDD cycle)
npm run test -- --run src/components/admin/patient-record/TreatmentPlansTab.test.tsx src/components/admin/patient-record/TreatmentPlanForm.test.tsx

# Page integration tests (tab wiring)
npm run test -- --run app/\(admin\)/patients/\[id\]/page.test.tsx

# Combined focused verification
npm run test -- --run src/components/admin/patient-record/TreatmentPlansTab.test.tsx src/components/admin/patient-record/TreatmentPlanForm.test.tsx app/\(admin\)/patients/\[id\]/page.test.tsx

# Full suite (pre-existing failures noted above)
npm run test

# Typecheck
npx tsc --noEmit

# Production build
npm run build
```

## Status

16/16 tasks complete (Phases 1, 2, 3 and 4). Ready for next batch (Phase 5: final verification & cleanup).
