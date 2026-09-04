# Tasks: Provider Detail Page (Concentrado)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~650 (4 new source + 7 modified + 6 test files) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (under 800-line budget) |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Focused test command | Runtime harness | Rollback boundary |
|------|------|----------------------|-----------------|-------------------|
| 1 | Timezone + data layer + composer + API | `npm run test -- clinic-time provider-snapshot providers appointments route` | `npx tsc --noEmit`; route test 200/404/401 | Remove `clinic-time.ts`, `provider-snapshot.ts`, new types/fns, GET handler |
| 2 | UI: DataTable onView + ProviderSnapshot + page + wiring | `npm run test -- DataTable` | `npm run build`; `/providers` shows Ver | Remove `ProviderSnapshot.tsx`, `[id]/page.tsx`, onView prop, filter |

## Phase 1: Timezone Helpers (TDD)

- [x] 1.1 RED: `src/lib/admin/__tests__/clinic-time.test.ts` — `clinicDayRange` returns UTC `[localMidnight, nextLocalMidnight)` for `America/Mexico_City`; `trailingDaysRange(30)` spans 30 local days. `npm run test -- clinic-time` must FAIL.
- [x] 1.2 GREEN: `src/lib/admin/clinic-time.ts` — `clinicDayRange(now)`, `trailingDaysRange(now, days)` via `Intl.DateTimeFormat` offset (never hardcoded). Tests PASS.

## Phase 2: Data Layer (TDD)

- [x] 2.1 RED: Extend `providers.test.ts` — `getProvider`: found, `NotFoundError`, malformed UUID. Extend `appointments.test.ts` — `listUpcomingByProvider` (ASC, limit 10), `listByProviderRange` (inclusive/exclusive, patient+service embeds). Tests must FAIL.
- [x] 2.2 GREEN: Add types (`ProviderSnapshot`, `ProviderAppointment`, `RecentClient`) to `types.ts`. `getProvider(id)` with `parseUuid` in `providers.ts`. `listUpcomingByProvider`, `listByProviderRange` with `.select('*, patients(*), services(*)')` in `appointments.ts`. Tests PASS.
- [x] 2.3 RED: `provider-snapshot.test.ts` — mock supabase; test upcoming ASC, today MX local day, recentClients dedupe+counts, `NotFoundError`, malformed UUID. Must FAIL.
- [x] 2.4 GREEN: `provider-snapshot.ts` — `getProviderSnapshot(providerId, now)`: `getProvider` + 3 queries via `Promise.all` + in-memory client dedupe. Tests PASS.

## Phase 3: API Route (TDD)

- [x] 3.1 RED: Extend `route.test.ts` — GET 401 (no session), 404 (nonexistent), 200 (snapshot shape). Must FAIL.
- [x] 3.2 GREEN: Add `GET` in `route.ts` via `handleAdminRequest` + `getProviderSnapshot`. Map: `UnauthorizedError`→401, `NotFoundError`→404, `ValidationError`→400. Tests PASS.

## Phase 4: UI + Page (TDD)

- [x] 4.1 RED: `DataTable.test.tsx` — `onView` renders only when supplied; click fires `onView(row)`. Must FAIL.
- [x] 4.2 GREEN: Add `onView?: (row: T) => void` to `DataTable.tsx`. Tests PASS. `secret-isolation.test.ts` still green.
- [x] 4.3 Create `ProviderSnapshot.tsx` — presentational sections (header, upcoming, today, recentClients, link). Uses `EmptyState`. NO server imports.
- [x] 4.4 Create `[id]/page.tsx` — RSC, `params: Promise<{id:string}>`, calls composer, `notFound()` on error.

## Phase 5: Wiring + Verification

- [x] 5.1 Wire `onView` in `providers/page.tsx` → `router.push(\`/providers/\${row.id}\`)`.
- [x] 5.2 Add `?providerId=` filter via `useSearchParams()` in `appointments/page.tsx`.
- [x] 5.3 `npx tsc --noEmit && npm run test && npm run build` — all green. (Note: `npm run lint` is not defined in `package.json`; Next.js build performed its own lint/type check.)
