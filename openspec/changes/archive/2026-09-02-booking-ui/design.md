# Design: Patient Booking UI

## Technical Approach

A `/booking` route renders a five-step wizard (service → provider → slots → confirm → result). All data and writes flow through four App Router Route Handlers under `app/api/booking/*` that call the existing `src/lib/booking/*` service with `getSupabaseAdmin()`. The browser never receives `service_role`. Implements `specs/booking-ui/spec.md` (8 requirements).

## Codebase facts that constrain this design

| Fact | Evidence | Consequence |
|------|----------|-------------|
| App dir is at repo **root** `app/`, not `src/app/` | `app/{layout,page}.tsx` | Routes go in `app/api/booking/*`; proposal's `src/app/(booking)` path is corrected |
| `anon` is revoked on `services`/`providers` | `0003_agenda_rls.sql` | Browser *cannot* read the catalog; API routes are mandatory, not stylistic |
| No `listServices`/`listProviders` exists | `booking/index.ts` | Add `catalog.ts` (new file, no edits to tested modules) |
| `bookAppointment` returns `{ok:true}`, no row | `booking.ts:30` | Success result composed by the route (ADR 4) |
| `booking-state.ts` models only slot/candidates | `booking-state.ts:3-7` | UI needs its own reducer (ADR 3) |
| `Slot` uses `Date`, not strings | `types.ts:1-4` | API serializes ISO 8601; client re-parses |

## Architecture Decisions

### ADR 1 — Styling: Tailwind CSS v4

| Option | Tradeoff | Decision |
|--------|----------|----------|
| **Tailwind CSS v4** | +3 dev deps; CSS-first config, no `tailwind.config.js`, no content globs | **Chosen** |
| CSS Modules | Zero deps, but hand-written responsive/spacing/state CSS for 10 components | Rejected — slow, inconsistent |
| Component library (MUI/shadcn) | Heavy bundle + opinionated primitives for a 5-screen flow | Rejected |

Add `tailwindcss@^4`, `@tailwindcss/postcss@^4`, `postcss` as devDependencies; create `postcss.config.mjs` (`plugins: { '@tailwindcss/postcss': {} }`); prepend `@import "tailwindcss";` to `app/globals.css`, keeping existing resets below. Node 22 (`engines`) satisfies v4.

### ADR 2 — Route Handlers, never a client Supabase call

Route Handlers are the only code holding `service_role`; `src/lib/supabase/client.ts` (anon) is unused by this feature. Rejected: Server Actions — harder to unit-test in Vitest and less explicit as a contract the WhatsApp path can later reuse.

### ADR 3 — One route, one step on screen at a time

`/booking` is a single route; `BookingWizard` renders exactly one full-width step panel per state. Rejected: `/booking/service`, `/booking/provider`, … — separate URLs make the step guard deep-linkable and force ephemeral selection state into URL params or storage. The spec forbids *cramming steps into one page*, not multiple routes; one visible step per screen satisfies it and keeps "no skipping ahead" a pure in-memory invariant.

State lives in a new pure reducer `src/components/booking/wizard-state.ts` (`step`, `service`, `provider`, `date`, `slot`, `patient`, `phase`). It **mirrors** `booking-state.ts` in shape but does not import it — that module lacks service/provider/patient and is already tested for the agent path.

### ADR 4 — Success result references the appointment by composition

`bookAppointment` does not `.select()` the inserted row, so no appointment `id` is available. `POST /book` returns a `confirmation` echo (service, provider, patient, `startAt`/`endAt`) — enough for "success result referencing the created appointment" without editing a tested service module. A real `id` (for cancel/reschedule) would be a change to the `appointment-booking` capability, not this UI.

### ADR 5 — Language split

Design/code/identifiers in English; patient-visible copy in neutral Spanish (Mexico) per `AGENTS.md`. Times rendered via `Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City' })` so the shown hour never depends on the visitor's browser timezone.

## API contracts

```ts
GET  /api/booking/services
  → 200 { services: { id: string; name: string; durationMinutes: number }[] }

GET  /api/booking/providers
  → 200 { providers: { id: string; name: string }[] }

GET  /api/booking/slots?providerId=<uuid>&serviceId=<uuid>&date=YYYY-MM-DD
  → 200 { slots: { startAt: string; endAt: string }[] }   // ISO 8601, may be []
  → 400 { error: 'invalid_request', field: 'providerId' | 'serviceId' | 'date' }

POST /api/booking/book
  body { serviceId: uuid, providerId: uuid, startAt: ISO, endAt: ISO,
         phone: E.164, fullName?: string }
  → 201 { status: 'booked', confirmation: { serviceName, providerName,
            patientName, startAt, endAt } }
  → 409 { status: 'conflict', message: string,
            nextAvailable: { startAt, endAt } | null }
  → 400 { error: 'invalid_request', field: string }
  → 500 { error: 'booking_failed' }
```

