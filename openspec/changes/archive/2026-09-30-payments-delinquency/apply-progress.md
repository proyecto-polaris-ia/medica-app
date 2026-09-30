# Apply Progress: payments-delinquency

## Current Apply Batch

| Field | Value |
|-------|-------|
| Work unit | PR 2 / Work Unit 3 — Patient payments API routes |
| Scope | Patient payments API route handlers and API route tests only |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |
| Status | Completed |

## Completed Tasks

- [x] 1.1 RED: Created `src/lib/admin/__tests__/validate-payments.test.ts` for payment method, positive money, paid date, reversal reason, and delinquency threshold validation.
- [x] 1.2 RED: Created `src/lib/admin/__tests__/payments.test.ts` for listing, creation, plan ownership validation, updates, reversal, and double-reversal rejection.
- [x] 1.3 GREEN: Created `supabase/migrations/0016_payments.sql` with `payment_method`, `payments`, amount/reversal constraints, indexes, RLS, and `anon` revocation.
- [x] 1.4 GREEN: Created `supabase/migrations/down/0016_payments.down.sql` with safe reverse order and real-data caution.
- [x] 1.5 GREEN: Extended `src/lib/admin/types.ts` with payment and receivable types.
- [x] 1.6 GREEN: Extended `src/lib/admin/validate.ts` with financial validators.
- [x] 1.7 GREEN: Created `src/lib/admin/payments.ts` with snake_case to camelCase mapping and payment list/create/update/reverse operations.
- [x] 1.8 REFACTOR/VERIFY: Ran focused tests and supporting type/build checks.

## Strict TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `src/lib/admin/__tests__/validate-payments.test.ts` | Unit | N/A (new test file) | ✅ `npm run test -- src/lib/admin/__tests__/validate-payments.test.ts src/lib/admin/__tests__/payments.test.ts` failed because validators were missing | ✅ Focused command passed after validator implementation: 22/22 tests | ✅ Valid/invalid methods, positive/zero/negative money, valid/invalid date, empty/non-empty reversal reason, default/valid/invalid threshold | ✅ Names aligned with existing `ValidationError` parser style |
| 1.2 | `src/lib/admin/__tests__/payments.test.ts` | Unit with Supabase mock | N/A (new test file) | ✅ Same RED run failed because `src/lib/admin/payments.ts` did not exist | ✅ Focused command passed after data-layer implementation: 22/22 tests | ✅ Covered linked payment, unallocated payment, wrong-patient plan, active update, reversed update rejection, reversal, and double reversal | ✅ Query helper kept behavior assertions focused on Supabase contract |
| 1.3 | `src/lib/admin/__tests__/payments.test.ts` | Migration support via data contract | N/A (new migration) | ✅ Payment tests required persistent fields and reversal state before migration existed | ✅ Focused tests, typecheck, and build passed after schema contract was added | ➖ Structural SQL task; constraints and indexes have one intended schema output | ✅ Migration follows existing idempotent migration style |
| 1.4 | `supabase/migrations/down/0016_payments.down.sql` | Structural rollback | N/A (new migration) | ✅ Task required rollback artifact before it existed | ✅ File created and included in rollback boundary | ➖ Structural rollback task; safe reverse order has one intended output | ✅ Added explicit real-data caution before dropping schema |
| 1.5 | `src/lib/admin/__tests__/payments.test.ts` | Type/data contract | ✅ Existing treatment plan tests passed before modifying shared files: 75/75 | ✅ New tests imported and exercised payment shapes before types existed | ✅ Typecheck passed after adding payment and receivable types | ✅ Active/reversed and plan/unallocated payment shapes are covered | ✅ Types kept camelCase boundary matching existing admin patterns |
| 1.6 | `src/lib/admin/__tests__/validate-payments.test.ts` | Unit | ✅ Existing treatment plan validation tests passed before modifying shared validator: 75/75 | ✅ Validator tests failed for missing parser exports | ✅ Focused validator tests passed: 14/14 in file, 22/22 focused total | ✅ Each parser has at least one accepted and rejected path | ✅ Reused `parseMoney`, `parseIsoDate`, and `ValidationError` conventions |
| 1.7 | `src/lib/admin/__tests__/payments.test.ts` | Unit with Supabase mock | N/A (new production file) | ✅ Data-layer tests failed while module was absent | ✅ Focused command passed after implementation: 22/22 tests | ✅ List/create/update/reverse paths covered distinct data flows and conflict paths | ✅ Mapping and payload builders extracted to keep CRUD operations small |
| 1.8 | Focused command | Verification | ✅ Existing treatment plan tests passed: 75/75 | ✅ RED evidence captured before implementation | ✅ `npm run test -- src/lib/admin/__tests__/validate-payments.test.ts src/lib/admin/__tests__/payments.test.ts` passed: 2 files, 22 tests | ✅ Focused suite covers required unit scenarios | ✅ Additional `npm run typecheck` and `npm run build` passed |

