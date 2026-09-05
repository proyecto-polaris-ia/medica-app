# Delta Spec: Bugfix Booking Flow

**Change**: bugfix-booking-flow
**Baseline**: `openspec/specs/appointment-booking/spec.md`

## MODIFIED Requirements

### Patient resolution from contact
The system MUST resolve or create a patient record from the inbound WhatsApp contact phone when booking.

**Clarification**: When creating a new patient, the system MUST use the `fullName` provided in the booking form. If `fullName` is not provided, it MAY fall back to a generated name (e.g., `Patient {phone}`).

#### Scenario: First booking creates a patient with provided name
- GIVEN a WhatsApp contact with a phone and no linked patient
- WHEN a booking is made for that contact with `fullName: "María García"`
- THEN a patient record MUST be created with `full_name: "María García"` (not a generated name)

#### Scenario: First booking creates a patient without name
- GIVEN a WhatsApp contact with a phone and no linked patient
- WHEN a booking is made for that contact without `fullName`
- THEN a patient record MUST be created with a generated name (e.g., `Patient {phone}`)

### Time zone correctness
The system MUST interpret working hours and appointments in the clinic time zone (`America/Mexico_City`) and store instants as `timestamptz`.

**Clarification**: All user-facing displays of date/time MUST be formatted in the clinic's local timezone, not as raw UTC/ISO strings.

#### Scenario: Confirmation displays local time
- GIVEN a booking confirmed for 17:00 local time
- WHEN the confirmation page is displayed
- THEN the date/time MUST be formatted as "17:00" (local), not "2026-09-03T23:00:00.000Z" (UTC)

## ADDED Requirements

### Past date/time validation
The system MUST prevent users from selecting dates or time slots in the past.

#### Scenario: Date input restricts past dates
- GIVEN a user on the booking form
- WHEN the date picker is displayed
- THEN dates before today MUST be disabled (not selectable)

#### Scenario: Time slots filter past times
- GIVEN a user selects today's date
- WHEN the time slots are displayed
- THEN time slots that have already passed MUST NOT be shown

### Appointments list display
The admin appointments list MUST display the patient's name (not the patient ID).

#### Scenario: Appointments list shows patient name
- GIVEN an appointment with `patient_id` referencing a patient with `full_name: "María García"`
- WHEN the admin appointments list is displayed
- THEN the patient column MUST show "María García" (not the UUID)

#### Scenario: Appointments list without patient
- GIVEN an appointment with `patient_id: null`
- WHEN the admin appointments list is displayed
- THEN the patient column MUST show "Sin paciente" (or similar placeholder)
