# Tasks: Dual-Use Booking (public + internal)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750–950 (8 new files, ~10 modified, ~10 test files) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | single PR (delivery strategy) — requires `size:exception` |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Shared lib + state + wizard UI (no API changes yet) | PR 1 (if chained) | `npm run test -- src/lib/booking src/components/booking` | `npm run test` + `npm run typecheck` | Revert wizard-state/ConfirmStep/BookingWizard/PatientSearch/TurnstileWidget; public page deleted |
| 2 | API split + Turnstile gate + patient resolution | PR 2 (if chained) | `npm run test -- app/api/booking app/api/admin` | `npm run test` + `npm run typecheck` | Revert route changes; re-add `requireUser` to public catalog/book |

Since delivery strategy is `single-pr`, the above split is informational only. A `size:exception` maintainer approval is required before apply.

## Phase 1: Foundation — shared lib + wizard state (test-first)

- [x] 1.1 **RED** — `src/lib/booking/__tests__/turnstile.test.ts`: verify valid token → true, invalid → false, missing secret → throws `TurnstileUnavailableError`.
- [x] 1.2 **GREEN** — `src/lib/booking/turnstile.ts`: `verifyTurnstile(token)` fetches Cloudflare endpoint; throws typed error when `TURNSTILE_SECRET_KEY` absent.
- [x] 1.3 **RED** — `src/lib/booking/__tests__/patient-resolution.test.ts` (extend): `resolvePatientById(id)` returns patient when found, throws not-found when absent.
- [x] 1.4 **GREEN** — `src/lib/booking/patient-resolution.ts`: add `resolvePatientById` (read-only `.select('id, full_name').eq('id', id).maybeSingle()`).
- [x] 1.5 **RED** — `src/lib/admin/__tests__/patients.test.ts` (extend): `searchPatients(q)` filters by `full_name` (ilike) and `phone_e164` (contains).
- [x] 1.6 **GREEN** — `src/lib/admin/patients.ts`: add `searchPatients(q)`; empty `q` returns empty array.
- [x] 1.7 **RED+GREEN** — `src/components/booking/wizard-state.ts` + `wizard-state.test.ts`: add `patientId: string | null`, `captchaToken: string | null`, `SET_PATIENT_ID` / `SET_CAPTCHA` actions; reset in `RESET`/`initState`.

## Phase 2: API split + auth (test-first)

- [x] 2.1 **RED** — update `app/api/booking/{services,providers,slots}` tests: remove 401 assertions, assert 200 for anonymous caller.
- [x] 2.2 **GREEN** — remove `requireUser()` from `app/api/booking/services/route.ts`, `providers/route.ts`, `slots/route.ts`.
- [x] 2.3 **RED** — extend `app/api/booking/book/route.test.ts`: 400 on `patientId` in body, 400 missing/invalid token, 503 missing secret, 201 valid token, 409 conflict, no session required.
- [x] 2.4 **GREEN** — `app/api/booking/book/route.ts`: remove `requireUser()`, add `verifyTurnstile` gate before write, reject `patientId` with 400, keep conflict path.
- [x] 2.5 **RED** — `app/api/admin/booking/book/route.test.ts`: 401 without session, 201 resolve by `patientId`, 201 resolve/create by phone, 400 when neither provided.
- [x] 2.6 **GREEN** — `app/api/admin/booking/book/route.ts`: `requireUser()`, parse `patientId` XOR `{phone, fullName}`, call `resolvePatientById` or `resolvePatient`, then `bookAppointment`.
- [x] 2.7 **RED** — extend `app/api/admin/patients/route.test.ts`: 401 without session, `?q=` filters results, empty `q` returns all.
- [x] 2.8 **GREEN** — `app/api/admin/patients/route.ts`: read optional `?q=` and call `searchPatients(q)`.

## Phase 3: Wizard UI (test-first)

- [x] 3.1 **RED+GREEN** — `src/components/booking/TurnstileWidget.tsx` + `__tests__/TurnstileWidget.test.tsx`: CDN script load, `onToken`/`onExpire` callbacks, disabled state until token.
- [x] 3.2 **RED+GREEN** — `src/components/booking/PatientSearch.tsx` + `__tests__/PatientSearch.test.tsx`: debounced `?q=` fetch, emits selected `Patient`, 401 handling.
- [x] 3.3 **RED+GREEN** — `src/components/booking/__tests__/ConfirmStep.test.tsx` + `ConfirmStep.tsx`: branch by `mode` — internal shows `PatientSearch` (read-only selected patient) OR free text; public shows `TurnstileWidget` gating submit.
- [x] 3.4 **RED+GREEN** — `src/components/booking/BookingWizard.test.tsx` + `BookingWizard.tsx`: accept `mode` prop, thread `captchaToken`/`patientId`, choose write endpoint per mode (`/api/booking/book` vs `/api/admin/booking/book`), inject Turnstile site key.
- [x] 3.5 **GREEN** — `app/booking/page.tsx`: create public page rendering `<BookingWizard mode="public" />` outside `(admin)`.
- [x] 3.6 **GREEN** — `app/(admin)/booking/page.tsx`: add `mode="internal"` prop to existing wizard render.

## Phase 4: Integration verification

- [x] 4.1 Run `npm run test` — all 220+ tests pass including new ones.
- [x] 4.2 Run `npm run typecheck` — zero errors.
- [x] 4.3 Manual smoke: anonymous `/booking` with valid CAPTCHA books; `/appointments/new` selects existing patient and books (internal route moved from `(admin)/booking` to `(admin)/appointments/new` to resolve the `/booking` route-group collision — see verify report); missing keys disable public submit with message.
