# Proposal: Patient Booking UI

## Intent

The `appointment-booking` backend capability (availability, atomic booking, next-available, patient-resolution) is already implemented and tested, but it has **no human-facing frontend**. Patients and the front desk must currently book only through WhatsApp. This change delivers a modern, multi-step Next.js App Router UI that consumes the existing booking service end-to-end (service → provider → slot → confirm → created appointment + conflict handling). It reuses the service layer verbatim; it does NOT reinvent booking logic.

## Scope

### In Scope
- Next.js App Router pages implementing a clear multi-step flow (service → provider → slots → confirm → result).
- Server-side API route handlers (or Server Actions) that wrap the booking service; the UI never holds `service_role`.
- Styled, modern, responsive UI consumed via `fetch` to `/api/booking/*`.
- Slot display sourced only from `booking_free_slots`; conflict path shows next-available.
- Patient resolution/create by `phone_e164` at confirm time.

### Out of Scope
- WhatsApp transport/agent (separate change `whatsapp-inbound-automation`).
- Patient auth / accounts (MVP0).
- Provider-side dashboard / agenda management (MVP1).
- Any change to `travelhub-app`.

## Capabilities

### New Capabilities
- `booking-ui`: the Next.js frontend + API routes that expose the existing `appointment-booking` service to a browser, including the multi-step patient flow and conflict/next-available UX.

### Modified Capabilities
- None (the `appointment-booking` spec is unchanged; the UI only consumes it).

## Approach

Add an `app/(booking)/*` route group with one page per step and a shared client state machine mirroring `booking-state.ts`. API routes under `app/api/booking/*` (`services`, `providers`, `slots`, `book`) call `src/lib/booking/*` with the server `service_role` client. The browser calls only the public API routes (anon-safe, no secrets). Booking stays atomic via the existing exclusion constraint; on `23P01` the UI shows the created appointment's conflict message and offers `findNextAvailable`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/(booking)/page.tsx` + step pages | New | Multi-step flow UI |
| `src/app/api/booking/{services,providers,slots,book}/route.ts` | New | Server-side wrappers over booking service |
| `src/components/booking/*` | New | Step components (ServicePicker, SlotGrid, Confirm, Result) |
| `src/lib/booking/*` | Reused | No changes to existing service |
| `src/styles` / global CSS | New | Modern styling (Tailwind or CSS modules) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Next.js (this repo) has breaking API changes vs training data | Med | Read `node_modules/next/dist/docs/` before implementation |
| Service-role key leaked to browser | Low | UI calls only `/api/booking/*`; routes use server client |
| Slot taken between fetch and confirm | Med | Handle `23P01` conflict + show next-available |
| Empty states (no services/providers) | Med | Explicit empty/loading/error UI per step |

## Rollback Plan

- `git revert <commit>` for the booking-ui change (single feature branch).
- Remove the `app/(booking)/` route group and `app/api/booking/*` routes; no DB migration is introduced, so no schema rollback is needed.
- If API routes were kept behind a feature flag/env (`NEXT_PUBLIC_BOOKING_UI_ENABLED`), unset it to disable the UI without a deploy revert.

## Dependencies

- Existing `appointment-booking` backend + `booking_free_slots` RPC (already deployed).
- Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) present at runtime.
- Styling library decision (Tailwind vs CSS Modules) — to be confirmed in design.

## Success Criteria

- [ ] A patient can complete service → provider → slot → confirm without page cramming.
- [ ] All slots shown come from `booking_free_slots` (never invented).
- [ ] A confirmed booking creates an `appointments` row via the atomic path.
- [ ] A conflicting slot shows the next-available option.
- [ ] No `service_role` secret reaches the browser bundle.
- [ ] `npm run build` and `npm run test` pass.
