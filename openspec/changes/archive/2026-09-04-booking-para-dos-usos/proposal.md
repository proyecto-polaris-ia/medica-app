# Proposal: Dual-Use Booking (public + internal)

## Intent

The clinic needs two booking surfaces from one flow:

1. **Public self-service** — patients book their own appointments at `/booking`, outside login, protected by a CAPTCHA so the exposed form is not abused.
2. **Internal booking** — staff book on a patient's behalf at `/admin/booking` inside login, and may select/search an existing patient instead of re-typing name + phone.

Today there is only ONE booking surface (`/booking`, behind login) and no CAPTCHA. The issue assumes a public booking exists; exploration confirmed it does not.

## Scope

### In Scope
- Public booking route `/booking` (new `app/booking/page.tsx`, outside `(admin)`).
- Internal booking route `/admin/booking` (move current `app/(admin)/booking/page.tsx`).
- Reusable `BookingWizard` with a `mode: 'public' | 'internal'` prop (Opción A).
- Cloudflare Turnstile CAPTCHA on the public submit (CDN script + server-side `fetch` verify, no npm dep). Env: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.
- Public write endpoint without session but Turnstile-protected.
- Internal authenticated booking endpoint accepting `patientId` OR `{ phone, fullName }`.
- Patient search (`?q=` on `/api/admin/patients`, filter `full_name` / `phone_e164`).

### Out of Scope
- Rate limiting / abuse throttling on the public API (follow-up).
- Editing patient records from the booking form (existing patients used as-is).
- travelhub-app changes (copy + adapt only).
- Domain guardrails (no diagnosis, no meds, no price decisions, availability only from DB) remain untouched.

## Capabilities

### New Capabilities
- `public-booking`: unauthenticated `/booking` flow; Turnstile CAPTCHA required before submit; graceful degradation when keys are missing (public submit disabled with explanatory message).
- `booking-patient-selection`: internal `/admin/booking` lets staff search/select an existing patient or create one implicitly; endpoint resolves by `patientId` or phone.

### Modified Capabilities
- `admin-panel`: "Booking flow behind login" splits into public `/booking` + internal `/admin/booking`; "Unauthenticated API rejection" gains a public-booking exception; "Protected admin routes" updates.
- `appointment-booking`: "Patient resolution from contact" extends to resolve by `patientId` in addition to `phone_e164` + `fullName`.

## Approach

Opción A — one `BookingWizard` with `mode` prop. Only `ConfirmStep` (patient select vs. free text + CAPTCHA) and `wizard-state` (add `patientId`) change meaningfully. `ServiceStep`/`ProviderStep`/`SlotStep`/`ResultStep`, `availability.ts`, `catalog.ts`, and atomic `booking.ts` stay untouched.

- **Public**: catalog endpoints (`services`, `providers`, `slots`) become public; `POST /api/booking/book` drops `requireUser()` but MUST verify the Turnstile token server-side before any write.
- **Internal**: `POST /api/admin/booking/book` (authenticated) accepts `patientId` OR `{ phone, fullName }`, resolves/creates via existing `patient-resolution.ts`, then `bookAppointment`.

## Security Considerations

- Removing `requireUser()` from the public write path exposes it to abuse; Turnstile is the required gate and MUST be verified server-side on every submit.
- Public catalog/search MUST NOT leak patient enumeration — public routes never accept `patientId`; only the authenticated internal endpoint resolves it.
- Internal endpoint stays behind `requireUser()` (401 otherwise).
- Missing Turnstile keys → public submit disabled with a clear message; never silently degrade, never accept a token when the secret is absent.
- Booking write remains atomic (exclusion constraint per provider).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/booking/page.tsx` | New | Public wizard (`mode="public"`). |
| `app/(admin)/booking/page.tsx` | Moved | Internal route `/admin/booking` (`mode="internal"`). |
| `src/components/booking/BookingWizard.tsx` | Modified | Add `mode` prop. |
| `src/components/booking/ConfirmStep.tsx` | Modified | Patient select/search vs. free text + Turnstile. |
| `src/components/booking/wizard-state.ts` | Modified | Add `patientId`. |
| `app/api/booking/book/route.ts` | Modified | Public variant + Turnstile verify. |
| `app/api/admin/booking/book/route.ts` | New | Authenticated booking with `patientId`. |
| `app/api/admin/patients/route.ts` + `src/lib/admin/patients.ts` | Modified | Optional `?q=` search. |
| `src/lib/booking/patient-resolution.ts` | Modified | Resolve by `patientId`. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Public API abuse once session removed | High | Turnstile server-side + rate-limit as follow-up. |
| Patient enumeration via public API | Med | Public routes never accept `patientId`. |
| CAPTCHA key mismatch/absence breaks submit | Med | Graceful degradation + disabled submit message. |
| Existing tests assume session on booking API | High | Update mocks; add CAPTCHA/401/`patientId` cases. |
| Wizard refactor regresses existing admin flow | Med | Mode prop defaults preserve current behavior; tests cover both modes. |

## Rollback Plan

- Revert the change (feature branch). Restore `app/(admin)/booking/page.tsx` at `/booking` and delete `app/booking/page.tsx` + `/api/admin/booking/*`.
- Re-add `requireUser()` to `app/api/booking/book/route.ts`.
- Remove `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` (and Turnstile script) — with no keys the public submit disables cleanly.
- Rollback is deploy-revert only: no schema migration is introduced, so the database is untouched.

## Dependencies

- Cloudflare Turnstile site + secret keys (owner-provided).
- Confirmed routes `/booking` and `/admin/booking` (fixed constraints).

## Success Criteria

- [ ] Unauthenticated user books at `/booking` with a valid CAPTCHA; submit rejected when token invalid/absent.
- [ ] Public submit disabled with clear message when Turnstile keys missing.
- [ ] Authenticated staff book at `/admin/booking` selecting an existing patient (record used as-is) or creating one.
- [ ] Public API rejects `patientId` and never enumerates patients; internal endpoint returns 401 without session.
- [ ] Atomic no-overlap booking still holds for both flows.
