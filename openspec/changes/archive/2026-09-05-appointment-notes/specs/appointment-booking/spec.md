# Delta for Appointment Booking

## MODIFIED Requirements

### Requirement: Appointments

The system MUST store appointments linked to a patient, service, and provider,
with start/end times, a status, and an optional notes text field. The notes
field MUST be nullable; when provided it MUST be persisted, when absent it MUST
be stored as null.

(Previously: appointments did not carry a notes field.)

#### Scenario: Appointment recorded

- GIVEN a booking is confirmed
- WHEN it is persisted
- THEN an appointment row MUST reference patient, service, provider, and a
  valid time interval

#### Scenario: Appointment with notes persisted

- GIVEN a booking is confirmed with a non-empty notes string
- WHEN it is persisted
- THEN the appointment row MUST include the notes value in the `notes` column

#### Scenario: Appointment without notes stores null

- GIVEN a booking is confirmed without notes
- WHEN it is persisted
- THEN the `notes` column MUST be null

### Requirement: Atomic booking

The system MUST prevent two bookings from occupying the same provider time
interval. The booking function MUST accept an optional `notes` parameter, trim
it, and forward it to the appointment record. If the trimmed value is empty,
the system MUST store null.

(Previously: atomic booking did not accept or persist a notes parameter.)

#### Scenario: Concurrent double booking

- GIVEN two bookings attempt to reserve the same provider interval
- WHEN both are persisted
- THEN at most one MUST succeed
- AND the other MUST be rejected by a conflict

#### Scenario: Notes trimmed and forwarded

- GIVEN a booking request with `notes = "  text  "`
- WHEN the booking function processes the request
- THEN the persisted notes MUST be `"text"` (trimmed)

#### Scenario: Empty notes after trim stored as null

- GIVEN a booking request with `notes = "   "` (whitespace only)
- WHEN the booking function processes the request
- THEN the persisted notes MUST be null
