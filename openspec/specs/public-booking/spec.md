# Public Booking Specification

## Purpose

Provide an unauthenticated self-service booking surface at `/booking` for dental
clinic patients, protected by Cloudflare Turnstile CAPTCHA to prevent automated
abuse, with graceful degradation when CAPTCHA keys are absent.

## Requirements

### Requirement: Public booking route
The system MUST expose a booking wizard at `/booking` that is reachable without
authentication and MUST NOT redirect unauthenticated visitors to `/login`.

#### Scenario: Anonymous visitor reaches public booking
- GIVEN a visitor without a session
- WHEN they request `/booking`
- THEN the booking wizard MUST render (no redirect to `/login`)

### Requirement: Cloudflare Turnstile CAPTCHA before submit
The public booking form MUST require a valid Cloudflare Turnstile token before
the submit action is enabled. The token MUST be obtained from the Turnstile
widget using the site key from `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

#### Scenario: Submit disabled without CAPTCHA token
- GIVEN the public booking form is shown
- WHEN the user has not completed the CAPTCHA challenge
- THEN the submit button MUST be disabled

#### Scenario: Submit enabled with valid token
- GIVEN the user completes the Turnstile challenge
- WHEN a valid token is received
- THEN the submit button MUST become enabled

### Requirement: Server-side CAPTCHA verification
The public booking endpoint MUST verify the Turnstile token server-side using
`TURNSTILE_SECRET_KEY` before any write operation. Requests with missing,
invalid, or expired tokens MUST be rejected.

#### Scenario: Valid token accepted
- GIVEN a submit with a valid Turnstile token
- WHEN the endpoint verifies the token with Cloudflare
- THEN verification MUST succeed and the booking MAY proceed

#### Scenario: Invalid token rejected
- GIVEN a submit with an invalid or expired token
- WHEN the endpoint verifies the token
- THEN the endpoint MUST reject the request and MUST NOT write any data

#### Scenario: Missing token rejected
- GIVEN a submit without a `captchaToken` field
- WHEN the endpoint processes the request
- THEN it MUST reject the request

### Requirement: Graceful degradation when CAPTCHA keys are missing
When `NEXT_PUBLIC_TURNSTILE_SITE_KEY` or `TURNSTILE_SECRET_KEY` is not
configured, the system MUST disable the public submit button with a clear
explanatory message visible to the user. The system MUST NOT silently accept
submissions, and MUST NOT accept a token when the secret is absent.

#### Scenario: Missing site key disables submit
- GIVEN `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is not set
- WHEN the public booking page loads
- THEN the submit button MUST be disabled and a clear message MUST explain
  that booking is unavailable

#### Scenario: Missing secret key disables submit
- GIVEN `TURNSTILE_SECRET_KEY` is not set but the site key is
- WHEN the public booking page loads
- THEN the submit button MUST be disabled and a clear message MUST explain
  that booking is unavailable

#### Scenario: No silent degradation
- GIVEN CAPTCHA keys are missing
- WHEN a user attempts to submit
- THEN the system MUST NOT accept the submission and MUST NOT proceed with a
  booking

### Requirement: Public catalog endpoints without session
The catalog endpoints (services, providers, slots) used by the public booking
wizard MUST be reachable without an authenticated session.

#### Scenario: Anonymous fetches services
- GIVEN a visitor without a session
- WHEN they request the services catalog
- THEN the endpoint MUST return the catalog data

#### Scenario: Anonymous fetches availability
- GIVEN a visitor without a session
- WHEN they request slots for a provider and date
- THEN the endpoint MUST return available slots

### Requirement: Public endpoint rejects patientId
The public booking endpoint MUST NOT accept a `patientId` field. Patient
resolution on the public flow MUST occur only via phone and full name. This
prevents patient enumeration from unauthenticated routes.

#### Scenario: patientId rejected on public flow
- GIVEN a request to the public booking endpoint
- WHEN the payload contains a `patientId`
- THEN the endpoint MUST reject the request and MUST NOT resolve or expose
  patient records by id

### Requirement: Atomic booking on public flow
The public booking write MUST preserve the atomic no-overlap exclusion
constraint per provider, identical to the internal flow.

#### Scenario: Concurrent public bookings
- GIVEN two concurrent public bookings for the same provider interval
- WHEN both are submitted
- THEN at most one MUST succeed
- AND the other MUST be rejected by a conflict
