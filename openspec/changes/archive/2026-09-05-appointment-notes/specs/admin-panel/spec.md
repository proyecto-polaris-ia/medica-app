# Delta for Admin Panel

## ADDED Requirements

### Requirement: Appointment notes in admin list

The appointments list MUST display a "Notas" column showing a truncated preview
(~80 characters) of the appointment's notes field. When an appointment has no
notes, the cell MUST display an empty indicator "—".

#### Scenario: Notes column shows truncated preview

- GIVEN an appointment exists with notes longer than 80 characters
- WHEN the admin views the appointments list
- THEN the "Notas" column MUST display the first ~80 characters of the notes

#### Scenario: Empty notes shows dash indicator

- GIVEN an appointment exists with no notes (null or empty)
- WHEN the admin views the appointments list
- THEN the "Notas" column MUST display "—"

### Requirement: Appointment notes in edit modal

The appointment create/edit modal MUST include a textarea labeled "Notas de la
cita" bound to the `notes` field. The field MUST be optional. Saving MUST
persist the notes value. Clearing the notes and saving MUST persist null/empty.

#### Scenario: Edit modal shows notes textarea

- GIVEN an admin opens the appointment edit modal for an existing appointment
- WHEN the modal renders
- THEN a textarea labeled "Notas de la cita" MUST be visible and pre-filled
  with the current notes value (if any)

#### Scenario: Save persists notes

- GIVEN an admin edits the notes textarea in the modal
- WHEN they save the appointment
- THEN the `notes` field MUST be persisted with the entered value

#### Scenario: Clearing notes saves null

- GIVEN an appointment with existing notes
- WHEN the admin clears the notes textarea and saves
- THEN the persisted `notes` value MUST be null or empty

## MODIFIED Requirements

### Requirement: Appointments CRUD

The admin panel MUST allow an authenticated user to list, create, update, and
delete `appointments` records (patient, service, provider, start/end, status,
notes), preserving the atomic no-overlap constraint. The list view MUST include
a "Notas" column and the edit modal MUST include a notes textarea.

(Previously: appointments CRUD did not include the notes field in list or edit.)

#### Scenario: Manage appointments

- GIVEN an authenticated admin
- WHEN they create, read, update, and delete appointments
- THEN each operation MUST persist the corresponding change to the
  `appointments` table and MUST respect the provider no-overlap exclusion
  constraint

#### Scenario: Notes round-trip on create

- GIVEN an authenticated admin creates an appointment with notes text
- WHEN the appointment is saved and then listed
- THEN the notes value MUST appear in the "Notas" column and in the edit modal

### Requirement: Booking flow behind login

The internal booking wizard MUST be available at `/appointments/new` only to
authenticated users, reachable from the admin navigation, and MUST preserve its
existing multi-step, atomic-booking behavior. The confirm step MUST include an
optional notes textarea labeled "¿Quieres agregar algo más para tener en
consideración para tu cita?". A separate public booking wizard MUST be available
at `/booking` without authentication.

(Previously: internal booking wizard confirm step did not capture notes.)

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

- GIVEN an admin on the internal booking wizard confirm step
- WHEN the confirm step renders
- THEN an optional textarea labeled "¿Quieres agregar algo más para tener en
  consideración para tu cita?" MUST be visible