All handlers: `export const dynamic = 'force-dynamic'`; 404 when the flag is off. Validation lives in `app/api/booking/_lib/validate.ts` (`parseUuid` / `parseIsoDate` / `parseLocalDate` / `parsePhoneE164`) — hand-rolled, no new runtime dependency. `_lib` is a private folder, excluded from routing.

**Timezone gotcha (needs a RED test)**: `new Date('2026-09-10')` is UTC midnight, which `toLocalDateString(…, 'America/Mexico_City')` renders as **2026-09-09** — the slots route would silently query the wrong day. `parseLocalDate` MUST build the Date at noon UTC:

```ts
// safe for UTC-6/-7; never pass a bare YYYY-MM-DD to getFreeSlots
const localDate = new Date(`${date}T12:00:00Z`);
```

## Step → service function map

| Step | Route called | `src/lib/booking` function |
|------|--------------|----------------------------|
| 1 Service | `GET /services` | `listServices()` *(new, `catalog.ts`)* |
| 2 Provider | `GET /providers` | `listProviders()` *(new, `catalog.ts`)* |
| 3 Slots | `GET /slots` | `getFreeSlots({ providerId, serviceId, localDate })` → `booking_free_slots` RPC |
| 4 Confirm | `POST /book` | `resolvePatient({ phone })` then `bookAppointment({...})` |
| 5 Result (conflict) | same `POST /book` response | `findNextAvailable({ providerId, serviceId, after: startAt })` |

## Data flow — happy path

```
Browser (BookingWizard, client)        Route Handler (server)        Supabase
      │ GET /api/booking/services ──────────→ listServices() ──────────→ services
      │ GET /api/booking/providers ─────────→ listProviders() ─────────→ providers
      │ GET /slots?p&s&date ────────────────→ getFreeSlots() ─────────→ rpc booking_free_slots
      │←─ { slots: [...] }  (only DB rows; never fabricated)
      │ POST /book {slot, phone} ───────────→ resolvePatient() ───────→ patients (upsert)
      │                                     → bookAppointment() ──────→ appointments INSERT
      │←─ 201 { status:'booked', confirmation }
```

## Data flow — conflict path (23P01)

```
      │ POST /book ─────→ bookAppointment()
      │                        └→ INSERT rejected by exclusion constraint (23P01)
      │                        └→ returns BookingConflict
      │                   findNextAvailable({ after: startAt })
      │                        └→ rpc booking_free_slots, day 0..29
      │←─ 409 { status:'conflict', message, nextAvailable }
      │
      │ ResultStep: shows conflict copy + "Reservar <hora>" CTA
      │   accept  → POST /book with nextAvailable  (loop, max 1 auto-retry then manual)
      │   decline → back to step 3 with slots refetched
```

## Components

| File | Kind | Responsibility |
|------|------|----------------|
| `app/booking/page.tsx` | Server | Flag gate (`notFound()` when off), page shell, renders wizard |
| `src/components/booking/BookingWizard.tsx` | Client | Owns reducer state, all `fetch` calls, renders active step |
| `.../wizard-state.ts` | Pure | Reducer + step guard (`canAdvanceTo`) — unit tested |
| `.../StepShell.tsx` | Client | One step per screen: title, back/next, progress |
| `.../StepIndicator.tsx` | Client | 1–5 progress display |
| `.../ServiceStep.tsx` | Client | Service cards with `durationMinutes` (Req: duration shown) |
| `.../ProviderStep.tsx` | Client | Single-select provider list |
| `.../SlotStep.tsx` | Client | Date picker + slot grid, `es-MX` formatting |
| `.../ConfirmStep.tsx` | Client | Summary + phone/name inputs + confirm |
| `.../ResultStep.tsx` | Client | Success confirmation OR conflict + next-available CTA |
| `.../StateBlock.tsx` | Client | Shared loading / empty / error primitive |
| `src/lib/booking/catalog.ts` | Server | `listServices()`, `listProviders()` (new; re-exported from `index.ts`) |
| `app/api/booking/{services,providers,slots,book}/route.ts` | Server | Handlers above |
| `app/api/booking/_lib/validate.ts` | Server | Input parsers |
| `postcss.config.mjs`, `app/globals.css` | — | Tailwind v4 wiring |

