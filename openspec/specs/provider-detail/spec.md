# Provider Detail Specification

**Baseline**: new-capability

## Purpose

Read-only "concentrado" view of one provider at `/providers/[id]`, reached from a
"Ver" action on the `/providers` DataTable. It gives staff a snapshot —
upcoming appointments, today's `America/Mexico_City` agenda, and recently served
clients — without changing booking logic, schema, or Auth↔provider mapping. Data
is read from the DB; availability is never invented.

## Requirements

### Requirement: Provider view action
The `/providers` DataTable MUST expose a "Ver" action per row navigating to
`/providers/[id]`, additive to Edit/Delete.

#### Scenario: Ver navigates to detail
- GIVEN an authenticated admin on `/providers`
- WHEN they activate "Ver" on a row
- THEN the app MUST navigate to `/providers/{provider_id}`

### Requirement: Detail page header
The page MUST render the provider's name as the header.

#### Scenario: Header shows name
- GIVEN provider "Dra. García"
- WHEN its detail page loads
- THEN the header MUST display "Dra. García"

### Requirement: Upcoming appointments
The page MUST list future appointments (`start_at` after now), ascending by
`start_at`, limited to the next N, showing patient, service, `start_at`.

#### Scenario: Sorted ascending
- GIVEN future appointments at 2026-09-10 09:00 and 2026-09-05 14:00
- WHEN the page loads
- THEN 09-05 MUST appear before 09-10

#### Scenario: Empty state
- GIVEN no future appointments
- WHEN the page loads
- THEN the section MUST show an explicit empty state, not an error

### Requirement: Today's agenda (clinic time zone)
The page MUST show the provider's appointments for the current clinic day,
computed in `America/Mexico_City` (never UTC), inclusive at local 00:00 and
exclusive at next-day 00:00.

#### Scenario: Local-day boundary
- GIVEN an appointment at 2026-09-03 00:00 America/Mexico_City
- WHEN the page loads on local 2026-09-03
- THEN it MUST appear in today's agenda

#### Scenario: UTC offset excluded
- GIVEN an appointment at 2026-09-03 05:00 UTC (= 2026-09-02 23:00 local)
- WHEN the page loads on local 2026-09-03
- THEN it MUST NOT appear in today's agenda

### Requirement: Recent clients (last 30 days)
The page MUST list distinct patients from appointments in the trailing 30 clinic
days with status `attended` OR `confirmed`, including a count.

#### Scenario: Attended and confirmed counted
- GIVEN an `attended` (10d ago) and a `confirmed` (5d ago) appointment
- WHEN the page loads
- THEN both appear and the count MUST be at least 2

#### Scenario: Out-of-window excluded
- GIVEN an `attended` appointment 45 days ago
- WHEN the page loads
- THEN it MUST NOT appear in recent clients

### Requirement: Link to full client list
The page MUST link to the provider-filtered full appointments list.

#### Scenario: Link targets filtered list
- GIVEN the detail page
- WHEN the admin selects the full list link
- THEN the appointments list MUST open pre-filtered to that provider

### Requirement: Unknown provider id is not found
The page and `GET /api/admin/providers/[id]` MUST return `404` for an `[id]`
with no matching provider, and MUST NOT render a placeholder.

#### Scenario: Nonexistent id
- GIVEN no provider "00000000"
- WHEN the page or GET is requested
- THEN it MUST return `404` with no data rendered

#### Scenario: Malformed id
- GIVEN an id that is not a valid UUID
- WHEN the route processes it
- THEN it MUST return `404`/`400`, never a rendered page

### Requirement: Authenticated read access
`GET /api/admin/providers/[id]` MUST require a session and return `401` without
one; reads MUST use the server-side service-role client.

#### Scenario: Unauthenticated read rejected
- GIVEN a request with no valid session
- WHEN the route processes it
- THEN it MUST return `401` and MUST NOT read data

#### Scenario: Authenticated read served
- GIVEN a request with a valid session
- WHEN the route processes it
- THEN it MUST return the snapshot via the service-role client
