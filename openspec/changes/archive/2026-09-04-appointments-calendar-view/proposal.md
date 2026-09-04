# Proposal: Appointments Calendar View

## Intent

`/appointments` currently renders only a flat `DataTable` with no temporal grouping. Clinic staff cannot see schedule density, gaps, or daily load at a glance, and cannot compare provider occupancy. We add a calendar view (month navigation + year jump, hour blocks per appointment, color-coded by provider) reachable via a "view toggle" from the existing appointments list. `listAppointments()` loads **all** rows with no range filter, so a range-based query is required for the calendar to scale.

## Scope

### In Scope
- New calendar view component (custom CSS Grid, zero new deps) accessible from `/appointments` via a list/calendar toggle.
- Month/previous/next navigation + year selector.
- Appointment time blocks rendered in a day column, colored by provider.
- Range-based appointment query (`start`/`end` window) in data layer + API route, tz `America/Mexico_City`.
- `providers` color: migration adding `color` (text) + CRUD/UI update.

### Out of Scope
- Drag-and-drop rescheduling, multi-day/week views, print/export.
- Editing appointment data from the calendar (opens existing edit flow).
- WhatsApp/booking changes.

## Capabilities

### New Capabilities
- `appointments-calendar-view`: Calendar display of appointments with month/year navigation, provider-color-coded time blocks, and a list/calendar view toggle from `/appointments`.

### Modified Capabilities
- `admin-panel`: Providers CRUD requirement extended to manage a `color` field per provider (used by calendar coloring).

## Approach

Custom calendar built with Tailwind v4 CSS Grid (aligned with the existing custom `DataTable` pattern — no shadcn/ui, no new libs). A new `listAppointmentsRange(start, end)` reads `timestamptz` rows within the visible month; timezone conversion happens at render with the clinic tz. Provider color is stored as a hex/text string on `providers` (migration + `Provider`/`ProviderInput` type update + provider form field). The toggle preserves current list filters and shares loading/error states.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/(admin)/appointments/page.tsx` | Modified | Add view toggle + mount calendar |
| `src/components/admin/calendar/*` | New | Calendar grid, nav, day blocks, legend |
| `src/lib/admin/appointments.ts` | Modified | Add range query |
| `app/api/admin/appointments/route.ts` | Modified | Accept range params |
| `src/lib/admin/types.ts` | Modified | `Provider` gains `color` |
| `supabase/migrations/*` | New | `providers.color` column + default |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Range query regresses list perf | Med | Keep `listAppointments()` for list; new fn only for calendar |
| Tz mis-render across DST | Med | Centralize formatting in clinic tz helper |
| Provider without color | Low | Fallback neutral color + legend |

## Rollback Plan

- Migration is additive (`ALTER TABLE providers ADD COLUMN color`); rollback = `DROP COLUMN color` (non-destructive to existing data).
- Calendar components are additive and gated behind the toggle; revert by hiding the toggle in `page.tsx`. No changes to existing `DataTable` path.

## Dependencies

- Existing `Provider` CRUD and appointment data layer (in place).

## Success Criteria

- [ ] Toggle switches between list and calendar without losing auth/session.
- [ ] Calendar navigates months/years and shows blocks in the visible range only.
- [ ] Each block colored by its provider; legend matches.
- [ ] `providers` rows persist `color`; calendar reflects it.
- [ ] `npm run test` + `npm run build` pass; no new runtime deps.
