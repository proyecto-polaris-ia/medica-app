# Design: Appointment Booking — Agenda Domain + Service Layer

## Technical Approach

Implements baseline spec exactly: 5 Postgres tables with all instants
`timestamptz` and clinic TZ `America/Mexico_City`; a provider-time **exclusion
constraint** for atomic booking; RLS denying `anon`, server-side **service_role**
bypass; a `src/lib/booking/*` layer with SQL-computed availability only. The lib
never invents slots; the model proposes, the backend validates/executes. WhatsApp
transport is out of scope.

## Architecture Decisions

| # | Decision | Options | Tradeoff | Choice |
|---|----------|---------|----------|--------|
| 1 | Prevent overlap | SELECT-then-INSERT vs `EXCLUDE USING gist` | SELECT-then-INSERT races under concurrency (TOCTOU); constraint is enforced atomically by Postgres | **Exclusion constraint** |
| 2 | Booking writes auth | RLS per patient vs service_role bypass | MVP0 has no patient auth users; RLS can't key on `auth.uid()` | **service_role** server-side; RLS denies `anon` |
| 3 | Availability source | Model-computed vs SQL DB-computed | Model invention violates guardrail + TZ drift | **SQL-computed** from `business_hours − appointments` |
| 4 | Cancel release | DELETE vs nullify range | DELETE loses audit; nullify keeps row + frees slot | **Nullify** `start_at=end_at` (empty range) |

## Data Model (Postgres)

All tables carry `created_at`/`updated_at`. Key columns:

`patients(id uuid pk, full_name text NOT NULL, phone_e164 text UNIQUE NOT NULL, notes text)`

`services(id uuid pk, name text NOT NULL, duration_minutes int NOT NULL CHECK(>0))`

`providers(id uuid pk, name text NOT NULL)`

`business_hours(id uuid pk, provider_id uuid FK→providers ON DELETE CASCADE,
day_of_week int CHECK(0..6), start_time time NOT NULL, end_time time NOT NULL,
CHECK(start_time<end_time), UNIQUE(provider_id, day_of_week, start_time))`

`appointments(id uuid pk, patient_id uuid FK→patients, service_id uuid FK→services,
provider_id uuid FK→providers, start_at timestamptz NOT NULL, end_at timestamptz NOT NULL,
status appointment_status NOT NULL DEFAULT 'requested',
CHECK(end_at>start_at OR status IN ('cancelled','rescheduled')))`

**Status enum** (`appointment_status`): `requested`, `confirmed`, `pending`,
`cancelled`, `rescheduled`, `no_show`, `attended`.

**Exclusion constraint**:
```sql
ALTER TABLE appointments ADD CONSTRAINT appointments_provider_no_overlap
EXCLUDE USING gist (provider_id WITH =, tstzrange(start_at,end_at) WITH &&);
```
Empty ranges (`start_at=end_at`) produce no overlap → cancellation frees the slot
yet keeps the audit row. Index `appointments(provider_id,start_at)`, `patients(phone_e164)`.

## Atomic Booking & Cancellation

`booking.ts` inserts inside the constraint with a retry loop (max 3). On SQLSTATE
`23P01` it returns `BookingConflict`; orchestrator calls `next-available.ts`.
Cancellation/reprogramming sets `status` AND `start_at=end_at` (releases interval).

## RLS & Roles

RLS enabled on all 5 tables. `anon` gets **no GRANT and no policy**. Booking uses
**service_role** (bypasses RLS). Patient-level RLS is deferred until patient auth
exists (MVP0 template only).

## Time Zone Correctness

All instants `timestamptz`. Local→instant conversion occurs **only** in the
compute layer (`(date + time) AT TIME ZONE 'America/Mexico_City'`), never via strings.

## Booking Service Module (`src/lib/booking/*`)

| File | Responsibility | Key signature |
|------|----------------|---------------|
| `availability.ts` | Free slots from DB | `getFreeSlots({providerId,serviceId,localDate,timezone}): Promise<Slot[]>` |
| `booking.ts` | Atomic insert + retry | `bookAppointment(args): Promise<{ok}|{conflict}>` |
| `next-available.ts` | Earliest fitting slot | `findNextAvailable({providerId,serviceId,after}): Promise<Slot\|null>` |
| `booking-state.ts` | Multi-turn slot-selection state (no transport/DB) | `initState()`, `selectSlot()` |

`booking_free_slots(p_provider_id uuid, p_duration interval, p_target_date date,
p_clinic_tz text) RETURNS TABLE(start_at timestamptz, end_at timestamptz)`: expands
`business_hours` to the target date in clinic TZ, steps by `duration`, EXCEPTs
overlapping active appointments. SECURITY DEFINER + STABLE.

## Migrations

`supabase/migrations/`:
- `0001_agenda_tables.sql` — tables, enum, FKs, indexes (idempotent: `IF NOT EXISTS`)
- `0002_agenda_exclusion.sql` — `btree_gist` + exclusion constraint
- `0003_agenda_rls.sql` — `ENABLE ROW LEVEL SECURITY`, `REVOKE anon`
- `0004_agenda_functions.sql` — `booking_free_slots`

Paired `supabase/migrations/down/000N_*.down.sql` reverse-order `DROP ... CASCADE`.
Rollback: drop constraint first, then tables.

## Sequence Diagrams

**Availability check**
```
agent → booking-state: propose check_availability
orchestrator → availability: getFreeSlots(provider,service,date)
availability → DB: SELECT booking_free_slots(...)
DB → availability: free intervals (SQL-derived)
availability → orchestrator: Slot[]
orchestrator → booking-state: setCandidates(Slot[])
```

**Atomic booking**
```
orchestrator → booking: bookAppointment(patient,service,provider,start,end)
booking → DB: INSERT appointments (retry ≤3)
DB → booking: OK | 23P01 conflict
booking → orchestrator: {ok} | {conflict}
orchestrator → next-available: findNextAvailable(...)  (on conflict)
```

## Greenfield Bootstrap (apply phase creates)

`package.json` (next, react, @supabase/supabase-js, typescript, vitest),
`tsconfig.json`, `next.config.mjs`, `app/{layout,page}.tsx`,
`lib/supabase/server.ts` (service_role), `lib/supabase/client.ts` (anon),
`vitest.config.ts`, `.env.local.example`.

## Testing Strategy

| Layer | Test | Approach |
|-------|------|----------|
| Unit | `booking-state` transitions | Vitest pure functions |
| Integration | exclusion rejects overlap; cancel frees slot; `booking_free_slots` excludes occupied | service_role vs local Supabase |
| E2E | book → conflict → next-available | scripted via booking lib |

## Open Questions

- [ ] Patient auth model for true patient-level RLS (deferred to MVP1).
- [ ] Reprogramming: keep old row as `rescheduled` vs hard delete (chose keep).
