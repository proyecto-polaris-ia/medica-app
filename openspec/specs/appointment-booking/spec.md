# Appointment Booking Specification

**Baseline**: new-capability

## Purpose

Model the dental clinic agenda — providers, services, working hours, and
appointments — and expose availability checks, atomic booking, and next-slot
recommendation for the WhatsApp agent.

## Requirements

### Requirement: Providers
The system MUST store providers (dentists) that own independent schedules.

#### Scenario: Provider exists
- GIVEN a dentist works at the clinic
- WHEN the provider is persisted
- THEN a provider row MUST exist with a name

### Requirement: Services with duration
The system MUST store services with a duration that defines the slot length.

#### Scenario: Service defines slot
- GIVEN a service has a duration in minutes
- WHEN availability is computed
- THEN the service duration MUST constrain the reserved time interval

### Requirement: Per-provider business hours
The system MUST store working hours per provider, per day of week.

#### Scenario: Provider working hours
- GIVEN a provider works Monday from 17:00 to 20:00
- WHEN availability is computed for that provider on Monday
- THEN candidate slots MUST fall within 17:00 to 20:00 local time

### Requirement: Appointments
The system MUST store appointments linked to a patient, service, and provider,
with start/end times and a status.

#### Scenario: Appointment recorded
- GIVEN a booking is confirmed
- WHEN it is persisted
- THEN an appointment row MUST reference patient, service, provider, and a valid time interval

### Requirement: Appointments list display
The admin appointments list MUST display the patient's name (not the patient ID).

#### Scenario: Appointments list shows patient name
- GIVEN an appointment with `patient_id` referencing a patient with `full_name: "María García"`
- WHEN the admin appointments list is displayed
- THEN the patient column MUST show "María García" (not the UUID)

#### Scenario: Appointments list without patient
- GIVEN an appointment with `patient_id: null`
- WHEN the admin appointments list is displayed
- THEN the patient column MUST show "Sin paciente" (or similar placeholder)

### Requirement: Availability computed from DB
The system MUST derive free slots from business hours minus existing
appointments. Availability MUST never be invented by the model.

#### Scenario: Occupied slot is excluded
- GIVEN a provider has an appointment at 17:00 for 30 minutes
- WHEN availability is computed for that provider and day
- THEN the 17:00 slot MUST NOT be offered

### Requirement: Atomic booking
The system MUST prevent two bookings from occupying the same provider time
interval.

#### Scenario: Concurrent double booking
- GIVEN two bookings attempt to reserve the same provider interval
- WHEN both are persisted
- THEN at most one MUST succeed
- AND the other MUST be rejected by a conflict

### Requirement: Next available slot recommendation
The system MUST compute the next available slot when the requested time range
has no free slot.

#### Scenario: Requested range is full
- GIVEN the requested day has no free slot
- WHEN the system searches for the next availability
- THEN it MUST return the earliest subsequent free slot that fits the service duration

### Requirement: Time zone correctness
The system MUST interpret working hours and appointments in the clinic time
zone (`America/Mexico_City`) and store instants as `timestamptz`. All
user-facing displays of date/time MUST be formatted in the clinic's local
timezone, not as raw UTC/ISO strings.

#### Scenario: Local slot resolves to correct instant
- GIVEN a slot is offered at 17:00 local time
- WHEN it is persisted
- THEN the stored instant MUST correspond to 17:00 in America/Mexico_City

#### Scenario: Confirmation displays local time
- GIVEN a booking confirmed for 17:00 local time
- WHEN the confirmation page is displayed
- THEN the date/time MUST be formatted as "17:00" (local), not "2026-09-03T23:00:00.000Z" (UTC)

### Requirement: Past date/time validation
The system MUST prevent users from selecting dates or time slots in the past.

#### Scenario: Date input restricts past dates
- GIVEN a user on the booking form
- WHEN the date picker is displayed
- THEN dates before today MUST be disabled (not selectable)

#### Scenario: Time slots filter past times
- GIVEN a user selects today's date
- WHEN the time slots are displayed
- THEN time slots that have already passed MUST NOT be shown

### Requirement: Cancellation releases the interval
The system MUST release an interval when an appointment is cancelled or
reprogrammed.

#### Scenario: Cancelled appointment frees the slot
- GIVEN an appointment occupies an interval
- WHEN it is cancelled
- THEN the interval MUST become available for new bookings

### Requirement: Patient resolution from contact
The system MUST resolve or create a patient record from the inbound WhatsApp
contact phone when booking. When creating a new patient, the system MUST use
the `fullName` provided in the booking form. If `fullName` is not provided,
it MAY fall back to a generated name (e.g., `Patient {phone}`).

#### Scenario: First booking creates a patient
- GIVEN a WhatsApp contact with a phone and no linked patient
- WHEN a booking is made for that contact
- THEN a patient record MUST be created and linked to the contact

#### Scenario: First booking creates a patient with provided name
- GIVEN a WhatsApp contact with a phone and no linked patient
- WHEN a booking is made for that contact with `fullName: "María García"`
- THEN a patient record MUST be created with `full_name: "María García"` (not a generated name)

#### Scenario: First booking creates a patient without name
- GIVEN a WhatsApp contact with a phone and no linked patient
- WHEN a booking is made for that contact without `fullName`
- THEN a patient record MUST be created with a generated name (e.g., `Patient {phone}`)
