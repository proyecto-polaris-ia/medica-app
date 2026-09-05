# Delta for Public Booking

## ADDED Requirements

### Requirement: Public booking confirm step includes notes textarea

The public booking wizard confirm step MUST include an optional textarea labeled
"Notas de la cita" with the prompt "¿Quieres agregar algo más para tener en
consideración para tu cita?". The textarea MUST enforce a maximum of 1000
characters.

#### Scenario: Notes textarea visible on confirm step

- GIVEN a user reaches the public booking confirm step
- WHEN the confirm step renders
- THEN an optional textarea labeled "Notas de la cita" MUST be visible with
  the prompt "¿Quieres agregar algo más para tener en consideración para tu
  cita?"

#### Scenario: Max 1000 characters enforced

- GIVEN a user types into the notes textarea
- WHEN the input exceeds 1000 characters
- THEN the system MUST prevent further input beyond 1000 characters

### Requirement: Public booking endpoint persists notes

The `/api/booking/book` endpoint MUST accept an optional `notes` string in the
request body. The endpoint MUST trim the value; if empty after trim, it MUST
store null. If the trimmed value exceeds 1000 characters, the endpoint MUST
reject the request. Valid notes MUST be forwarded to `bookAppointment`.

#### Scenario: Valid notes persisted

- GIVEN a public booking request with `notes = "Prefiero mañana"`
- WHEN the endpoint processes the request
- THEN the notes MUST be forwarded to `bookAppointment` and persisted on the
  appointment record

#### Scenario: Notes exceeding 1000 chars rejected

- GIVEN a public booking request with `notes` longer than 1000 characters after
  trim
- WHEN the endpoint validates the request
- THEN the endpoint MUST reject the request with a validation error and MUST
  NOT write any data

#### Scenario: No notes results in null

- GIVEN a public booking request without a `notes` field
- WHEN the endpoint processes the request
- THEN the `notes` passed to `bookAppointment` MUST be null

#### Scenario: Whitespace-only notes stored as null

- GIVEN a public booking request with `notes = "   "` (whitespace only)
- WHEN the endpoint trims the value
- THEN the `notes` passed to `bookAppointment` MUST be null
