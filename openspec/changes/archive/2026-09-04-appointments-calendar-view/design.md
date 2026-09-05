# Design: Appointments Calendar View

## Technical Approach

Additive. Presentational calendar under `src/components/admin/calendar/*`, state owned by `app/(admin)/appointments/page.tsx` — the container/dumb split already used with `DataTable`. New `listAppointmentsRange()` bounds the query; `listAppointments()` stays untouched so the list cannot regress. Clinic-local date math lives in one helper; no component calls `Date.getMonth()`.

## Architecture Decisions

| # | Choice | Rejected | Rationale |
|---|---|---|---|
| 1 | `listAppointmentsRange(startIso, endIso)`: `.gte('start_at')`, `.lt('start_at')`, asc | Replace `listAppointments()`; client filter | Both share `mapRow`; zero blast radius on the list or the WhatsApp booking path. |
| 2 | Add `idx_appointments_start_at ON appointments(start_at)` | Reuse existing index | `idx_appointments_provider_start` is `(provider_id, start_at)`; a `start_at`-only range can't use its leading column, so the calendar would seq-scan. |
| 3 | Same route, optional `?start=&end=`; both present → range | New `/range` route | Backward compatible; one `requireUser()` surface. |
| 4 | `parseIsoDate` both params, require `end > start`, clamp span to 62 days | Trust the client | `?start=1900&end=2900` is a self-inflicted DoS. Guard belongs in the data layer per "backend validates". |
| 5 | `src/lib/admin/timezone.ts` via `Intl.DateTimeFormat.formatToParts` | `date-fns-tz`, `Temporal`, fixed `-06:00` | Zero new deps (hard constraint) and DST-correct — a fixed offset breaks every April and October. |
| 6 | `providers.color text NULL` + `CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$')`; UI fallback `#64748b` | `NOT NULL DEFAULT`; color-name enum | Nullable keeps the migration non-blocking and makes "sin color" an explicit legend state; the CHECK stops bad hex reaching `style`. |
| 7 | Inline `style={{ backgroundColor }}` | `className={\`bg-[${color}]\`}` | Tailwind v4 scans source statically — a runtime-interpolated value emits **no CSS**. |
| 8 | `useState<'list' \| 'calendar'>` in `page.tsx` | `?view=` via `useSearchParams` | That hook needs a Suspense boundary in Next 15 plus a router round-trip. Both views reuse one `loadData()`. |
| 9 | `grid grid-cols-7`, 6 rows, Monday-first, padding cells; `HH:mm` chips | Absolute hour timeline | Month view only per scope — no pixel math, no overflow bugs. |

## Data Flow

    page.tsx (state owner)
      │ visibleMonth {year, month}
      ├─→ clinicMonthRangeUtc() → fetch ?start&end → route.ts → listAppointmentsRange()
      ├─→ groupByClinicDay() → Map<'YYYY-MM-DD', CalendarBlock[]>
      └─→ <MonthCalendar> → <DayCell> → chips → onSelectBlock → openEdit
    <CalendarNav> → setVisibleMonth

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/admin/timezone.ts` | Create | Clinic tz parts, day key, month range |
| `src/lib/admin/appointments.ts` | Modify | Range query + span guard |
| `src/lib/admin/providers.ts` | Modify | `color` in select, mapper, validator |
| `src/lib/admin/validate.ts` | Modify | `parseHexColor` |
| `src/lib/admin/types.ts` | Modify | `Provider.color`, `ProviderInput.color?` |
| `app/api/admin/appointments/route.ts` | Modify | Read `start`/`end` |
| `supabase/migrations/0005_providers_color.sql` | Create | Column + CHECK + index |
| `.../down/0005_providers_color.down.sql` | Create | Drop column + index |
| `.../calendar/MonthCalendar.tsx` | Create | CSS Grid month, pure props |
| `.../calendar/DayCell.tsx` | Create | Day number + chips |
| `.../calendar/CalendarNav.tsx` | Create | Prev/next, year, "Hoy" |
| `.../calendar/ProviderLegend.tsx` | Create | Color ↔ provider, "Sin color" |
| `app/(admin)/appointments/page.tsx` | Modify | Toggle, visibleMonth, range fetch |
| `app/(admin)/providers/page.tsx` | Modify | Color input in form |

`.../calendar/` = `src/components/admin/calendar/`.

## Interfaces / Contracts

```ts
export const CLINIC_TZ = 'America/Mexico_City';
export function clinicDayKey(iso: string): string;      // 'YYYY-MM-DD' clinic tz
export function clinicMonthRangeUtc(                    // month 1-12
  year: number, month: number
): { startAt: string; endAt: string };                  // UTC ISO, [start, end)

export async function listAppointmentsRange(            // throws: end<=start, >62d
  startAtIso: string, endAtIso: string
): Promise<Appointment[]>;

export type CalendarBlock = {
  id: string; label: string; startLabel: string;        // 'HH:mm' clinic tz
  color: string; status: AppointmentStatus;
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit (node) | `clinicMonthRangeUtc` Dec/Jan wrap, Feb leap, **both DST transitions**; `clinicDayKey` on a UTC instant landing on the previous clinic day | Pure, no mocks — `__tests__/timezone.test.ts` |
| Unit (node) | Range mapping, exact `gte`/`lt` args, `end<=start` and >62d rejection, `color` mapping, `parseHexColor` | Extend `appointments.test.ts` / `providers.test.ts`, reusing the chainable `vi.mock('@/lib/supabase/server')` |
| Component (jsdom) | 42 cells, padding days flagged, chips per day, chip `backgroundColor`, `null`-color fallback, `onSelectBlock`, `CalendarNav` rollover both ways | RTL + `user-event` in `calendar/__tests__/`; jsdom via existing `environmentMatchGlobs` |
| Integration | Toggle swaps views without re-auth; only in-range rows render | Page-level RTL, stubbed `fetch` |

Gates: `npx tsc --noEmit`, `npm run test`, `npm run build`. `strict_tdd` — RED first.

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. The only new external input is `start`/`end`, covered by Decision 4 plus Supabase parameter binding.

## Migration / Rollout

Additive `ADD COLUMN` (no rewrite) plus `CREATE INDEX IF NOT EXISTS`. Existing rows get `NULL` and use the fallback color, so the calendar is correct before any provider is edited. Rollback drops column and index. No feature flag — the calendar is unreachable until the toggle is clicked.

## Open Questions

- [ ] `openspec/config.yaml` declares `lint: npm run lint` and `e2e: npm run test:e2e`; neither script exists in `package.json`. Resolve before `sdd-verify`.
- [ ] Render `cancelled`/`no_show` dimmed, or filter out? Assumed dimmed.
- [ ] Day-cell overflow above ~4 appointments: "+N más" vs. in-cell scroll.