Modified: `app/globals.css`, `src/lib/booking/index.ts`, `package.json`, `.env.example`. Nothing deleted. No existing `src/lib/booking/*` module is edited. `travelhub-app` untouched.

## Per-step states

| Step | Loading | Empty | Error |
|------|---------|-------|-------|
| Service | Skeleton cards, Next disabled | "No hay servicios disponibles." — no fabricated entries | Message + "Reintentar" |
| Provider | Skeleton rows, Next disabled | "No hay especialistas disponibles." | Message + "Reintentar" |
| Slots | Grid skeleton, selection blocked | "Sin horarios libres para esta fecha." + suggest another date | Message + "Reintentar" |
| Confirm | Button spinner, form locked, double-submit blocked | n/a | Field-level validation for phone; server error + retry |
| Result | n/a | `nextAvailable === null` → "Sin horarios en los próximos 30 días" + back to slots | Conflict copy + next-available CTA |

## Testing strategy

| Layer | What | How |
|-------|------|-----|
| Unit | `wizard-state` reducer: no skipping ahead, conflict transition, reset | Vitest (node env, existing config) |
| Unit | `validate.ts`: uuid/date/phone rejection; **noon-UTC local-date rule** | Vitest |
| Integration | 4 route handlers invoked directly with mocked `src/lib/booking/*`: happy path, `23P01` → 409 + `nextAvailable`, empty slots → `[]`, flag off → 404 | Vitest, `vi.mock` |
| Static | No `SUPABASE_SERVICE_ROLE_KEY` and no `supabase/server` import reachable from any `'use client'` module | Assertion test over `src/components/booking/**` + `.next` client chunks grep in verify |
| Build | `npx tsc --noEmit`, `npm run build` | config.yaml `verify` commands |

TDD is mandatory (`config.yaml apply.tdd: true`): RED tests before handlers/components.

## Threat Matrix

`N/A` — no shell commands, subprocesses, VCS/PR automation, executable-file classification, or process integration. Every row in `references/threat-matrix.md` (documentation-like paths, git selection, commit/push state, PR commands) is `N/A: this change adds only HTTP handlers and React components`. The applicable boundary is HTTP:

| HTTP boundary case | Safe behavior | RED test |
|---|---|---|
| Non-uuid / missing `providerId`,`serviceId` | 400, no Supabase call | Yes |
| Malformed `date` (`13-45-99`, `''`) | 400, no RPC | Yes |
| `date` off-by-one across UTC boundary | Query the requested clinic-local day | Yes |
| Non-E.164 phone | 400 *before* `resolvePatient` — no orphan patient rows | Yes |
| `startAt`/`endAt` not matching an RPC slot | Exclusion constraint stays the authority; UI cannot invent slots | Yes (conflict path) |
| `service_role` reachable from client bundle | Absent | Yes (static assertion) |

## Migration / Rollout

No DB migration and no schema change: `booking_free_slots` and the exclusion constraint already exist.

**Feature flag** `NEXT_PUBLIC_BOOKING_UI_ENABLED`: enabled only when the value is exactly `'true'`. `app/booking/page.tsx` calls `notFound()` otherwise and every `app/api/booking/*` handler returns 404 — defense in depth, so an unset flag closes both the page and the write endpoint. Added to `.env.example`; dev, CI and preview set it to `true`.

**Rollback**: unset the flag → UI and API 404, no deploy needed. Full removal: `git revert` the feature branch, or delete `app/booking/`, `app/api/booking/`, `src/components/booking/`, `src/lib/booking/catalog.ts` + its `index.ts` re-export, revert `app/globals.css`, drop `postcss.config.mjs` and the three Tailwind devDependencies. No data cleanup — appointments booked while live are legitimate clinic records.

## Open Questions

- [ ] `POST /api/booking/book` is unauthenticated (no patient auth in MVP0) and creates `patients` rows. Rate limiting / captcha is deliberately out of scope for this change — confirm the flag stays off in production until it is addressed.
- [ ] `openspec/config.yaml` references `npm run lint` and `npm run test:e2e`, but `package.json` defines neither. Verify must not be blocked on missing scripts, or the scripts get added in a separate change.
- [ ] Should the success result include a real appointment `id` (ADR 4)? That requires `bookAppointment` to `.select()` the inserted row — a follow-up change to the `appointment-booking` capability.
