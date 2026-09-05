# Admin Panel Specification

**Baseline**: new-capability

## Purpose

Provide an authenticated admin panel for the dental clinic: a Supabase Auth
email/password login that gates access to CRUD screens over the agenda tables
(`patients`, `providers`, `services`, `business_hours`, `appointments`) and to
the relocated booking wizard, while keeping the `service_role` key server-side
only.

## Requirements

### Requirement: Email/password login
The application MUST provide a login screen that authenticates users with Supabase Auth using email and password. The admin user MUST be pre-created in the Supabase project's Auth; the application SHALL NOT create users itself.

#### Scenario: Valid credentials sign in
- GIVEN a user exists in Supabase Auth with a known email and password
- WHEN they submit valid credentials on the login screen
- THEN the application MUST establish an authenticated session and navigate to the admin panel

#### Scenario: Invalid credentials are rejected
- GIVEN a user submits an unknown email or wrong password
- WHEN the login request is processed
- THEN the application MUST show an error and MUST NOT establish a session

### Requirement: Cookie-based session management
The application MUST manage the Supabase Auth session using HTTP cookies via `@supabase/ssr`, MUST refresh the session cookie on requests through middleware, and MUST NOT persist the `service_role` key in the browser.

#### Scenario: Session survives navigation
- GIVEN an authenticated user
- WHEN they navigate between admin pages
- THEN the application MUST recognize the session from the cookie without re-login

#### Scenario: Session refreshes transparently
- GIVEN an authenticated user with an expiring token
- WHEN any request passes through middleware
- THEN the middleware MUST refresh the session cookie when Supabase issues new tokens

### Requirement: Server-side secret isolation
The `service_role` key MUST remain server-side only. Admin CRUD and booking write operations MUST flow through server-side API routes that use `getSupabaseAdmin()`; the browser client SHALL be used for authentication only.

#### Scenario: No secret in client bundle
- GIVEN the admin panel is built and served
- WHEN the browser loads pages and performs operations
- THEN no `service_role` secret MUST appear in client code or responses, and all data operations MUST go through server-side routes

#### Scenario: Browser client is auth-only
- GIVEN the browser Supabase client is initialized
- WHEN the admin UI loads data
- THEN the UI MUST fetch through `/api/admin/*` and `/api/booking/*`, and MUST NOT query agenda tables directly with the anon key

### Requirement: Protected admin routes
Admin pages (dashboard, CRUD screens, and internal booking) MUST require an
authenticated session. The public `/booking` route MUST NOT be treated as an
admin route. An unauthenticated request to an admin page MUST be redirected to
`/login`.

#### Scenario: Unauthenticated visitor is redirected
- GIVEN a visitor without a session
- WHEN they request any admin route (dashboard, CRUD, `/appointments/new`)
- THEN the application MUST redirect them to `/login`

#### Scenario: Public booking excluded from admin protection
- GIVEN a visitor without a session
- WHEN they request `/booking`
- THEN the application MUST NOT redirect to `/login` and MUST render the public
  booking wizard

#### Scenario: Authenticated user is admitted
- GIVEN an authenticated user
- WHEN they request an admin route
- THEN the application MUST render the requested admin screen

### Requirement: Home redirect
The root path `/` MUST send an unauthenticated visitor to the login screen and MUST send an authenticated user to the admin dashboard.

#### Scenario: Anonymous root
- GIVEN a visitor without a session
- WHEN they request `/`
- THEN they MUST land on `/login`

#### Scenario: Authenticated root
- GIVEN an authenticated user
- WHEN they request `/`
- THEN they MUST land on the admin dashboard

### Requirement: Patients CRUD
The admin panel MUST allow an authenticated user to list, create, update, and delete `patients` records (full name, E.164 phone, notes).

#### Scenario: Create and list a patient
- GIVEN an authenticated admin
- WHEN they create a patient with a valid name and phone, then view the list
- THEN the created patient MUST appear with the submitted data

#### Scenario: Update a patient
- GIVEN an existing patient
- WHEN the admin edits the patient's fields and saves
- THEN the persisted record MUST reflect the changes

#### Scenario: Delete a patient
- GIVEN an existing patient
- WHEN the admin deletes the patient
- THEN the record MUST be removed and MUST no longer appear in the list

