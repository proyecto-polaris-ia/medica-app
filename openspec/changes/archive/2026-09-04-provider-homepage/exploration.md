# Exploration: provider-homepage

## Current State

- `/providers` is a client page (`app/(admin)/providers/page.tsx`) that lists providers in a `DataTable` with only **Editar / Eliminar** actions. There is no "ver detalle" action today.
- The admin panel is gated by Supabase Auth (`requireUser`) and all data flows through `/api/admin/*` route handlers that use `getSupabaseAdmin()` (service role).
- The agenda model already supports providers, patients, services, and appointments. `booking_free_slots(...)` (migration `0004`) computes free slots from `business_hours − active appointments`.
- **There is no mapping between an authenticated user and a `providers` row.** This is the main blocker for "homepage de un doctor en particular".
- The existing appointments list (`/api/admin/appointments`) returns **all** appointments ordered by `start_at` descending; it does not filter by provider or date range.
- The `DataTable` component (`src/components/admin/DataTable.tsx`) hardcodes Edit/Delete buttons; it has no hook for a view/detail action.

## Affected Areas

- `app/(admin)/providers/page.tsx` — add a "Ver" icon/link per provider.
- `src/components/admin/DataTable.tsx` — optionally support an `onView` action so other CRUD pages are not forced to show it.
- `app/(admin)/providers/[id]/page.tsx` — new provider concentrado / homepage page.
- `app/api/admin/providers/[id]/route.ts` — add `GET` to fetch a single provider (currently only `PATCH`/`DELETE`).
- `src/lib/admin/providers.ts` — add `getProvider(id)`.
- `app/api/admin/appointments/route.ts` — add query params (`providerId`, `from`, `to`, `status`) or add a dedicated `/api/admin/providers/[id]/appointments` route.
- `src/lib/admin/appointments.ts` — add filtered query helpers for upcoming / today / recent appointments by provider.
- `src/lib/admin/patients.ts` — add a query for patients who have appointments with a given provider ("clientes atendidos").
- Supabase schema — add a way to link an auth user to a provider (see Approaches).
- `app/(admin)/dashboard/page.tsx` or a new `app/(admin)/home/page.tsx` — optional entry point when a doctor logs in and should land on their own concentrado.

## Approaches

### 1. Admin-only concentrado page

Build the provider detail page only as a navigable view from `/providers`, with URL `/providers/[id]`. The doctor-as-homepage requirement is deferred.

- **Pros**: No schema changes; no auth-to-provider mapping; smallest scope; satisfies the first half of the issue ("agrega un icono... que envíe a esta nueva página").
- **Cons**: Does not satisfy "homepage de un doctor en particular"; a doctor cannot log in and land directly on their own concentrado.
- **Effort**: Low.

### 2. Provider concentrado + auth-user mapping (recommended)

Build the `/providers/[id]` concentrado page first, then add a mapping from Supabase Auth users to `providers`. When the logged-in user has a mapping, redirect `/home` (or a personalized `/dashboard`) to their concentrado.

Mapping options:

- **2a. `providers.auth_user_id` column** (`uuid UNIQUE REFERENCES auth.users(id)`). Simplest schema; one provider = one login.
- **2b. `provider_users` junction table** (`provider_id, user_id`). Allows multiple users to represent the same doctor or a user to access multiple providers.
- **2c. `app_metadata`** (`raw_app_meta_data['provider_id']`). No schema migration, but the Supabase security skill warns that `user_metadata` is user-editable; `app_metadata` is safer but still embedded in the JWT and can become stale.

For this dental clinic, **2a** is probably sufficient (Jorge and his son each have one provider). If the secretary must also see a provider's homepage, **2b** is more flexible.

- **Pros**: Satisfies both access paths (admin view + doctor homepage); reusable `ProviderHomePage` component; future-proof for per-doctor dashboards.
- **Cons**: Requires a schema migration and a decision on the user-to-provider mapping; needs careful RLS/service-role handling (existing API routes bypass RLS anyway, but the mapping table should be protected).
- **Effort**: Medium.

### 3. Reuse `/appointments` with a provider filter

Instead of a new concentrado page, add a provider filter to `/appointments` and link there.

- **Pros**: Minimal new UI; reuses existing list.
- **Cons**: Does not show a "concentrado" (no recent-client count, no quick stats, no personal homepage feel); does not match the issue's intent.
- **Effort**: Low.

## Recommendation

**Adopt Approach 2 (provider concentrado + auth-user mapping), phased:**

1. **Phase 1 — concentrado page**: Create `/providers/[id]` with:
   - Provider header (name).
   - Upcoming appointments section (next N appointments, sorted ascending).
   - Today's agenda section (appointments for the current clinic date, `America/Mexico_City`).
   - Recent clients section (patients with appointments marked `attended` or `confirmed` in the last 30 days, with counts).
   - Link to the full `/appointments` list filtered by provider.
   - Add a "Ver" icon to the `/providers` list.
2. **Phase 2 — doctor homepage**: Add `providers.auth_user_id` (or a `provider_users` table) and a `/home` route that redirects the logged-in user to `/providers/<their_id>`.

For the mapping, start with `providers.auth_user_id` because it is the smallest change and matches the current "one doctor = one provider" mental model. If multi-user access to the same provider is needed later, migrate to a junction table.

Use joined Supabase queries (e.g., `appointments` joined to `patients` and `services`) to avoid N+1 when rendering appointment cards.

## Risks

- **No user-to-provider mapping exists today.** This must be resolved before the "doctor homepage" part can work.
- **Time-zone sensitivity.** "Today's agenda" must filter in `America/Mexico_City`, not UTC, to match clinic operations.
- **Definition of "recent clients" is ambiguous.** Need to agree on a window (e.g., last 30 days) and which statuses count as "served" (e.g., `attended`, maybe `confirmed`).
- **`DataTable` action coupling.** Adding a view action requires either extending the shared component or inlining actions in `/providers`.
- **Query performance.** Upcoming/recent/today queries need indexes on `(provider_id, start_at)`; migration `0001` already includes `idx_appointments_provider_start`, but filters by status may benefit from a covering index.

## Ready for Proposal

**Yes**, with two clarifications the orchestrator should surface to the user:

1. How should a logged-in doctor be linked to their `providers` row? (recommended: add `auth_user_id` to `providers`).
2. What window and appointment statuses define "clientes atendidos últimamente"? (recommended: last 30 days, statuses `attended` or `confirmed`).

Once those are confirmed, the change can move to the `sdd-propose` phase.
