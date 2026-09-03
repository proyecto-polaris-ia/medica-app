# Tasks: Admin Panel with Supabase Auth

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1500–2200 |
| 400-line budget risk | High |
| 800-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | Unit 1: Auth foundation → Unit 2: Admin CRUD service + API → Unit 3: Admin CRUD UI → Unit 4: Booking relocation + protection → Unit 5: Verification |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

The work is delivered as sequential work-unit commits on the single `feat/admin-panel` branch (stacked-to-main: each unit is a reviewable commit that builds on the previous, culminating in one PR to `main`).

### Suggested Work Units

| Unit | Goal | Commit | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | `@supabase/ssr` + session clients + middleware + login | `feat(admin-panel): auth foundation` | `npm run test` | `npm run typecheck` | Revert `package.json`, `middleware.ts`, `src/lib/supabase/*`, `app/login/**` |
| 2 | Admin CRUD service + authenticated REST API | `feat(admin-panel): admin crud api` | `npm run test` | `curl` against local dev | Delete `src/lib/admin/`, `app/api/admin/` |
| 3 | Admin CRUD screens + shared shell/nav | `feat(admin-panel): admin crud ui` | `npm run test` | Manual `/dashboard` flow | Delete `app/(admin)/**`, `src/components/admin/**` |
| 4 | Relocate booking + protect booking routes | `feat(admin-panel): protect booking` | `npm run test` | Manual `/booking` after login | Restore `app/booking/page.tsx`, revert `app/api/booking/*` gate |
| 5 | Verification + secret isolation + build | `chore(admin-panel): verify` | `npm run test` + `npm run build` | End-to-end | Revert test additions only |

## Phase 1: Auth foundation

- [x] 1.1 Add `@supabase/ssr@^0.6` to `dependencies` (already installed).
- [x] 1.2 Read `node_modules/next/dist/docs/` (Route Handlers, Server Components, Middleware) and `@supabase/ssr` usage before writing code.
- [x] 1.3 Extend `src/lib/supabase/server.ts`: keep `getSupabaseAdmin()`; add `createSupabaseServerClient()` (async `cookies()`), `getCurrentUser()`, and `requireUser()` (throws `UnauthorizedError`). `(Req: cookie-based session management, server-side secret isolation)`
- [x] 1.4 Update `src/lib/supabase/client.ts` to expose `getSupabaseClient()` via `@supabase/ssr` `createBrowserClient` (auth-only). `(Req: server-side secret isolation)`
- [x] 1.5 Create `src/lib/supabase/middleware.ts` with `updateSession()`. `(Req: cookie-based session management)`
- [x] 1.6 Create root `middleware.ts` calling `updateSession`, with a matcher excluding static assets. `(Req: cookie-based session management)`
- [x] 1.7 **RED**: write `src/lib/supabase/auth.test.ts` asserting `requireUser` throws when unauthenticated and returns the user when authenticated (mock `@supabase/ssr`). `(Req: protected admin routes, unauthenticated API rejection)`
- [x] 1.8 **GREEN**: implement `getCurrentUser`/`requireUser`.
- [x] 1.9 Create `app/login/page.tsx` + `src/components/auth/LoginForm.tsx` (client, `signInWithPassword`, error state, redirect to `/dashboard`). `(Req: email/password login)`

## Phase 2: Admin CRUD service + API

- [x] 2.1 Create `src/lib/admin/types.ts` with typed row/input models for the five tables. `(Req: CRUD for each entity)`
- [x] 2.2 **RED**: write `src/lib/admin/__tests__/patients.test.ts` for list/create/update/delete mapping. `(Req: patients CRUD)`
- [x] 2.3 **GREEN**: implement `src/lib/admin/patients.ts`. `(Req: patients CRUD)`
- [x] 2.4 **RED+GREEN**: implement `providers.ts`, `services.ts`, `business-hours.ts`, `appointments.ts` with unit tests. `(Req: providers/services/business-hours/appointments CRUD)`
- [x] 2.5 Create `app/api/admin/_lib/validate.ts` (reuse UUID/phone/date parsing + add duration/day-of-week/time validators). `(Req: CRUD validation)`
- [x] 2.6 Create `app/api/admin/_lib/auth.ts` re-exporting `requireUser`. `(Req: unauthenticated API rejection)`
- [x] 2.7 **RED**: write `app/api/admin/patients/route.test.ts` for 401 (no session), list, create, 400 invalid, 409 conflict. `(Req: unauthenticated API rejection, patients CRUD)`
- [x] 2.8 **GREEN**: implement `app/api/admin/patients/route.ts` + `[id]/route.ts`. `(Req: patients CRUD)`
- [x] 2.9 **RED+GREEN**: implement + test route handlers for `providers`, `services`, `business-hours`, `appointments`. `(Req: CRUD for each entity)`

## Phase 3: Admin CRUD UI + shared shell

- [x] 3.1 Create `app/(admin)/layout.tsx` server component: `requireUser()` + `redirect('/login')` + shared nav (Dashboard, Citas, Pacientes, Proveedores, Servicios, Horarios, Reservar cita, Sign out). `(Req: protected admin routes)`
- [x] 3.2 Create `app/(admin)/dashboard/page.tsx`. `(Req: home redirect)`
- [x] 3.3 Create reusable `src/components/admin/*` (table, form field, modal/empty/error states). `(Req: CRUD for each entity)`
- [x] 3.4 Create `app/(admin)/patients/page.tsx` (client CRUD via `/api/admin/patients`). `(Req: patients CRUD)`
- [x] 3.5 Create `app/(admin)/providers/page.tsx`. `(Req: providers CRUD)`
- [x] 3.6 Create `app/(admin)/services/page.tsx`. `(Req: services CRUD)`
- [x] 3.7 Create `app/(admin)/business-hours/page.tsx`. `(Req: business hours CRUD)`
- [x] 3.8 Create `app/(admin)/appointments/page.tsx`. `(Req: appointments CRUD)`
- [x] 3.9 Update `app/page.tsx` to redirect `/` → `/dashboard` (layout re-gates to `/login`). `(Req: home redirect)`

## Phase 4: Booking relocation + protection

- [x] 4.1 Move `app/booking/page.tsx` → `app/(admin)/booking/page.tsx` (URL stays `/booking`). `(Req: booking flow behind login)`
- [x] 4.2 Add `requireUser()` gate to the four `app/api/booking/*` handlers. `(Req: unauthenticated API rejection, booking flow behind login)`
- [x] 4.3 Update the four booking `route.test.ts` files to mock the auth helper and add a 401 case. `(Req: unauthenticated API rejection)`
- [x] 4.4 Add/extend the static `secret-isolation.test.ts` to cover `src/components/admin/**` and `src/components/auth/**` (no `service_role`/`supabase/server` import). `(Req: server-side secret isolation)`

## Phase 5: Verification

- [x] 5.1 Run `npm run test`; fix failures.
- [x] 5.2 Run `npx tsc --noEmit`; fix errors.
- [x] 5.3 Run `npm run build`; fix failures.
- [x] 5.4 Confirm the booking wizard still works behind login and admin CRUD round-trips.