## Work Unit Evidence

| Evidence | Result |
|----------|--------|
| Focused test command and exact result | `npm run test -- src/lib/admin/__tests__/validate-payments.test.ts src/lib/admin/__tests__/payments.test.ts` → exit 0; 2 test files passed; 22 tests passed. |
| Runtime harness command/scenario and exact result | N/A — data layer and migration foundation with Supabase mocked; no UI/API runtime boundary exists in Work Unit 1. |
| Typecheck | `npm run typecheck` → exit 0; `tsc --noEmit` passed. |
| Build | `npm run build` → exit 0; Next.js build completed with existing Supabase Edge Runtime warning and workspace-root lockfile warning. |
| Lint | N/A — `package.json` has no `lint` script. |
| Rollback boundary | Revert `supabase/migrations/0016_payments.sql`, `supabase/migrations/down/0016_payments.down.sql`, `src/lib/admin/types.ts`, `src/lib/admin/validate.ts`, `src/lib/admin/payments.ts`, `src/lib/admin/__tests__/validate-payments.test.ts`, and `src/lib/admin/__tests__/payments.test.ts`. |

## Files Changed

| File | Action | Evidence |
|------|--------|----------|
| `src/lib/admin/__tests__/validate-payments.test.ts` | Created | Covers task 1.1 validator scenarios. |
| `src/lib/admin/__tests__/payments.test.ts` | Created | Covers task 1.2 payment data-layer scenarios. |
| `supabase/migrations/0016_payments.sql` | Created | Defines payment enum/table/constraints/indexes/RLS and anon revocation. |
| `supabase/migrations/down/0016_payments.down.sql` | Created | Reverts indexes, table, and enum with data-loss caution. |
| `src/lib/admin/types.ts` | Modified | Adds payment and receivable TypeScript contracts. |
| `src/lib/admin/validate.ts` | Modified | Adds payment method, positive money, paid date, reversal reason, and threshold parsers. |
| `src/lib/admin/payments.ts` | Created | Adds payment list/create/update/reverse data-layer operations. |
| `openspec/changes/payments-delinquency/tasks.md` | Modified | Marks only tasks 1.1–1.8 as complete. |
| `openspec/changes/payments-delinquency/apply-progress.md` | Created | Persists this cumulative apply evidence. |

## Deviations

None — implementation matches the Work Unit 1 scope and intentionally does not implement accounts receivable calculations, API routes, UI, commits, push, or PR creation.

## Issues / Notes

- `npm run build` emitted existing warnings about workspace-root lockfile inference and Supabase usage in Edge Runtime import trace; build still completed successfully.
- `npm run lint` was not executed because no `lint` script exists in `package.json`.


---

## Work Unit 2 — Saldos derivados, créditos y morosidad

| Field | Value |
|-------|-------|
| Work unit | PR 2 / Work Unit 2 — Saldos/cartera API |
| Scope | Derived balances, credits, delinquency data layer, and global accounts-receivable API route |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |
| Status | Completed |

## Completed Tasks — Work Unit 2

- [x] 2.1 RED: Created `src/lib/admin/__tests__/accounts-receivable.test.ts` for global balances, linked/unallocated payments, reversed-payment exclusion via active-payment query, eligible statuses, plan balances, credits, cents, zero balance, `accepted_at`, `created_at` fallback, and configurable thresholds.
- [x] 2.2 GREEN: Created `src/lib/admin/accounts-receivable.ts` with `getPatientReceivableSummary` and `listAccountsReceivable`, querying only eligible plans and active payments.
- [x] 2.3 GREEN: Calculated `creditAmount`, `unallocatedPaidAmount`, `lastPaymentAt`, `baseDateSource`, `daysPastDue`, and `isPastDue` from source rows without materialized balances.
- [x] 2.4 RED: Created `app/api/admin/accounts-receivable/route.test.ts` for `401`, invalid threshold, `{ accountsReceivable }`, zero/credit exclusion through the data-layer contract, and overdue-plan highlighting.
- [x] 2.5 GREEN: Created `app/api/admin/accounts-receivable/route.ts` with `requireUser()`, `handleAdminRequest()`, `parseThresholdDays()`, and `{ accountsReceivable }` response.
- [x] 2.6 REFACTOR/VERIFY: Ran focused tests, typecheck, and build; cent precision is covered by the `151.15` and exact zero-balance test.

