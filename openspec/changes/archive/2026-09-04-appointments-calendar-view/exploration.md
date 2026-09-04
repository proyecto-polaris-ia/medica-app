## Exploration: appointments-calendar-view

### Current State

- `/appointments` is a client component (`app/(admin)/appointments/page.tsx`) that fetches **all** appointments from `GET /api/admin/appointments`, plus reference lists for patients, providers, and services.
- Appointments are displayed in a custom `DataTable` with columns: patient, service, provider, start, end, status.
- The page supports create/edit via a `FormModal` with `datetime-local` inputs; deletion uses a browser `confirm`.
- Data layer (`src/lib/admin/appointments.ts`) exposes `listAppointments()` with no filtering/pagination — it orders by `start_at DESC` and maps snake_case → camelCase.
- Admin UI uses **custom components only**: `DataTable`, `FormModal`, `LoadingState`, `EmptyState`, `ErrorState`. No shadcn/ui.
- Styling is **Tailwind CSS v4** with a minimal `globals.css`.
- Date/time handling uses native HTML inputs and `Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City' })` (seen in `SlotStep.tsx`).

### Affected Areas

- `app/(admin)/appointments/page.tsx` — add view toggle (list ↔ calendar); calendar will likely live here or in a sub-component.
- `src/components/admin/` — new `AppointmentCalendar` component(s) and possibly a view-switcher button group.
- `src/lib/admin/appointments.ts` — `listAppointments()` currently loads every row; calendar view may need a date-range filtered query (`listAppointmentsInRange`) for performance as the agenda grows.
- `app/api/admin/appointments/route.ts` — may need a query-parameter variant to return appointments within a month/week range.
- `supabase/migrations/0001_agenda_tables.sql` — `providers` table has only `id` and `name`; provider colors are **not yet modeled**.
- `src/lib/admin/types.ts` — `Provider` type lacks a color field.
- `src/lib/admin/__tests__/appointments.test.ts` — new tests for range queries and calendar helpers.
- `app/(admin)/layout.tsx` — navigation already links to `/appointments`; no change required unless a dedicated sub-route is preferred.

### Approaches

1. **Custom calendar built with native `Date` + CSS Grid**
   - Pros: zero new dependencies; aligns with existing custom-component pattern; full control over provider-color blocks and month/year navigation; easy to tailor to the exact requirement.
   - Cons: more code to write and maintain; must handle accessibility (keyboard nav, ARIA roles), month boundaries, and timezone edge cases manually.
   - Effort: Medium-High

2. **Adopt a full calendar library (e.g., `react-big-calendar`)**
   - Pros: rich feature set (month/week/day views, drag-and-drop hooks, accessibility); less custom code.
   - Cons: heavy dependency; React 19 / Tailwind v4 / App Router compatibility is unverified in this repo; styling override can be painful; may pull in `moment` or `date-fns`.
   - Effort: Medium

3. **Lightweight library for month grid + custom time blocks (e.g., `react-calendar` for month nav, custom day rendering)**
   - Pros: smaller than a full calendar; handles month/year navigation and localization.
   - Cons: still introduces a dependency; time-block rendering and provider colors remain custom; React 19 compatibility needs checking.
   - Effort: Medium

### Recommendation

Use **Approach 1: a custom calendar component**. This project is an MVP with a small, controlled UI surface, already relies on custom components, and runs React 19 + Tailwind 4 where third-party calendar libraries may have integration friction. A custom grid gives exact control over provider-color blocks and keeps the bundle lean.

**Provider colors** should be added explicitly to the `providers` table (e.g., `color text` or `color_hex`) rather than hashing from the name, so admins can configure them.

### Risks

- **Provider color model missing**: the schema has no color field; adding it requires a migration and CRUD updates in `/providers`.
- **Unbounded data fetch**: `listAppointments()` loads every appointment; for a calendar the backend should eventually filter by visible range to avoid loading the entire history.
- **Timezone correctness**: all displayed times must stay in `America/Mexico_City`, consistent with `SlotStep.tsx` and the database `timestamptz` columns.
- **Accessibility**: a custom calendar requires keyboard navigation and ARIA roles; this is doable but must be tested.
- **Responsive layout**: a day-grid with time blocks can become cramped on mobile; the design should degrade gracefully.

### Ready for Proposal

Yes. The scope is clear: add a calendar view toggle to `/appointments`, introduce provider-color storage, and render month/year-navigable time blocks colored by provider.
