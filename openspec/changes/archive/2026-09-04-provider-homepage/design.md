# Design: Provider Detail Page (Concentrado)

## Technical Approach

Additive read-only slice. One composer, `getProviderSnapshot(providerId, now)`, is the single
source of truth for two callers: the new Server Component page
`app/(admin)/providers/[id]/page.tsx` and a new `GET` on the existing
`app/api/admin/providers/[id]/route.ts` (required by spec). Reads use the existing service-role
layer (`getSupabaseAdmin`) behind the existing `requireUser` gate. No migration:
`idx_appointments_provider_start (provider_id, start_at)` already backs every query. This slice
only *reads* `appointments`; it never computes availability.

## Architecture Decisions

| Decision | Options | Tradeoff | Decision + Rationale |
|---|---|---|---|
| Page render model | (a) Server Component; (b) `'use client'` + `fetch`, like sibling pages | (b) matches convention but adds a waterfall, spinners, and no `notFound()` | **(a)**. Siblings are client-side because they *mutate*; this is read-only. One round trip, native `notFound()` for the 404 requirement, auth already enforced by `app/(admin)/layout.tsx`. |
| RSC data source | (a) call the composer; (b) self-`fetch` the `GET` | (b) needs absolute URL, cookie forwarding, extra hop | **(a)**. Route and page share one composer, so logic cannot drift. |
| Query shape | (a) 4 scoped queries in `Promise.all`; (b) one wide query partitioned in memory | (b) saves 2 hops but widens the scan and couples sections | **(a)**. Constant 4 round trips, each index-backed. PostgREST embeds supply patient/service names — that removes the N+1 the proposal flagged. |
| "Today" boundary | (a) TS helper deriving the MX offset via `Intl`; (b) new SQL function with `AT TIME ZONE` | (b) matches `booking_free_slots` but needs a migration — out of scope | **(a)** in `src/lib/admin/clinic-time.ts`. Offset derived, never hardcoded: Mexico dropped DST in 2022, so a literal `-06:00` is a latent bug. |
| Recent clients | (a) dedupe from embedded rows; (b) second query in `patients.ts` | (b) re-fetches joined data | **(a)**. So `src/lib/admin/patients.ts` needs **no** change, unlike the proposal's estimate. |
| "Ver" affordance | (a) optional `onView?: (row: T) => void`; (b) `viewHref` with `<Link>` | (b) yields a real anchor; (a) mirrors `onEdit`/`onDelete` and keeps `DataTable` routing-agnostic | **(a)**, rendered only when supplied, so the other five DataTable pages stay untouched. Navigation via `useRouter().push`. |
| Full-list link | (a) `/appointments?providerId=…`; (b) new `/providers/[id]/clients` | (b) adds a route and duplicates the list | **(a)**. Additive `useSearchParams()` filter; absent param = today's behavior. |

**Codebase constraint**: `src/components/admin/__tests__/secret-isolation.test.ts` asserts no file
under `src/components/admin/` references `supabase/server` or `SUPABASE_SERVICE_ROLE_KEY`, so
`ProviderSnapshot.tsx` stays purely presentational.

## Data Flow

    "Ver" ──→ router.push(/providers/[id])
                        │
      (admin)/layout.tsx  requireUser → /login
                        │
      [id]/page.tsx ──→ getProviderSnapshot(id, now)
                        │
          ┌─────────────┼──────────────┐
    clinic-time     getProvider     appointments.*
    (MX day range)  (404 if none)   (3 scoped reads)
                        │
              <ProviderSnapshot /> (presentational)

    GET /api/admin/providers/[id] ──→ requireUser ──→ same composer

## File Changes

| File | Action | Description |
|---|---|---|
| `src/lib/admin/clinic-time.ts` | Create | `clinicDayRange` / `trailingDaysRange` → UTC instants for local midnights |
| `src/lib/admin/provider-snapshot.ts` | Create | `getProviderSnapshot(providerId, now)`; dedupes clients |
| `app/(admin)/providers/[id]/page.tsx` | Create | RSC; `params: Promise<{id:string}>`; `notFound()` on `NotFoundError`/`ValidationError` |
| `src/components/admin/ProviderSnapshot.tsx` | Create | Sections UI; reuses `EmptyState`; no server imports |
| `src/lib/admin/appointments.ts` | Modify | `listUpcomingByProvider`, `listByProviderRange` + `patients`/`services` embeds |
| `src/lib/admin/providers.ts` | Modify | `getProvider(id)` → `parseUuid` + `NotFoundError` |
| `src/lib/admin/types.ts` | Modify | `ProviderSnapshot`, `ProviderAppointment`, `RecentClient` |
| `app/api/admin/providers/[id]/route.ts` | Modify | Add `GET` in `handleAdminRequest` |
| `app/(admin)/providers/page.tsx` | Modify | `useRouter` + `onView` wiring |
| `src/components/admin/DataTable.tsx` | Modify | Optional `onView` prop |
| `app/(admin)/appointments/page.tsx` | Modify | Optional `?providerId=` filter |

Tests — create `src/lib/admin/__tests__/clinic-time.test.ts`, `.../provider-snapshot.test.ts`,
`src/components/admin/__tests__/DataTable.test.tsx`; extend
`src/lib/admin/__tests__/{appointments,providers}.test.ts` and
`app/api/admin/providers/[id]/route.test.ts`.

## Interfaces / Contracts

```ts
export type ProviderSnapshot = {
  provider: Provider;
  upcoming: ProviderAppointment[];   // start_at > now, ASC, limit 10
  today: ProviderAppointment[];      // [localMidnight, nextLocalMidnight)
  recentClients: RecentClient[];     // 30d back, attended|confirmed, deduped
  clientsHref: string;               // /appointments?providerId=<id>
};
```

Error mapping via existing `handleAdminRequest`: `UnauthorizedError`→401,
`ValidationError`→400, `NotFoundError`→404.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Local-midnight inclusive, UTC-offset exclusion, 30d edges | Vitest, fixed `now`, pure |
| Unit | Composer: ASC order, empty sections, dedupe/counts, 404, malformed id | `vi.mock('@/lib/supabase/server')`, as in `providers.test.ts` |
| Integration | `GET` 401 / 404 / 200 | Route-handler test, as in existing `route.test.ts` |
| Component | `onView` renders only when passed; fires with the row | `@testing-library/react` (jsdom via `environmentMatchGlobs`) |
| E2E | Not added | No Playwright harness; `test:e2e` unwired |

## Threat Matrix

N/A — no command routing, shell, subprocess, VCS/PR automation, executable-file classification,
or process-integration boundary. This adds one page route and one `GET`, both behind the existing
`requireUser` gate with `parseUuid` validation.

## Migration / Rollout

No migration. No feature flag: additive and read-only. Rollback = revert the 11 files.

## Open Questions

- [ ] `upcoming` limit set to **10** — confirm the operational N with the clinic.
- [ ] "Trailing 30 days" runs from local midnight 30 days back to end of today's local day, so
      today's `confirmed` appointments count as recent. Confirm this matches staff intent.
- [ ] Non-blocking: `toLocalDateString` is duplicated across `availability.ts`,
      `next-available.ts`, `clinic-time.ts`. Consolidation is deliberately out of scope.
