# Proposal: Appointment Booking — Agenda Domain (Data Model + Service Layer)

## Intent
Implement the dental-clinic agenda described by the baseline `appointment-booking`
spec: providers, duration-bounded services, per-provider business hours,
appointments, and a booking service that derives availability purely from the DB
(never invented), books atomically (no double-booking), recommends the next free
slot, honors `America/Mexico_City`, releases intervals on cancellation, and
resolves patients from `patients.phone_e164`. This change delivers the agenda
DATA MODEL + booking SERVICE LAYER only.

## Scope
### In Scope
- Postgres migrations: `patients`, `services`, `providers`, `business_hours`,
  `appointments` (+ statuses); RLS policies.
- Exclusion constraint: `EXCLUDE USING gist (provider_id WITH =,
  tstzrange(start_at,end_at) WITH &&)`.
- `src/lib/booking/*`: `availability.ts`, `booking.ts`, `next-available.ts`,
  `booking-state.ts`.
- `clinic_timezone` = America/Mexico_City; all instants `timestamptz`.
- Patient resolution from contact phone against `patients.phone_e164` (unique).

### Out of Scope
- WhatsApp inbound transport/agent (copy+adapt from travelhub-app) →
  `whatsapp-inbound-automation` spec.
- WhatsApp contact ↔ patient linkage; `whatsapp_*` tables; booking-state UI
  transport wiring.
- Any modification of `travelhub-app` (copy + adapt only).

## Capabilities
### New Capabilities
None.
### Modified Capabilities
None — `appointment-booking` baseline (`openspec/specs/appointment-booking/spec.md`)
is the TARGET contract; this change implements it without changing spec-level
requirements.

## Approach
Migrations create the agenda tables + the provider-time exclusion constraint.
`availability.ts` computes free slots = `business_hours − appointments` in clinic
TZ via SQL. `booking.ts` inserts inside the exclusion constraint (atomic; conflict
→ reject, then `next-available.ts` suggests a slot). `next-available.ts` finds the
earliest fitting free interval. `booking-state.ts` holds multi-turn slot selection
(state only; no transport). All DB access via Supabase service role; RLS restricts
patient writes. The model never computes availability.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/*.sql` | New | Schema, RLS, exclusion constraint |
| `src/lib/booking/*` | New | Service layer |
| `package.json`, `tsconfig.json`, Next.js scaffold | New | Bootstrap (greenfield) |
| `architecture.md` §4 | Reference | Domain tables |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Double-booking under concurrency | Med | Exclusion constraint + retry-on-conflict |
| TZ drift (local vs UTC) | Med | All `timestamptz`; clinic TZ in compute |
| Greenfield bootstrap drift | Med | Pin Next.js + Supabase layout; document |
| Cancelled appt still blocking | Low | Cancel sets `start_at=end_at`/delete |

## Rollback Plan
- Migrations: ship paired `DOWN`/idempotent `DROP` script dropping tables and the
  constraint in dependency order.
- Exclusion constraint: `ALTER TABLE appointments DROP CONSTRAINT ...` before any
  data-dependent change.
- Code: revert `src/lib/booking/*` via git. Feature is not yet exposed to any
  transport, so no live traffic is affected.
- Data: no production data in MVP0; safe reset if required.

## Dependencies
- Apply phase MUST bootstrap minimal Next.js (App Router) + TypeScript + Supabase
  client (greenfield: no `package.json`/`src`/`app` yet).
- Supabase project with service-role key.
- `whatsapp-inbound-automation` consumes this layer (separate change).

## Success Criteria
- [x] Migrations apply cleanly; exclusion constraint rejects overlapping intervals.
- [x] `availability.ts` returns slots from DB only (no model invention).
- [x] `booking.ts` rejects concurrent double-booking; `next-available.ts` returns
      earliest fitting slot.
- [x] Cancellation frees the interval.
- [x] Patient resolved from `phone_e164`; zero edits to `travelhub-app`.