## Strict TDD Cycle Evidence — Work Unit 2

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 | `src/lib/admin/__tests__/accounts-receivable.test.ts` | Unit with Supabase mock | N/A (new test file) | ✅ Focused command failed because `src/lib/admin/accounts-receivable.ts` did not exist | ✅ Focused command passed after data-layer implementation: 15/15 tests | ✅ Covered no payments, linked + unallocated payments, active-payment query excluding reversals, eligible statuses, per-plan balance, unallocated plan isolation, credits, cents, zero balance, base dates, and thresholds | ✅ Extracted cents/date helpers and summary builder |
| 2.2 | `src/lib/admin/__tests__/accounts-receivable.test.ts` | Unit with Supabase mock | N/A (new production file) | ✅ Data-layer tests imported missing `getPatientReceivableSummary` and `listAccountsReceivable` | ✅ Focused command passed after implementation: 10/10 data-layer tests | ✅ Patient summary and global AR listing exercise different query shapes | ✅ Query helpers keep patient-specific and global paths explicit |
| 2.3 | `src/lib/admin/__tests__/accounts-receivable.test.ts` | Unit with Supabase mock | N/A (new production file) | ✅ Tests asserted derived fields before they existed | ✅ Focused command passed with derived credits, unallocated paid amount, last payment, base date source, days past due, and overdue flag | ✅ Credit, zero, cents, paid overdue, and threshold cases force non-hardcoded calculations | ✅ Money arithmetic centralized in cents helpers |
| 2.4 | `app/api/admin/accounts-receivable/route.test.ts` | API route unit | N/A (new test file) | ✅ Focused command failed because `app/api/admin/accounts-receivable/route.ts` did not exist | ✅ Focused command passed after route implementation: 5/5 route tests | ✅ Covered unauthorized, invalid threshold, success payload, empty payload, and overdue plan payload | ✅ Route remains thin and delegates calculations to data layer |
| 2.5 | `app/api/admin/accounts-receivable/route.test.ts` | API route unit | N/A (new route file) | ✅ Route tests imported missing `GET` handler | ✅ Focused command passed after route implementation | ✅ Default and explicit threshold paths are covered across tests | ✅ Reused `handleAdminRequest` admin API pattern |
| 2.6 | Focused command | Verification | ✅ Work Unit 1 focused tests unchanged and were not re-run because no shared payment/types/validation files were touched in this unit | ✅ RED failures captured before production files existed | ✅ `npm run test -- src/lib/admin/__tests__/accounts-receivable.test.ts app/api/admin/accounts-receivable/route.test.ts` passed: 2 files, 15 tests | ✅ Cent precision verified by expected `151.15`; exact zero verified by expected `0` | ✅ `npm run typecheck` and `npm run build` passed |

## Work Unit Evidence — Work Unit 2

| Evidence | Result |
|----------|--------|
| Focused test command and exact result | `npm run test -- src/lib/admin/__tests__/accounts-receivable.test.ts app/api/admin/accounts-receivable/route.test.ts` → exit 0; 2 test files passed; 15 tests passed. |
| Runtime harness command/scenario and exact result | `npm run test -- app/api/admin/accounts-receivable/route.test.ts` as part of the focused command → exit 0; 5 API route tests passed, including anonymous `401`, invalid threshold `400`, success `{ accountsReceivable }`, empty zero/credit-filtered response, and highlighted overdue plans. |
| Typecheck | `npm run typecheck` → exit 0; `tsc --noEmit` passed. |
| Build | `npm run build` → exit 0; Next.js build completed. Existing workspace-root lockfile warning was emitted. |
| Lint | N/A — `package.json` has no `lint` script. |
| Rollback boundary | Revert `src/lib/admin/accounts-receivable.ts`, `src/lib/admin/__tests__/accounts-receivable.test.ts`, `app/api/admin/accounts-receivable/route.ts`, and `app/api/admin/accounts-receivable/route.test.ts` without removing Work Unit 1 payment persistence files. |

## Files Changed — Work Unit 2

| File | Action | Evidence |
|------|--------|----------|
| `src/lib/admin/__tests__/accounts-receivable.test.ts` | Created | Covers derived balances, credits, cents, overdue, and global AR listing. |
| `src/lib/admin/accounts-receivable.ts` | Created | Adds patient summary and global accounts receivable calculations. |
| `app/api/admin/accounts-receivable/route.test.ts` | Created | Covers admin route authentication, validation, payload shape, and overdue plans. |
| `app/api/admin/accounts-receivable/route.ts` | Created | Adds authenticated global AR GET endpoint. |
| `openspec/changes/payments-delinquency/tasks.md` | Modified | Marks only tasks 2.1–2.6 complete in addition to prior Work Unit 1 tasks. |
| `openspec/changes/payments-delinquency/apply-progress.md` | Modified | Appends Work Unit 2 evidence while preserving Work Unit 1 evidence. |

## Deviations — Work Unit 2

None — implementation matches the Work Unit 2 scope and intentionally does not implement patient payments API routes, UI tab, global accounts receivable page, commits, push, or PR creation.

## Issues / Notes — Work Unit 2

