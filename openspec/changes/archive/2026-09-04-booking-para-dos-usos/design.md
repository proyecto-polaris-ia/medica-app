# Design: Dual-Use Booking (public + internal)

## Technical Approach

Opción A: one reusable `BookingWizard` with a `mode: 'public' | 'internal'` prop. Only two pieces change meaningfully — `wizard-state` (add `patientId`) and `ConfirmStep` (patient search/select in internal mode, Turnstile widget in public mode). `ServiceStep`/`ProviderStep`/`SlotStep`/`ResultStep`/`StepShell`/`StepIndicator`/`StateBlock`, plus `availability.ts`, `catalog.ts`, `next-available.ts`, and the atomic `booking.ts` stay untouched. Both write paths share `bookAppointment` (atomic exclusion per provider).

Public `/booking` and internal `/admin/booking` split the single current surface. Write clears `requireUser()` from the public path and gates it behind server-side Turnstile verification; the internal path stays behind `requireUser()` and adds `patientId` resolution. Catalog endpoints become public; patient search is a new authenticated query on the existing admin patients endpoint.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| A: one wizard + `mode` prop | Centralized flow logic; `ConfirmStep` gains conditional branches | **Chosen** |
| B: two wizards (copy) | No cross-contamination, but duplicate reducer/effects/steps; any fix lands twice | Rejected |
| C: internal reuses public API + patientId | One write API, but exposes `patientId` on a public route → enumeration | Rejected (security) |
| Public write: separate endpoint vs `requireUser`-conditional | Separate `/api/admin/booking/book` keeps public truly public, no auth branch on `book/route.ts` | **Chosen** (separate internal endpoint) |
| CAPTCHA: Turnstile (CDN + fetch) vs reCAPTCHA (npm dep) | Turnstile = no dependency, privacy-oriented, free | **Chosen** (Turnstile) |

## Data Flow

```
Public:   /booking ── BookWizard(mode=public)
          └ ConfirmStep: name+phone + Turnstile(captchaToken)
             └ POST /api/booking/book  {serviceId,providerId,startAt,endAt,phone,fullName,captchaToken}
                ├ no requireUser → verifyTurnstile(token) → resolvePatient(phone) → bookAppointment()
                └ rejects `patientId` (400) · missing secret → 503 · bad token → 400

Internal: /admin/booking ── BookWizard(mode=internal)  [auth layout]
          └ ConfirmStep: search/select patient OR name+phone
             └ GET /api/admin/patients?q=...  (401 w/o session)
             └ POST /api/admin/booking/book {patientId} XOR {phone,fullName}, +slot
                ├ requireUser() → resolvePatientById(id) | resolvePatient(phone) → bookAppointment()
```

## File Changes

| File | Action | Description |
|---|---|---|
| `app/booking/page.tsx` | Create | Public page, outside `(admin)`. Renders `<BookingWizard mode="public" />`. |
| `app/(admin)/booking/page.tsx` | Modify | Keep as internal; add `mode="internal"` + nav label already `/booking`. |
| `app/(admin)/layout.tsx` | Modify | No change required — `(admin)` auth intact; `/admin/booking` resolves under it. (Nav href `/booking` already routes internally within the group.) |
| `src/components/booking/BookingWizard.tsx` | Modify | Accept `mode` prop; thread `captchaToken`/`patientId` into `handleConfirm`; choose write endpoint per mode; inject Turnstile site key. |
| `src/components/booking/wizard-state.ts` | Modify | Add `patientId: string \| null` and `captchaToken: string \| null` to `WizardState`; add `SET_PATIENT_ID`/`SET_CAPTCHA` actions; reset in `RESET`/`initState`. |
| `src/components/booking/ConfirmStep.tsx` | Modify | Branch by `mode`: internal adds search+select (read-only selected patient) OR free text; public adds Turnstile widget + gating of submit. |
| `src/components/booking/TurnstileWidget.tsx` | Create | Client wrapper loads Cloudflare CDN script, renders widget, calls `onToken`/`onExpire`. No npm dep. |
| `src/components/booking/PatientSearch.tsx` | Create | Debounced search field + results list bound to `?q=` endpoint; emits selected `Patient`. |
| `src/lib/booking/turnstile.ts` | Create | `verifyTurnstile(token)` — `fetch` to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `TURNSTILE_SECRET_KEY`; returns boolean. Degrades: missing secret → throw typed `TurnstileUnavailableError`. |
| `src/lib/booking/patient-resolution.ts` | Modify | Add `resolvePatientById(id)` (read-only `.select('id, full_name').eq('id', id).maybeSingle()`, throw `NotFoundError`-equivalent if absent). Existing `resolvePatient` unchanged. |
| `app/api/booking/book/route.ts` | Modify | Remove `requireUser()`; add `verifyTurnstile` gate; reject any `patientId` in body; keep `isBookingUiEnabled` + conflict path. |
| `app/api/booking/services/route.ts` | Modify | Remove `requireUser()`. |
| `app/api/booking/providers/route.ts` | Modify | Remove `requireUser()`. |
| `app/api/booking/slots/route.ts` | Modify | Remove `requireUser()`. |
| `app/api/admin/booking/book/route.ts` | Create | Auth via `requireUser()`; parse `patientId` XOR `{phone,fullName}`; resolve; `bookAppointment`. Reuses `_lib/responses.handleAdminRequest`. |
| `app/api/admin/patients/route.ts` | Modify | `GET` reads optional `?q=` → `searchPatients(q)`. |
| `src/lib/admin/patients.ts` | Modify | Add `searchPatients(q)` filtering `full_name` (ilike) and `phone_e164` (raw contains). |
| `src/lib/booking/types.ts` | Modify (optional) | Add `Turnstile` env types / shared result type if needed. |