### Requirement: Providers CRUD
The admin panel MUST allow an authenticated user to list, create, update, and delete `providers` records (name, color). The `color` MUST be stored as a text/hex value per provider and MUST be editable through the provider form. The calendar view consumes this `color` for block coloring.

#### Scenario: Manage providers
- GIVEN an authenticated admin
- WHEN they create, read, update, and delete providers
- THEN each operation MUST persist the corresponding change to the `providers` table

#### Scenario: Provider color persists
- GIVEN an authenticated admin
- WHEN they set or update a provider's `color` and save
- THEN the `color` value MUST persist on the `providers` record and MUST be retrievable by the calendar view

#### Scenario: Missing or invalid color is tolerated
- GIVEN an admin submits a provider with no color or an unsupported color string
- WHEN the record is saved
- THEN the system SHOULD accept the record and the calendar MUST fall back to a neutral color for that provider

### Requirement: Services CRUD
The admin panel MUST allow an authenticated user to list, create, update, and delete `services` records (name and positive duration in minutes).

#### Scenario: Manage services
- GIVEN an authenticated admin
- WHEN they create, read, update, and delete services
- THEN each operation MUST persist the corresponding change to the `services` table, and duration MUST remain a positive integer

### Requirement: Business hours CRUD
The admin panel MUST allow an authenticated user to list, create, update, and delete `business_hours` records (provider, day of week, start time, end time with start before end).

#### Scenario: Manage business hours
- GIVEN an authenticated admin
- WHEN they create, read, update, and delete business-hours records
- THEN each operation MUST persist the corresponding change to the `business_hours` table

### Requirement: Appointments CRUD
The admin panel MUST allow an authenticated user to list, create, update, and delete `appointments` records (patient, service, provider, start/end, status), preserving the atomic no-overlap constraint.

#### Scenario: Manage appointments
- GIVEN an authenticated admin
- WHEN they create, read, update, and delete appointments
- THEN each operation MUST persist the corresponding change to the `appointments` table and MUST respect the provider no-overlap exclusion constraint

### Requirement: Booking flow behind login
The internal booking wizard MUST be available at `/appointments/new` only to
authenticated users, reachable from the admin navigation, and MUST preserve its
existing multi-step, atomic-booking behavior. A separate public booking wizard
MUST be available at `/booking` without authentication.

#### Scenario: Internal booking reachable after login
- GIVEN an authenticated admin
- WHEN they select the booking option in the admin navigation
- THEN the internal booking wizard MUST render at `/appointments/new`

#### Scenario: Internal booking unreachable before login
- GIVEN a visitor without a session
- WHEN they request `/appointments/new`
- THEN they MUST be redirected to `/login`

#### Scenario: Public booking reachable without login
- GIVEN a visitor without a session
- WHEN they request `/booking`
- THEN the public booking wizard MUST render (no redirect)

### Requirement: Unauthenticated API rejection
Admin API routes MUST reject requests without a valid session with
`401 Unauthorized`. The public booking API route is an exception: it MUST accept
unauthenticated requests but MUST verify a Turnstile CAPTCHA token before any
write.

#### Scenario: Admin API call without session
- GIVEN a request to an admin API route with no valid session cookie
- WHEN the route processes the request
- THEN it MUST return `401` and MUST NOT read or write data

#### Scenario: Public booking API call without session
- GIVEN a request to the public booking API route with no session
- WHEN the route processes the request with a valid Turnstile token
- THEN it MUST proceed to write data

#### Scenario: Public booking API call without valid token
- GIVEN a request to the public booking API route
- WHEN the Turnstile token is missing or invalid
- THEN it MUST reject the request and MUST NOT write data

### Requirement: Internal booking endpoint authentication
The internal booking API endpoint at `/api/admin/booking/book` MUST require a
valid session and MUST return `401 Unauthorized` otherwise.

#### Scenario: Internal booking without session
- GIVEN a request to `/api/admin/booking/book` without a session
- WHEN the route processes the request
- THEN it MUST return `401`

### Requirement: Graceful degradation without configuration
External integrations MUST degrade gracefully when required environment keys are missing, and MUST NOT throw on import.

#### Scenario: Missing Supabase keys
- GIVEN the Supabase URL or keys are not configured
- WHEN the server initializes clients or a route handles a request
- THEN the application MUST fail with a clear, actionable error at use time rather than crashing at module load