- `npm run build` emitted the existing Next.js workspace-root lockfile warning; build still completed successfully.
- The route-level zero/credit exclusion test verifies the endpoint preserves the data-layer filtered result; the direct exclusion logic is covered in `listAccountsReceivable` tests.


---

## Work Unit 3 — API administrativa de pagos del paciente

| Field | Value |
|-------|-------|
| Work unit | PR 2 / Work Unit 3 — Patient payments API routes |
| Scope | Patient payments API route handlers and API route tests only |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |
| Status | Completed |

## Completed Tasks — Work Unit 3

- [x] 3.1 RED: Created `app/api/admin/patients/[id]/payments/route.test.ts` for authenticated `GET { payments, summary }`, successful `POST`, anonymous `401`, invalid input `400`, and wrong-patient plan rejection.
- [x] 3.2 RED: Created `app/api/admin/payments/[paymentId]/route.test.ts` for discriminated update/reverse `PATCH`, required reversal reason, reversed-payment update conflict, double-reverse conflict, missing payment `404`, unsupported action `400`, and no exported physical `DELETE`.
- [x] 3.3 GREEN: Created `app/api/admin/patients/[id]/payments/route.ts` with authenticated `GET` combining `listPayments(patientId)` and `getPatientReceivableSummary(patientId)`, plus authenticated `POST` passing `user.id` to `createPayment`.
- [x] 3.4 GREEN: Created `app/api/admin/payments/[paymentId]/route.ts` with `PATCH` discriminated by `action: 'update' | 'reverse'`, `parseJsonBody()`, `handleAdminRequest()`, and no administrative `DELETE` export.
- [x] 3.5 REFACTOR/VERIFY: Ran the focused API route command and confirmed `401/400/404/409` responses are handled through `handleAdminRequest()`.

## Strict TDD Cycle Evidence — Work Unit 3

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 | `app/api/admin/patients/[id]/payments/route.test.ts` | API route unit | N/A (new test file/route) | ✅ Focused command failed because `app/api/admin/patients/[id]/payments/route.ts` did not exist | ✅ Focused command passed after route implementation: patient payments route 6/6 tests | ✅ Covered authenticated GET, successful POST, anonymous 401, invalid input 400, and wrong-patient plan 400 | ✅ Route kept thin with a small body mapper and delegated financial rules to data layer |
| 3.2 | `app/api/admin/payments/[paymentId]/route.test.ts` | API route unit | N/A (new test file/route) | ✅ Focused command failed because `app/api/admin/payments/[paymentId]/route.ts` did not exist | ✅ Focused command passed after route implementation: payment mutation route 9/9 tests | ✅ Covered update, reverse, missing reason, unsupported action, missing payment, reversed update, double reverse, and no DELETE export | ✅ Discriminated action parser isolates route-level action validation |
| 3.3 | `app/api/admin/patients/[id]/payments/route.test.ts` | API route unit | N/A (new route file) | ✅ Tests imported missing `GET` and `POST` route handlers | ✅ `GET`/`POST` tests passed with `listPayments`, `getPatientReceivableSummary`, and `createPayment` mocks | ✅ Success and auth/error branches prove both read and write route paths | ✅ Used `Promise.all` for independent payments and summary reads |
| 3.4 | `app/api/admin/payments/[paymentId]/route.test.ts` | API route unit | N/A (new route file) | ✅ Tests imported missing `PATCH` handler and asserted no `DELETE` export | ✅ `PATCH` tests passed for update and reverse branches | ✅ Route branches plus 400/404/409 cases force real action discrimination | ✅ No `DELETE` export keeps physical deletion unavailable by route contract |
| 3.5 | Focused command | Verification | ✅ Previous Work Unit 1/2 focused commands were parent spot-checked before this unit; no shared data-layer/types/validation/accounts files were touched | ✅ RED failures captured before production route files existed | ✅ `npm run test -- app/api/admin/patients/[id]/payments/route.test.ts app/api/admin/payments/[paymentId]/route.test.ts` passed: 2 files, 15 tests | ✅ Focused suite confirms `401/400/404/409` mapping through `handleAdminRequest()` | ✅ `npm run typecheck` and `npm run build` passed after implementation |

## Work Unit Evidence — Work Unit 3

| Evidence | Result |
|----------|--------|
| Focused test command and exact result | `npm run test -- app/api/admin/patients/[id]/payments/route.test.ts app/api/admin/payments/[paymentId]/route.test.ts` → exit 0; 2 test files passed; 15 tests passed. |
| Runtime harness command/scenario and exact result | Same focused API route command → exit 0; route harness covered patient payments `GET`/`POST`, authenticated access, anonymous `401`, validation `400`, missing payment `404`, conflict `409`, and absence of physical `DELETE`. |
| Typecheck | `npm run typecheck` → exit 0; `tsc --noEmit` passed. |
| Build | `npm run build` → exit 0; Next.js build completed and included `/api/admin/patients/[id]/payments` plus `/api/admin/payments/[paymentId]`. Existing workspace-root lockfile warning was emitted. |
| Lint | N/A — `package.json` has no `lint` script. |
| Rollback boundary | Revert `app/api/admin/patients/[id]/payments/route.ts`, `app/api/admin/patients/[id]/payments/route.test.ts`, `app/api/admin/payments/[paymentId]/route.ts`, and `app/api/admin/payments/[paymentId]/route.test.ts` without removing Work Unit 1/2 data-layer or accounts-receivable files. |

