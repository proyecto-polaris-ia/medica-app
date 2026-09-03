# Design: Admin Panel with Supabase Auth

## 1. Goal

Add an authenticated admin panel to `medica-app` (Next.js 15 App Router + Supabase) that provides CRUD over the agenda tables and moves the existing booking wizard behind login, without changing the booking service or leaking the `service_role` key to the browser.

## 2. Architecture decisions

### Decision 1 — Supabase Auth as the session authority; service_role as the data authority

The Supabase Auth session is used **only** to gate access (prove *who* is logged in). Data operations continue to run as `service_role` (bypassing RLS) on the server. This keeps the existing `REVOKE anon` + no-policy RLS posture intact and means **no database migration** is required.

Rationale: the agenda RLS was deliberately left without policies while the app relies on `service_role` server-side. Adding `authenticated`-role policies would be a larger, riskier change and is unnecessary when the browser never talks to Postgres directly.

Consequence: the browser Supabase client is **auth-only**. It never calls `.from(...)`. All data flows through `/api/admin/*` and `/api/booking/*`.

### Decision 2 — `@supabase/ssr` cookie pattern (not localStorage)

Use the canonical Supabase `@supabase/ssr` pattern:

- `src/lib/supabase/middleware.ts` exports `updateSession(request)` that creates a server client with a cookie store, calls `supabase.auth.getUser()`, and returns a `NextResponse` that sets refreshed cookies.
- `middleware.ts` (repo root) calls `updateSession` for every request (matcher excludes static assets).
- `src/lib/supabase/server.ts` gains `createSupabaseServerClient()` (via `next/headers` `cookies()`, which is async in Next 15) plus `getCurrentUser()` and `requireUser()`.
- `src/lib/supabase/client.ts` exposes `getSupabaseClient()` as a `createBrowserClient` (auth-only).

Rationale: SSR cookies keep the session server-verifiable (so route handlers and server components can gate access) and are refreshed transparently by middleware.

### Decision 3 — Server-side gating, not middleware redirects

Middleware only refreshes the session. Route protection is enforced where the session is actually consumed:

- The `app/(admin)/layout.tsx` server component calls `requireUser()` and `redirect('/login')` when null.
- Admin and booking route handlers call `requireUser()` and return `401` when null.

Rationale: `redirect` from a server component/layout is deterministic and unit-testable; middleware redirects are harder to test and duplicative.

### Decision 4 — Per-entity REST API + thin CRUD service

New `src/lib/admin/*` service (typed CRUD over the five tables via `getSupabaseAdmin()`), wrapped by route handlers:

```
app/api/admin/patients/route.ts          GET (list), POST (create)
app/api/admin/patients/[id]/route.ts     PATCH (update), DELETE
app/api/admin/providers/route.ts         ... (same shape)
app/api/admin/services/route.ts
app/api/admin/business-hours/route.ts
app/api/admin/appointments/route.ts
```

Each handler: parse/validate input → `requireUser()` → call the CRUD service → map errors to status codes. Booking API routes (`app/api/booking/*`) gain the same `requireUser()` gate.

### Decision 5 — Relocate booking into the authenticated group

`app/booking/page.tsx` moves to `app/(admin)/booking/page.tsx` (URL stays `/booking`). The `BookingWizard` and `src/lib/booking/*` are unchanged. The shared admin layout provides navigation including "Reservar cita".

## 3. Component layout

```
middleware.ts                       # session refresh (edge)
app/
  page.tsx                          # redirect / -> /dashboard (layout re-gates)
  login/page.tsx                    # login screen (server shell + client form)
  (admin)/
    layout.tsx                      # requireUser() + admin shell/nav
    dashboard/page.tsx              # admin home
    patients/page.tsx               # CRUD screens (client)
    providers/page.tsx
    services/page.tsx
    business-hours/page.tsx
    appointments/page.tsx
    booking/page.tsx                # relocated wizard
  api/
    admin/
      _lib/validate.ts              # shared validation (reuse parseUuid/phone/date)
      _lib/auth.ts                  # requireUser() re-export for routes
      patients/{route,[id]/route}
      providers/{route,[id]/route}
      services/{route,[id]/route}
      business-hours/{route,[id]/route}
      appointments/{route,[id]/route}
    booking/*                       # existing + requireUser() gate
src/
  lib/
    supabase/server.ts              # getSupabaseAdmin + createSupabaseServerClient + getCurrentUser + requireUser
    supabase/client.ts              # getSupabaseClient (createBrowserClient, auth-only)
    supabase/middleware.ts          # updateSession
    admin/
      types.ts                      # row types + input schemas
      patients.ts / providers.ts / services.ts / business-hours.ts / appointments.ts
    booking/*                       # unchanged
  components/
    admin/*                         # table + form components, nav shell pieces
    auth/LoginForm.tsx              # client login form (signInWithPassword)
    booking/*                       # unchanged
```

## 4. Sequence: sign-in flow

1. Browser loads `/login`; `LoginForm` (client) calls `getSupabaseClient().auth.signInWithPassword({ email, password })`.
2. `@supabase/ssr` writes the session cookies.
3. Client calls `router.push('/dashboard')` + `router.refresh()`.
4. `(admin)/layout` server component calls `requireUser()` (reads the cookie via `createSupabaseServerClient`), verifies the session, and renders the shell.
5. Subsequent data fetches hit `/api/admin/*` and `/api/booking/*`, whose handlers verify the session then act through `getSupabaseAdmin()`.

## 5. Sequence: data write (CRUD)

1. Client form posts JSON to `POST/PATCH/DELETE /api/admin/<entity>`.
2. Handler validates input (UUID/phone/date/duration/day-of-week/times) and calls `requireUser()`.
3. Handler calls the typed CRUD service (`getSupabaseAdmin()`).
4. Service executes the Supabase query; DB constraints (FKs, `duration_minutes > 0`, `start_time < end_time`, no-overlap exclusion) enforce integrity.
5. Handler maps errors to `400` (validation), `401` (no session), `409` (constraint), `404` (missing), `500` (other).

## 6. Data model (no schema change)

Reuse the existing agenda schema (migrations `0001`–`0004`): `patients`, `providers`, `services`, `business_hours`, `appointments` (with the `appointment_status` enum and the `appointments_provider_no_overlap` exclusion). The admin CRUD service reads/writes these tables verbatim.

## 7. Error handling & degradation

- `getSupabaseAdmin()` and the SSR clients throw a clear error only when called without the required env vars, never on import (matches the existing pattern).
- Auth gate failures return `401` / redirect to `/login`; data constraint failures return `409`; missing rows return `404`.
- The login form and CRUD screens render explicit loading/error/empty states.

## 8. Risks & mitigations

- **Breaking booking tests**: the four `app/api/booking/*/route.test.ts` files must mock the new auth helper; add a `401` case per route.
- **Next 15 async cookies**: `createSupabaseServerClient` must `await cookies()`; server components and handlers become dynamic (no build-time Supabase call).
- **Secret isolation**: a static test asserts no `service_role`/`supabase/server` import in `src/components/**` client code (mirrors the existing `secret-isolation.test.ts`).
