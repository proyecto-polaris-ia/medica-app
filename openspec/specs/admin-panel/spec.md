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
Admin pages (dashboard, CRUD screens, and booking) MUST require an authenticated session. An unauthenticated request to an admin page MUST be redirected to `/login`.

#### Scenario: Unauthenticated visitor is redirected
- GIVEN a visitor without a session
- WHEN they request any admin route (including `/booking`)
- THEN the application MUST redirect them to `/login`

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
The existing booking wizard MUST remain available at `/booking` only to authenticated users, reachable from the admin navigation, and MUST preserve its existing multi-step, atomic-booking behavior.

#### Scenario: Booking reachable after login
- GIVEN an authenticated admin
- WHEN they select the booking option in the admin navigation
- THEN the existing booking wizard MUST render and complete a booking as before

#### Scenario: Booking unreachable before login
- GIVEN a visitor without a session
- WHEN they request `/booking`
- THEN they MUST be redirected to `/login` instead of seeing the wizard

### Requirement: Unauthenticated API rejection
Admin and booking API routes MUST reject requests without a valid session with `401 Unauthorized`.

#### Scenario: API call without session
- GIVEN a request to an admin or booking API route with no valid session cookie
- WHEN the route processes the request
- THEN it MUST return `401` and MUST NOT read or write data

#### Scenario: API call with session
- GIVEN a request with a valid session cookie
- WHEN the route processes the request
- THEN it MUST proceed to read or write data through the service-role client

### Requirement: Graceful degradation without configuration
External integrations MUST degrade gracefully when required environment keys are missing, and MUST NOT throw on import.

#### Scenario: Missing Supabase keys
- GIVEN the Supabase URL or keys are not configured
- WHEN the server initializes clients or a route handles a request
- THEN the application MUST fail with a clear, actionable error at use time rather than crashing at module load