## Files Changed — Work Unit 3

| File | Action | Evidence |
|------|--------|----------|
| `app/api/admin/patients/[id]/payments/route.test.ts` | Created | Covers patient payments API authentication, payload shape, create path, and validation/error mapping. |
| `app/api/admin/patients/[id]/payments/route.ts` | Created | Adds authenticated patient payments GET/POST route. |
| `app/api/admin/payments/[paymentId]/route.test.ts` | Created | Covers payment update/reverse API route and verifies no physical DELETE export. |
| `app/api/admin/payments/[paymentId]/route.ts` | Created | Adds authenticated discriminated PATCH route for update/reverse. |
| `openspec/changes/payments-delinquency/tasks.md` | Modified | Marks only tasks 3.1–3.5 complete in addition to prior Work Unit 1/2 tasks. |
| `openspec/changes/payments-delinquency/apply-progress.md` | Modified | Appends Work Unit 3 evidence while preserving Work Unit 1/2 evidence. |

## Deviations — Work Unit 3

None — implementation matches the Work Unit 3 scope and intentionally does not implement the UI tab, global page, commits, push, or PR creation.

## Issues / Notes — Work Unit 3

- `node_modules/next/dist/docs/` and `node_modules/next/` were not present in this worktree, so the repository-specific Next.js docs could not be read before route implementation; existing route patterns and successful build were used as the local source of truth.
- `npm run build` emitted the existing Next.js workspace-root lockfile warning; build still completed successfully.


---

## Work Unit 4 — Pestaña `Pagos` en expediente del paciente

| Field | Value |
|-------|-------|
| Work unit | PR 3 / Work Unit 4 — Patient payments record tab |
| Scope | Patient record `Pagos` tab only: page state, tab navigation, UI component, UI tests, and mechanical UI detector |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |
| Status | Completed |

## Completed Tasks — Work Unit 4

- [x] 4.1 RED: Modified `app/(admin)/patients/[id]/page.test.tsx` to require the `Pagos` tab and verify payment-load failure remains recoverable without hiding the other patient record tabs.
- [x] 4.2 RED: Created `src/components/admin/patient-record/PatientPaymentsTab.test.tsx` covering global balance, plan balances, account payments, reversed payment history, credit state, empty state, error/loading state, payment submit, and reversal with reason.
- [x] 4.3 GREEN: Modified `app/(admin)/patients/[id]/page.tsx` to load `/api/admin/patients/${patientId}/payments`, keep independent financial loading/error state, and refresh after payment changes.
- [x] 4.4 GREEN: Modified `src/components/admin/patient-record/PatientRecordTabs.tsx` to add `payments` tab id, `Pagos` label, and `PatientPaymentsTab` rendering without removing existing tabs.
- [x] 4.5 GREEN: Created `src/components/admin/patient-record/PatientPaymentsTab.tsx` with balance summary, per-plan balances, account payments, chronological history, manual payment form, reversal action, and `LoadingState`/`ErrorState`/`EmptyState` coverage.
- [x] 4.6 REFACTOR/VERIFY: Ran the required focused UI tests, typecheck, and Impeccable detector; reviewed visible copy for neutral/professional Mexican Spanish.

