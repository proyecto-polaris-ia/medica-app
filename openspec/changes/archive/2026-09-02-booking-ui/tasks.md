# Tasks: Patient Booking UI

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 700–900 |
| 400-line budget risk | High |
| 800-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Foundation + catalog → PR 2: API routes → PR 3: Wizard UI → PR 4: Flow/static verification |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Tailwind v4 wired, catalog service tested | PR 1 | `npm run test` | `npm run typecheck` | Revert `package.json`, `postcss.config.mjs`, `app/globals.css`, `src/lib/booking/catalog.ts` |
| 2 | Four API routes + validation tested | PR 2 | `npm run test` | `curl` against local dev server | Delete `app/api/booking/` |
| 3 | Wizard components + reducer tested | PR 3 | `npm run test` | Manual `/booking` flow | Delete `app/booking/` and `src/components/booking/` |
| 4 | Integration flow + static build verified | PR 4 | `npm run test` + `npm run build` | End-to-end browser flow | Revert test additions only |

## Phase 1: Foundation

- [x] 1.1 Run `npm install` and verify pinned Next.js/React/Vitest versions resolve in `node_modules`.
- [x] 1.2 Read `node_modules/next/dist/docs/` Route Handler and App Router guides before writing routes.
- [x] 1.3 Add `tailwindcss@^4`, `@tailwindcss/postcss@^4`, and `postcss` to `devDependencies`.
- [x] 1.4 Create `postcss.config.mjs` with `{ plugins: { '@tailwindcss/postcss': {} } }`.
- [x] 1.5 Prepend `@import "tailwindcss";` to `app/globals.css`, preserving existing resets below.
- [x] 1.6 Add `NEXT_PUBLIC_BOOKING_UI_ENABLED=true` to `.env.example`.

## Phase 2: Catalog Service (Unit)

- [x] 2.1 **RED**: Write `src/lib/booking/__tests__/catalog.test.ts` asserting `listServices` and `listProviders` map Supabase rows. `(Req: service selection, provider selection)`
- [x] 2.2 **GREEN**: Create `src/lib/booking/catalog.ts` with `listServices()` and `listProviders()` using `getSupabaseAdmin()`.
- [x] 2.3 Re-export catalog functions from `src/lib/booking/index.ts`.

## Phase 3: API Routes (Integration)

- [x] 3.1 Create `app/api/booking/_lib/validate.ts` with `parseUuid`, `parseLocalDate` (noon-UTC rule), `parseIsoDate`, and `parsePhoneE164`. `(Req: slots sourced from database)`
- [x] 3.2 **RED**: Write `app/api/booking/_lib/validate.test.ts` for uuid/date/phone rejection and the noon-UTC local-date rule.
- [x] 3.3 Create `app/api/booking/_lib/flag.ts` returning `process.env.NEXT_PUBLIC_BOOKING_UI_ENABLED === 'true'`.
- [x] 3.4 **RED**: Write `app/api/booking/services/route.test.ts` asserting flag-off 404 and catalog response shape.
- [x] 3.5 **GREEN**: Implement `app/api/booking/services/route.ts` (`GET`, `dynamic = 'force-dynamic'`).
- [x] 3.6 **RED**: Write `app/api/booking/providers/route.test.ts` for the same cases.
- [x] 3.7 **GREEN**: Implement `app/api/booking/providers/route.ts`.
- [x] 3.8 **RED**: Write `app/api/booking/slots/route.test.ts` for invalid params (400), empty slots (`[]`), and valid query mapping `startAt`/`endAt` JSON to `Slot.start_at`/`Slot.end_at`. `(Req: explicit step states)`
- [x] 3.9 **GREEN**: Implement `app/api/booking/slots/route.ts`; serialize `Slot.start_at`/`Slot.end_at` as `startAt`/`endAt`.
- [x] 3.10 **RED**: Write `app/api/booking/book/route.test.ts` for 201 happy path, 409 conflict with `nextAvailable`, 400 invalid phone, and flag-off 404. `(Req: atomic booking confirmation, conflict and next-available handling)`
- [x] 3.11 **GREEN**: Implement `app/api/booking/book/route.ts`, calling `resolvePatient` then `bookAppointment`; on conflict call `findNextAvailable`.

## Phase 4: Wizard UI (Unit + Integration)

- [x] 4.1 **RED**: Write `src/components/booking/wizard-state.test.ts` for step guard, no skipping ahead, conflict transition, and reset. `(Req: multi-step booking flow)`
- [x] 4.2 **GREEN**: Create `src/components/booking/wizard-state.ts` reducer (`step`, `service`, `provider`, `date`, `slot`, `patient`, `phase`).
- [x] 4.3 Create `src/components/booking/StateBlock.tsx` for loading/empty/error states. `(Req: explicit step states)`
- [x] 4.4 Create `src/components/booking/StepShell.tsx` and `StepIndicator.tsx`. `(Req: multi-step booking flow)`
- [x] 4.5 Create `src/components/booking/ServiceStep.tsx` showing name and `durationMinutes`. `(Req: service selection with duration)`
- [x] 4.6 Create `src/components/booking/ProviderStep.tsx` single-select list. `(Req: provider selection)`
- [x] 4.7 Create `src/components/booking/SlotStep.tsx` with date picker and `es-MX` formatted grid; map API `startAt`/`endAt` back to `Slot.start_at`/`Slot.end_at`. `(Req: slots sourced from database, explicit step states)`
- [x] 4.8 Create `src/components/booking/ConfirmStep.tsx` with phone/full-name inputs and summary. `(Req: atomic booking confirmation)`
- [x] 4.9 Create `src/components/booking/ResultStep.tsx` for success or conflict + next-available CTA. `(Req: conflict and next-available handling)`
- [x] 4.10 Create `src/components/booking/BookingWizard.tsx` orchestrating fetch calls to `/api/booking/*` and step rendering. `(Req: multi-step booking flow, server-side secret isolation)`
- [x] 4.11 Create `app/booking/page.tsx` server page, calling `notFound()` when flag is off, rendering `BookingWizard`. `(Req: server-side secret isolation)`

## Phase 5: Flow Verification

- [x] 5.1 Add static test asserting no `SUPABASE_SERVICE_ROLE_KEY` import and no `supabase/server` import in any `src/components/booking/**` file. `(Req: server-side secret isolation)`
- [x] 5.2 Add integration test exercising service → provider → slots → book flow with mocked routes. `(Req: multi-step booking flow, atomic booking confirmation)`
- [x] 5.3 Run `npm run test`; fix failures.
- [x] 5.4 Run `npm run typecheck` and `npm run build`; fix failures.
