# Proposal: Admin Panel with Supabase Auth

## Intent

The clinic today can only create appointments through WhatsApp or through the public, unauthenticated `/booking` wizard. There is **no way for Jorge, his son, or the secretary to view or manage** the agenda tables (`patients`, `providers`, `services`, `business_hours`, `appointments`) through a UI, and the existing booking wizard is exposed to anyone with the URL. This change delivers an **admin panel** (frontend + backend) that:

1. Is protected by a **login screen** using **Supabase Auth** (email/password; the admin user is created in the Supabase project's Auth).
2. Provides **CRUD** (create/read/update/delete) for the five agenda tables through server-side API routes that use the service-role key (`getSupabaseAdmin()`).
3. Moves the **existing `/booking` wizard behind the login** as another option inside the admin panel — after login the user can reach both the admin CRUD screens and the booking flow.

## Scope

### In Scope

- A login screen (`/login`) that authenticates against Supabase Auth (email/password) and manages the session with `@supabase/ssr` cookies.
- Session middleware that refreshes the Supabase Auth cookie on every request.
- Server-side auth gating: admin pages and admin/booking API routes require a valid session; unauthenticated access redirects to `/login` (pages) or returns 401 (API).
- Admin CRUD screens + API routes for `patients`, `providers`, `services`, `business_hours`, `appointments`, all flowing through server-side `getSupabaseAdmin()`.
- Relocation of the booking wizard into the authenticated admin area (`/booking` remains the URL; it is now protected and reachable from the admin navigation).
- Keeping the existing booking service (`src/lib/booking/*`) and its atomic-booking behavior unchanged.

### Out of Scope

- Role-based authorization beyond a single authenticated admin (no per-user data scoping in MVP).
- Patient-facing accounts / patient self-service login.
- The WhatsApp inbound agent and its transport (separate `whatsapp-inbound-automation` change).
- Any change to `travelhub-app`.
- Clinical records, files, payments, or billing (later MVPs).

## Capabilities

### New Capabilities

- `admin-panel`: the authenticated admin UI + API that exposes CRUD over the agenda tables and hosts the booking wizard behind login.

### Modified Capabilities

- None structurally. The `appointment-booking` service and the `booking-ui` wizard behavior are preserved; only their access route gains an authentication gate.

## Approach

Add `@supabase/ssr` for cookie-based session management, following the canonical Supabase Next.js pattern:

- A browser Supabase client (`createBrowserClient`) is used **only for auth** (sign-in/sign-out/session), never to read or write agenda tables directly.
- A server Supabase client (`createServerClient` over `next/headers` cookies) verifies the session (`auth.getUser()`) in server components and route handlers.
- A `middleware.ts` refreshes the session cookie on each request.
- Data operations keep using the existing `getSupabaseAdmin()` (service-role) exclusively, so the `REVOKE anon` + no-policy RLS posture is preserved and the `service_role` key never reaches the browser.

New server API routes under `app/api/admin/{patients,providers,services,business-hours,appointments}` wrap a new `src/lib/admin/*` CRUD service. The admin pages live in an `app/(admin)/` route group whose layout enforces authentication and renders the shared navigation (Dashboard, Citas, Pacientes, Proveedores, Servicios, Horarios, Reservar cita, Sign out). The booking page moves from `app/booking/page.tsx` to `app/(admin)/booking/page.tsx`; its wizard and API routes gain the same session gate.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `package.json` | New dep | Add `@supabase/ssr` |
| `middleware.ts` | New | Session refresh for the Supabase auth cookie |
| `src/lib/supabase/server.ts` | Extended | Add SSR server client + `getCurrentUser`/`requireUser` helpers (keep `getSupabaseAdmin`) |
| `src/lib/supabase/client.ts` | Extended | Browser client via `@supabase/ssr` for auth |
| `src/lib/admin/*` | New | CRUD service layer over the five agenda tables |
| `app/api/admin/**` | New | Authenticated REST handlers for CRUD |
| `app/(admin)/**` | New | Protected pages: dashboard, CRUD screens, relocated booking |
| `app/login/**` | New | Login screen |
| `app/page.tsx` | Modified | Redirect `/` → login-or-dashboard based on session |
| `app/booking/page.tsx` | Moved | Relocated into `app/(admin)/booking/page.tsx` |
| `app/api/booking/*` | Modified | Add session gate (`requireUser`) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking the existing booking flow or its tests | Med | Keep `src/lib/booking/*` and wizard logic verbatim; only add a gate; update route tests to mock the auth helper |
| `service_role` reaching the browser | Low | Admin/booking data ops only in server routes via `getSupabaseAdmin()`; browser client is auth-only; static test asserts no `service_role` import in client code |
| Next 15 + `@supabase/ssr` API mismatch vs training data | Med | Read `node_modules/next/dist/docs/` and follow `@supabase/ssr@0.6` cookie pattern (`cookies()` is async) |
| Build/test requiring Supabase env vars | Med | Auth reads happen at runtime only (dynamic routes via `cookies()`); existing `force-dynamic`/mocked tests already build without env |
| Oversized review (well over 400-line budget) | High | `auto-chain` + `stacked-to-main`; work-unit commits on one branch, forecasted in tasks.md |

## Rollback Plan

- `git revert <commit>` on the `feat/admin-panel` branch restores the pre-change state.
- Remove `app/(admin)/`, `app/login/`, `app/api/admin/`, `src/lib/admin/`, and `middleware.ts`; restore `app/booking/page.tsx` to its original location.
- No new database migration is introduced (RLS unchanged), so no schema rollback is required.
- If the login gate must be disabled quickly, `git revert` is the only step needed; the booking API routes' session gate is removed by the same revert.

## Dependencies

- Existing `appointment-booking` backend + `booking_free_slots` RPC (already deployed).
- Supabase Auth enabled in the project, with at least one admin user pre-created.
- Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) present at runtime.
- `@supabase/ssr` (installed as part of this change).

## Success Criteria

- [ ] An unauthenticated visitor is redirected from `/` and any admin route to `/login`.
- [ ] A valid Supabase Auth user can sign in and reach the admin panel + booking wizard.
- [ ] Admin can create/read/update/delete `patients`, `providers`, `services`, `business_hours`, and `appointments`.
- [ ] The booking wizard still completes service → provider → slot → confirm with atomic booking and conflict/next-available handling.
- [ ] No `service_role` secret appears in any client bundle or response.
- [ ] `npx tsc --noEmit` (0 errors), `npm run test` (all pass), `npm run build` (success).