## Strict TDD Cycle Evidence — Work Unit 4

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.1 | `app/(admin)/patients/[id]/page.test.tsx` | Page integration unit | ✅ Baseline before edits: `npm run test -- app/(admin)/patients/[id]/page.test.tsx src/components/admin/patient-record/TreatmentPlansTab.test.tsx` passed; 2 files, 18 tests | ✅ Page test failed because `Pagos` tab did not exist and payments error was not routed to a recoverable tab state | ✅ Focused command passed after page/tab wiring: 18/18 tests | ✅ Navigation success and payments-load failure exercise separate page paths | ✅ Payments state is independent from record, history, visits, and treatment plan state |
| 4.2 | `src/components/admin/patient-record/PatientPaymentsTab.test.tsx` | Component integration unit | N/A (new component/test file) | ✅ Focused command failed because `src/components/admin/patient-record/PatientPaymentsTab.tsx` did not exist | ✅ Focused command passed after component implementation: component 7/7 tests | ✅ Covered non-empty balances, reversed history, credit/negative balance, empty, loading/error, create payment, and reverse payment flows | ✅ Adjusted assertions to avoid ambiguous duplicate visible values while preserving behavior checks |
| 4.3 | `app/(admin)/patients/[id]/page.test.tsx` | Page integration unit | ✅ Baseline page tests passed before modification: 10/10 | ✅ Tests required `/api/admin/patients/${patientId}/payments` failure handling before page state existed | ✅ Page test passed after `loadPayments()` and independent state were added | ✅ Success and failure responses keep financial state isolated from other tabs | ✅ Default empty summary prevents payments failure from blocking the record shell |
| 4.4 | `app/(admin)/patients/[id]/page.test.tsx` | Page/tab integration unit | ✅ Existing tab test passed before modification: 10/10 | ✅ Navigation test failed until `payments` tab id and `Pagos` label were added | ✅ Page test passed with all six tabs visible | ✅ Error scenario confirms existing tabs remain visible when payments fail | ✅ Tab prop contract keeps payments refresh separate from treatment plans refresh |
| 4.5 | `src/components/admin/patient-record/PatientPaymentsTab.test.tsx` | Component integration unit | N/A (new production component) | ✅ Component tests imported missing `PatientPaymentsTab` and failed before implementation | ✅ Component tests passed after implementing summary, form, history, and reverse UI | ✅ Payment submit and reversal tests assert actual API payloads and refresh callback behavior | ✅ Formatting helpers and method labels extracted inside the component |
| 4.6 | Focused command and detector | Verification | ✅ Previous Work Unit 3 parent spot-check passed before this unit; no shared data-layer/API route files were touched | ✅ RED failures captured before production UI existed | ✅ `npm run test -- 'src/components/admin/patient-record/PatientPaymentsTab.test.tsx' 'app/(admin)/patients/[id]/page.test.tsx'` passed: 2 files, 18 tests | ✅ UI tests cover state, action, and edge paths for the tab | ✅ `npm run typecheck` and Impeccable detector passed |

## Work Unit Evidence — Work Unit 4

| Evidence | Result |
|----------|--------|
| Focused test command and exact result | `npm run test -- 'src/components/admin/patient-record/PatientPaymentsTab.test.tsx' 'app/(admin)/patients/[id]/page.test.tsx'` → exit 0; 2 test files passed; 18 tests passed. |
| Runtime harness command/scenario and exact result | Same focused UI runtime boundary → exit 0; page harness covered `Pagos` navigation and recoverable payment-load error; component harness covered payment registration and reversal PATCH payloads. |
| Typecheck | `npm run typecheck` → exit 0; `tsc --noEmit` passed. |
| Build | Not run for this UI slice; Work Unit 4 required focused component/page tests, and typecheck was run as an additional guard. |
| Lint | N/A — `package.json` has no `lint` script. |
| Impeccable detector | `/Users/eliumontoya/.agents/skills/impeccable/scripts/impeccable detect --json 'app/(admin)/patients/[id]/page.tsx' 'src/components/admin/patient-record/PatientRecordTabs.tsx' 'src/components/admin/patient-record/PatientPaymentsTab.tsx'` → exit 0; output `[]`. |
| Rollback boundary | Revert `app/(admin)/patients/[id]/page.tsx`, `app/(admin)/patients/[id]/page.test.tsx`, `src/components/admin/patient-record/PatientRecordTabs.tsx`, `src/components/admin/patient-record/PatientPaymentsTab.tsx`, and `src/components/admin/patient-record/PatientPaymentsTab.test.tsx` without removing Work Unit 1/2/3 payment data-layer or API files. |

## Files Changed — Work Unit 4

| File | Action | Evidence |
|------|--------|----------|
| `app/(admin)/patients/[id]/page.test.tsx` | Modified | Requires `Pagos` navigation and recoverable payments error behavior. |
| `src/components/admin/patient-record/PatientPaymentsTab.test.tsx` | Created | Covers balances, account payments, reversed history, credit, empty/error states, submit, and reversal. |
| `app/(admin)/patients/[id]/page.tsx` | Modified | Adds independent payments load/error state and refresh callback. |
| `src/components/admin/patient-record/PatientRecordTabs.tsx` | Modified | Adds `payments` tab id, `Pagos` label, and component rendering. |
| `src/components/admin/patient-record/PatientPaymentsTab.tsx` | Created | Implements the patient financial tab UI and manual actions. |
| `openspec/changes/payments-delinquency/tasks.md` | Modified | Marks only tasks 4.1–4.6 complete in addition to prior Work Unit 1/2/3 tasks. |
| `openspec/changes/payments-delinquency/apply-progress.md` | Modified | Appends Work Unit 4 evidence while preserving Work Unit 1/2/3 evidence. |

## Deviations — Work Unit 4

