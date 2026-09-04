# Tasks: Appointments Calendar View

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~550–750 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: foundation; PR 2: calendar UI; PR 3: providers + integration |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Range query, timezone, DB color | PR 1 | `npx vitest run src/lib/admin/__tests__` | Local Supabase migration | Revert migration + data-layer files |
| 2 | Calendar UI + toggle | PR 2 | `npx vitest run src/components/admin/calendar/__tests__` | `/appointments` toggle | Remove calendar dir + toggle code |
| 3 | Provider color CRUD + tests | PR 3 | `npm run test` | `/providers` form | Revert providers page + mapper |

## Phase 1: Foundation

- [x] 1.1 Create `supabase/migrations/0005_providers_color.sql`: add `providers.color` with CHECK, create `idx_appointments_start_at`; add down migration.
- [x] 1.2 Update `src/lib/admin/types.ts`: add `color?: string | null` to `Provider` and `ProviderInput`.
- [x] 1.3 Add `parseHexColor` to `src/lib/admin/validate.ts`.
- [x] 1.4 Create `src/lib/admin/timezone.ts`: `CLINIC_TZ`, `clinicDayKey`, `clinicMonthRangeUtc` via `Intl.DateTimeFormat.formatToParts`.

## Phase 2: Data Layer & API

- [x] 2.1 RED: Add failing tests in `src/lib/admin/__tests__/appointments.test.ts` for span guard and `gte`/`lt` args.
- [x] 2.2 GREEN: Implement `listAppointmentsRange()` in `src/lib/admin/appointments.ts` with 62-day clamp and `ValidationError`.
- [x] 2.3 REFACTOR: Extract shared range validation; leave `listAppointments()` untouched.
- [x] 2.4 Update `src/lib/admin/providers.ts` to map `color` and validate with `parseHexColor`.
- [x] 2.5 Modify `app/api/admin/appointments/route.ts` to read `start`/`end` and call range query when both present.

## Phase 3: Calendar UI

- [x] 3.1 Create `src/components/admin/calendar/MonthCalendar.tsx`: CSS Grid, 42 cells, Monday-first, padding days.
- [x] 3.2 Create `src/components/admin/calendar/DayCell.tsx` with chips using inline `style={{ backgroundColor }}`.
- [x] 3.3 Create `src/components/admin/calendar/CalendarNav.tsx` with prev/next month and year selector.
- [x] 3.4 Create `src/components/admin/calendar/ProviderLegend.tsx` with visible-provider colors and fallback.
- [x] 3.5 RED: Add jsdom tests in `src/components/admin/calendar/__tests__/MonthCalendar.test.tsx` for cells, chips, color, fallback.
- [x] 3.6 GREEN: Update components until tests pass; keep logic pure.

## Phase 4: Integration & Providers CRUD

- [x] 4.1 Modify `app/(admin)/appointments/page.tsx`: add view state, `visibleMonth`, range fetch, and list/calendar toggle.
- [x] 4.2 Wire `onSelectBlock` to the existing appointment edit flow.
- [x] 4.3 Modify `app/(admin)/providers/page.tsx`: add color input with validation feedback.
- [x] 4.4 Add page-level integration test for view toggle and range fetch without re-auth.

## Phase 5: Verification & Cleanup

- [x] 5.1 Run `npx tsc --noEmit` and fix type errors.
- [x] 5.2 Run `npm run test` and `npm run build`.
- [x] 5.3 Resolve open design questions: dim cancelled/no-show blocks and day-cell overflow.
- [x] 5.4 Record that `npm run lint` and `npm run test:e2e` are absent and skipped.
