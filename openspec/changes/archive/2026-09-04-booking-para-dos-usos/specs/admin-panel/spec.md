# Delta for Admin Panel

## MODIFIED Requirements

### Requirement: Booking flow behind login
The internal booking wizard MUST be available at `/appointments/new` only to
authenticated users, reachable from the admin navigation, and MUST preserve its
existing multi-step, atomic-booking behavior. A separate public booking wizard
MUST be available at `/booking` without authentication.
(Previously: The booking wizard was available at `/booking` only to authenticated users.)

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

### Requirement: Protected admin routes
Admin pages (dashboard, CRUD screens, and internal booking) MUST require an
authenticated session. The public `/booking` route MUST NOT be treated as an
admin route. An unauthenticated request to an admin page MUST be redirected to
`/login`.
(Previously: Admin pages including `/booking` required an authenticated session.)

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

### Requirement: Unauthenticated API rejection
Admin API routes MUST reject requests without a valid session with
`401 Unauthorized`. The public booking API route is an exception: it MUST accept
unauthenticated requests but MUST verify a Turnstile CAPTCHA token before any
write.
(Previously: All booking API routes rejected requests without a valid session with `401`.)

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

## ADDED Requirements

### Requirement: Internal booking endpoint authentication
The internal booking API endpoint at `/api/admin/booking/book` MUST require a
valid session and MUST return `401 Unauthorized` otherwise.

#### Scenario: Internal booking without session
- GIVEN a request to `/api/admin/booking/book` without a session
- WHEN the route processes the request
- THEN it MUST return `401`
