# Delta for Admin Panel

## ADDED Requirements

### Requirement: Appointment notes in admin list

The appointments list view MUST display a "Notas" column. When an appointment has notes, the list MUST show a truncated preview (SHOULD NOT exceed ~80 characters). When notes are absent, the cell MUST display an empty indicator (e.g. "—").

#### Scenario: Appointment with notes shows truncated preview
- GIVEN an appointment exists with notes longer than 80 characters
- WHEN the admin views the appointments list
- THEN the "Notas" column MUST display a truncated version of the notes (max ~80 characters)

#### Scenario: Appointment without notes shows empty indicator
- GIVEN an appointment exists with no notes (null or empty)
- WHEN the admin views the appointments list
- THEN the "Notas" column MUST display "—"

### Requirement: Appointment notes in edit modal

The appointment edit/create modal MUST include a textarea labeled "Notas de la cita" bound to the appointment's `notes` field. The textarea MUST be optional. The modal MUST persist notes on save.

#### Scenario: Edit modal shows existing notes
- GIVEN an appointment with notes "Patient prefers morning slots"
- WHEN the admin opens the edit modal for that appointment
- THEN the textarea labeled "Notas de la cita" MUST contain "Patient prefers morning slots"

#### Scenario: Create appointment with notes
- GIVEN the admin is creating a new appointment
- WHEN they fill in required fields and type "Bring X-ray" in the notes textarea, then save
- THEN the appointment MUST be persisted with notes = "Bring X-ray"

#### Scenario: Edit modal saves empty notes
- GIVEN an appointment with existing notes
- WHEN the admin clears the notes textarea and saves
- THEN the appointment notes MUST be persisted as null or empty

## MODIFIED Requirements

### Requirement: Appointments CRUD

The admin panel MUST allow an authenticated user to list, create, update, and delete `appointments` records (patient, service, provider, start/end, status, notes), preserving the atomic no-overlap constraint. The list view MUST include a "Notas" column. The edit/create modal MUST include a "Notas de la cita" textarea.

(Previously: Appointments CRUD managed patient, service, provider, start/end, status — without notes.)

#### Scenario: Manage appointments
- GIVEN an authenticated admin
- WHEN they create, read, update, and delete appointments
- THEN each operation MUST persist the corresponding change to the `appointments` table and MUST respect the provider no-overlap exclusion constraint

#### Scenario: CRUD includes notes
- GIVEN an authenticated admin
- WHEN they create or update an appointment with notes
- THEN the notes MUST be persisted and MUST be visible in the list and edit modal

### Requirement: Booking flow behind login

The internal booking wizard MUST be available at `/appointments/new` only to authenticated users, reachable from the admin navigation, and MUST preserve its existing multi-step, atomic-booking behavior. The final step (confirm) MUST include an optional notes textarea labeled "¿Quieres agregar algo más para tener en consideración para tu cita?". A separate public booking wizard MUST be available at `/booking` without authentication.

(Previously: Internal booking wizard had no notes field in the confirm step.)

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

#### Scenario: Internal booking confirm step includes notes
- GIVEN an admin is on the final step of the internal booking wizard
- WHEN the confirm step renders
- THEN an optional textarea labeled "¿Quieres agregar algo más para tener en consideración para tu cita?" MUST be visible
- AND submitting the wizard with notes MUST persist them on the appointment
