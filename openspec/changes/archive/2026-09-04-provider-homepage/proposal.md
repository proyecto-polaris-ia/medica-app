# Proposal: Provider Detail Page (Concentrado)

## Intent
The `/providers` list exposes only Edit/Delete. Staff cannot quickly see a provider's upcoming agenda, today's schedule, or recently served clients from the list. This change adds a "Ver" (view) action on the providers DataTable that opens a new provider concentrado page at `/providers/[id]`, giving staff a fast operational snapshot without touching booking logic or schema.

## Scope

### In Scope
- Add a "Ver" icon/action to the `/providers` DataTable row, navigating to `/providers/[id]`.
- New `/providers/[id]` page showing:
  - Provider header (name).
  - Upcoming appointments (next N, ascending by `start_at`).
  - Today's agenda (current clinic date, `America/Mexico_City`).
  - Recent clients: appointments in the last 30 days with status `attended` OR `confirmed`, with counts.
  - Link to the provider-filtered full appointments list.
- API + data-layer support: `GET /api/admin/providers/[id]`, `getProvider(id)`, and filtered appointment/patient queries by provider.

### Out of Scope
- Supabase Auth ↔ `providers` mapping (`auth_user_id`).
- Doctor-specific "homepage" routing / `/home` redirect.
- Any schema migration (no new columns or tables).
- Booking/availability logic changes.

## Capabilities

> Contract with sdd-spec. Researched `openspec/specs/`: `admin-panel`, `appointment-booking`, `whatsapp-inbound-automation`. None covers a provider detail view.

### New Capabilities
- `provider-detail`: Read-only provider concentrado view (detail route + DataTable view action) exposing upcoming appointments, today's Mexico-City agenda, and recent clients (last 30d, `attended`+`confirmed`) with a link to the full client list.

### Modified Capabilities
- None. Existing `admin-panel` CRUD requirements are unchanged; this is additive behavior only.

## Approach
Additive only. Extend `DataTable` with an optional `onView` action (other CRUD pages unaffected). Add `GET` to `app/api/admin/providers/[id]/route.ts`, `getProvider(id)` in `src/lib/admin/providers.ts`, and filtered helpers in `src/lib/admin/appointments.ts` and `patients.ts`. Render joined queries (appointments → patients → services) to avoid N+1. Time-zone filtering uses `America/Mexico_City` for "today". Reuse the existing service-role admin data layer and auth gating (`requireUser`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/(admin)/providers/page.tsx` | Modified | Add "Ver" action per row |
| `src/components/admin/DataTable.tsx` | Modified | Optional `onView` action |
| `app/(admin)/providers/[id]/page.tsx` | New | Concentrado page |
| `app/api/admin/providers/[id]/route.ts` | Modified | Add `GET` |
| `src/lib/admin/providers.ts` | Modified | `getProvider(id)` |
| `src/lib/admin/appointments.ts`, `patients.ts` | Modified | Filtered queries |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Time-zone drift in "today" filter | Med | Filter by `America/Mexico_City` clinic date, not UTC |
| N+1 queries on cards | Low | Join appointments→patients→services in one query |
| DataTable coupling | Low | `onView` optional; no other page forced |

## Rollback Plan
Purely additive. Revert by removing the `/providers/[id]` route + page, the `getProvider`/filtered helpers, and the `onView` prop usage from `/providers`. No migrations and no data loss. `travelhub-app` is untouched.

## Dependencies
- Existing `admin-panel` auth + service-role data layer.

## Success Criteria
- [ ] "Ver" action appears on every `/providers` row and opens `/providers/[id]`.
- [ ] Page shows upcoming, today's (Mexico-City), and last-30d `attended`/`confirmed` clients.
- [ ] `npx tsc --noEmit`, `npm run lint`, and `npm run test` pass.
- [ ] No schema migration introduced.
