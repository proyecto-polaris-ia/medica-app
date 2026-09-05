# Delta for Public Booking

## ADDED Requirements

### Requirement: Public booking accepts optional notes

The public booking wizard's final step (confirm) MUST include an optional textarea labeled "¿Quieres agregar algo más para tener en consideración para tu cita?". The textarea MUST accept up to 1000 characters. The label MUST be "Notas de la cita" (not "Notas") to avoid confusion with patient notes.

#### Scenario: Notes textarea visible on confirm step
- GIVEN a user has completed service, provider, and slot selection in the public booking wizard
- WHEN the confirm step renders
- THEN an optional textarea labeled "¿Quieres agregar algo más para tener en consideración para tu cita?" MUST be visible

#### Scenario: Notes textarea enforces max length
- GIVEN the notes textarea on the confirm step
- WHEN the user types more than 1000 characters
- THEN the textarea MUST NOT accept input beyond 1000 characters

### Requirement: Public booking endpoint persists notes

The public booking API endpoint (`/api/booking/book`) MUST accept an optional `notes` string in the request body. The endpoint MUST trim the value; if the trimmed result is empty, it MUST forward null. If the trimmed value exceeds 1000 characters, the endpoint MUST reject the request with a validation error. The notes MUST be forwarded to `bookAppointment`.

#### Scenario: Submit with valid notes
- GIVEN a valid booking request with notes = "Tengo alergia al látex"
- WHEN the endpoint processes the request
- THEN the notes MUST be trimmed and forwarded to `bookAppointment`
- AND the resulting appointment MUST store notes = "Tengo alergia al látex"

#### Scenario: Submit with notes exceeding 1000 characters
- GIVEN a booking request with notes longer than 1000 characters
- WHEN the endpoint processes the request
- THEN it MUST reject the request with a validation error and MUST NOT write any data

#### Scenario: Submit without notes
- GIVEN a booking request with no `notes` field
- WHEN the endpoint processes the request
- THEN the booking MUST proceed normally with notes = null

#### Scenario: Submit with whitespace-only notes
- GIVEN a booking request with notes = "   " (whitespace only)
- WHEN the endpoint processes the request
- THEN the notes MUST be stored as null after trimming