- Build was not run because the assigned verification for this unit was the focused component/page test command; `npm run typecheck` was run as an additional guard.
- `node_modules/next/dist/docs/` is absent in this worktree, so relevant local Next.js docs could not be read; existing App Router page/test patterns were used.
- No commits, push, PR creation, or global accounts-receivable page work were performed, per the Work Unit 4 boundary.

## Issues / Notes — Work Unit 4

- Impeccable context had already reported no PRODUCT.md/DESIGN.md; this unit preserved the incumbent admin visual system and the detector returned no findings.
- Visible UI copy for the new tab is neutral/professional Spanish for Mexico; code identifiers and types remain English.


---

## Work Unit 5 — Vista global de cartera por cobrar

| Field | Value |
|-------|-------|
| Work unit | PR 4 / Work Unit 5 — Global accounts-receivable page and admin navigation |
| Scope | Global `Cartera` admin page, page test, admin navigation entry, and mechanical UI detector |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |
| Status | Completed |

## Completed Tasks — Work Unit 5

- [x] 5.1 RED: Created `app/(admin)/accounts-receivable/page.test.tsx` covering positive-balance patients, overdue plan days, defensive hiding of zero/credit rows, empty state, and recoverable error state.
- [x] 5.2 RED: Admin layout navigation harness is N/A because no stable `app/(admin)/layout.tsx` test harness existed in the repo; task evidence is documented here, and navigation was verified through build plus source readback.
- [x] 5.3 GREEN: Created `app/(admin)/accounts-receivable/page.tsx` loading `/api/admin/accounts-receivable?thresholdDays=30`, rendering summary cards, patient receivable cards, overdue plans, empty state, loading state, and recoverable error state.
- [x] 5.4 GREEN: Modified `app/(admin)/layout.tsx` to add the `Cartera` navigation link without removing existing routes.
- [x] 5.5 REFACTOR/VERIFY: Ran the required focused page/API route test command, typecheck, build, and Impeccable detector; the mocked UI fixture covers the manual cartera scenario for this unit.

## Strict TDD Cycle Evidence — Work Unit 5

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 5.1 | `app/(admin)/accounts-receivable/page.test.tsx` | Page integration unit | N/A (new page/test directory) | ✅ `npm run test -- 'app/(admin)/accounts-receivable/page.test.tsx'` failed because `./page` did not exist | ✅ Page test passed after page implementation: 4/4 tests | ✅ Covered non-empty positive balance, overdue plan days, zero/credit filtering, empty state, and request failure | ✅ Clarified assertions around repeated currency values and locale date abbreviation |
| 5.2 | `openspec/changes/payments-delinquency/apply-progress.md` | Documentation evidence | N/A — no existing stable layout navigation harness found | ✅ Task required layout navigation coverage or documented N/A before navigation edit | ✅ Documented N/A here after confirming no `AdminLayout`/layout test harness exists | ➖ Harness availability has one result: no stable harness in current repo | ✅ Navigation verified by source readback, typecheck, and build |
| 5.3 | `app/(admin)/accounts-receivable/page.test.tsx` | Page integration unit | N/A (new production page) | ✅ Tests imported missing page and failed before implementation | ✅ Page test passed with `/api/admin/accounts-receivable?thresholdDays=30` fetch and rendered cartera states | ✅ Success, empty, filtered, and error branches force real UI state handling | ✅ Extracted currency/date formatting and plan/card helpers inside the page |
| 5.4 | N/A — no stable layout test harness | Layout source change | N/A — source-only navigation edit | ✅ Task 5.2 documented the missing harness before editing layout | ✅ `npm run build` produced `/accounts-receivable` and existing admin routes successfully | ➖ Single navigation entry added without branching logic | ✅ Existing `navItems` order preserved; `Cartera` added after `Pacientes` |
| 5.5 | Focused command and detector | Verification | ✅ Parent spot-checks reported WU1 22/22, WU2 15/15, WU3 API 15/15, and WU4 UI 18/18 before this unit | ✅ RED failures captured before production page existed | ✅ `npm run test -- 'app/(admin)/accounts-receivable/page.test.tsx' 'app/api/admin/accounts-receivable/route.test.ts'` passed: 2 files, 9 tests | ✅ Mocked UI fixture validates positive cartera, overdue plan days, zero/credit hiding, empty state, and API boundary | ✅ `npm run typecheck`, `npm run build`, and Impeccable detector passed |

## Work Unit Evidence — Work Unit 5