## Interfaces / Contracts

```ts
// wizard-state additions
type WizardState = {
  // ...
  patientId: string | null;       // internal mode only
  captchaToken: string | null;    // public mode only
};
type WizardAction =
  | { type: 'SET_PATIENT_ID'; patientId: string | null }
  | { type: 'SET_CAPTCHA'; token: string | null };

// public write body
{ serviceId, providerId, startAt, endAt, phone, fullName, captchaToken }  // NO patientId

// internal write body
{ serviceId, providerId, startAt, endAt } & ({ patientId } | { phone, fullName })

// patient search
GET /api/admin/patients?q=<fragment> → { patients: Patient[] }   // 401 without session
```

Envs: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (client), `TURNSTILE_SECRET_KEY` (server-only — do not `NEXT_PUBLIC_` it).

## Security

- **Public never accepts `patientId`** — `book/route.ts` returns 400 if present (enumeration defense).
- **Turnstile verified server-side before any write** — reject 400 on missing/invalid token, 503 when secret absent.
- **Internal `requireUser()` → 401** without session (reuse `handleAdminRequest`).
- **No silent degradation** — missing keys → public submit disabled with message; server never accepts a token when secret is absent.
- **Atomic booking unchanged** — both flows call the same `bookAppointment` (23P01 exclusion).
- Rate limiting is explicitly a follow-up (out of scope).

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (route) | `/api/booking/book`: no `requireUser`; 400 on `patientId`; 400 bad/missing token; 503 missing secret; 201 valid token; 409 conflict | Extend `app/api/booking/book/route.test.ts`; mock `verifyTurnstile` |
| Unit (route) | `/api/admin/booking/book`: 401 no session; resolve by id; resolve/create by phone | New `app/api/admin/booking/book/route.test.ts`; mock `resolvePatientById` |
| Unit (route) | `/api/booking/{services,providers,slots}` public (no 401 case) | Update existing tests: remove 401 assertion, assert 200 anonymous |
| Unit (route) | `/api/admin/patients?q=` 401 + filtered results | Extend `app/api/admin/patients/route.test.ts` |
| Unit (lib) | `searchPatients`, `resolvePatientById`, `verifyTurnstile` | New tests in `src/lib/admin/__tests__/patients.test.ts`, `src/lib/booking/__tests__/` |
| Component | `BookingWizard` both modes; `ConfirmStep` select vs free-text; `TurnstileWidget` disabled-until-token; `PatientSearch` debounce | Update `BookingWizard.test.tsx`; new `ConfirmStep`/`TurnstileWidget`/`PatientSearch` tests |

## Threat Matrix

`N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.` (This is an HTTP route split + server-side CAPTCHA verify via `fetch`; no shell/subprocess/exec boundary.)

## Migration / Rollout

No migration required (no schema change; DB untouched). Rollout is deploy-only, gated by existing `NEXT_PUBLIC_BOOKING_UI_ENABLED` flag plus new Turnstile envs.

### Rollback mapping

1. `git revert` the feature branch (deploy-revert).
2. Delete `app/booking/page.tsx`, `app/api/admin/booking/`, Turnstile widget/lib.
3. Re-add `requireUser()` to `app/api/booking/book` + catalog routes.
4. Restore `mode`-less `BookingWizard`/`wizard-state` (remove `patientId`/`captchaToken`).
5. Remove `NEXT_PUBLIC_TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` → public submit disables cleanly.

## Open Questions

- [ ] `node_modules` not installed in this worktree — the repo rule to read `node_modules/next/dist/docs/` before coding cannot be satisfied here; should be done at apply time after install. No observed API surface in this change depends on modified Next.js internals (App Router `page.tsx`/`route.ts` conventions used match existing code).
- [ ] Internal flow: if staff selects an existing patient AND re-types a phone, spec says "used as-is" — confirm selected patient's fields are non-editable (design assumes read-only confirm display, not a create-new).
- [ ] Whether the admin nav label for `/booking` should change to reflect it now maps to `/admin/booking` (currently `{ href: '/booking', label: 'Reservar cita' }` inside the `(admin)` group already resolves to `/admin/booking` — no code change, cosmetic only).