| Evidence | Result |
|----------|--------|
| Focused test command and exact result | `npm run test -- 'app/(admin)/accounts-receivable/page.test.tsx' 'app/api/admin/accounts-receivable/route.test.ts'` → exit 0; 2 test files passed; 9 tests passed. |
| Runtime harness command/scenario and exact result | Same focused command → exit 0; page harness covered mocked cartera fixture with positive-balance patient, overdue plan with `31 días de atraso`, defensive zero/credit hiding, empty state, and recoverable API error; API route harness covered authenticated endpoint behavior. |
| Typecheck | `npm run typecheck` → exit 0; `tsc --noEmit` passed. |
| Build | `npm run build` → exit 0; Next.js build completed and included `/accounts-receivable`. Existing workspace-root lockfile warning was emitted. |
| Lint | N/A — `package.json` has no `lint` script. |
| Impeccable detector | `/Users/eliumontoya/.agents/skills/impeccable/scripts/impeccable detect --json 'app/(admin)/accounts-receivable/page.tsx' 'app/(admin)/layout.tsx'` → exit 0; output `[]`. |
| Rollback boundary | Revert `app/(admin)/accounts-receivable/page.tsx`, `app/(admin)/accounts-receivable/page.test.tsx`, and the single `Cartera` nav item in `app/(admin)/layout.tsx` without removing Work Unit 1/2/3/4 data-layer, API, or patient-payment UI files. |

## Files Changed — Work Unit 5

| File | Action | Evidence |
|------|--------|----------|
| `app/(admin)/accounts-receivable/page.test.tsx` | Created | Covers global receivables page behavior, overdue display, zero/credit hiding, empty state, and error state. |
| `app/(admin)/accounts-receivable/page.tsx` | Created | Implements global `Cartera` page with API loading, summary cards, receivable cards, overdue plans, and empty/error/loading states. |
| `app/(admin)/layout.tsx` | Modified | Adds `Cartera` admin navigation link. |
| `openspec/changes/payments-delinquency/tasks.md` | Modified | Marks only tasks 5.1–5.5 complete in addition to prior Work Unit 1/2/3/4 tasks. |
| `openspec/changes/payments-delinquency/apply-progress.md` | Modified | Appends Work Unit 5 evidence while preserving Work Unit 1/2/3/4 evidence. |

## Deviations — Work Unit 5

- `app/(admin)/layout.tsx` navigation test is documented as N/A because no stable layout/navigation test harness exists in this repository; source readback, typecheck, and build verified the one-line navigation addition.
- `node_modules/next/dist/docs/` is absent in this worktree, so relevant local Next.js docs could not be read; existing App Router page/test patterns were used.
- No Phase 6 verification, commits, push, or PR creation were performed, per the Work Unit 5 boundary.

## Issues / Notes — Work Unit 5

- `npm run build` emitted the existing Next.js workspace-root lockfile warning; build still completed successfully.
- The global page defensively filters `balance > 0` even though the data layer already excludes zero-balance and credit rows; this keeps the UI aligned with the page-level task if an unexpected API fixture includes non-pending rows.
- Visible UI copy for the new page is neutral/professional Spanish for Mexico; code identifiers and types remain English.

## Work Unit 6 — Verificación final y preparación de entrega

| Field | Value |
|-------|-------|
| Work unit | Phase 6 — Final verification and delivery prep |
| Scope | Full-suite verification, typecheck/build, lint N/A, copy review, local work-unit commits |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |
| Status | Completed |

## Completed Tasks — Work Unit 6

- [x] 6.1 VERIFY: Ran the full `npm run test` suite.
- [x] 6.2 VERIFY: Ran `npm run typecheck`; first run failed because `.next/types` referenced missing generated files, then `npm run build` regenerated them and a second `npm run typecheck` passed.
- [x] 6.3 VERIFY: Ran `npm run build`; build passed with the existing workspace-root lockfile warning.
- [x] 6.4 VERIFY: Confirmed `npm run lint` is N/A because `package.json` has no `lint` script.
- [x] 6.5 REFACTOR: Reviewed visible Spanish UI copy for neutral/professional Mexican Spanish in the payments tab and cartera page.
- [x] 6.6 DELIVERY: Prepared local work-unit commit plan using Conventional Commits and no `Co-Authored-By` attribution.

## Final Verification Evidence

| Check | Result |
|-------|--------|
| Full test suite | `npm run test` → exit 0; 94 test files passed; 734 tests passed. |
| Typecheck | First `npm run typecheck` → exit 2 due missing stale `.next/types/**` generated files; after `npm run build`, second `npm run typecheck` → exit 0. |
| Build | `npm run build` → exit 0; production build completed. Existing warning: Next inferred workspace root because multiple lockfiles exist. |
| Lint | N/A — no `lint` script exists in `package.json`. |
| Impeccable detector | Work Unit 4 and 5 detector runs both exited 0 with `[]`. |
| Delivery prep | Local commits are prepared by work unit after verification; no push or PR is performed in this phase. |

## Final Notes

- The initial typecheck failure was generated-artifact drift, not source type failure: `.next/types` had stale references to generated files that were absent before build. The subsequent successful build regenerated `.next/types`, and typecheck then passed.
- No remote operation, push, or PR creation was performed.

