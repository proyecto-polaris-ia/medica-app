# Delta for Appointment Booking

## MODIFIED Requirements

### Requirement: Appointments

The system MUST store appointments linked to a patient, service, and provider, with start/end times, a status, and optional notes. The `notes` field MUST be a nullable text column. When notes are provided, the system MUST persist them. When notes are absent, the field MUST be null.

(Previously: Appointments stored patient, service, provider, start/end, and status — without notes.)

#### Scenario: Appointment recorded
- GIVEN a booking is confirmed
- WHEN it is persisted
- THEN an appointment row MUST reference patient, service, provider, and a valid time interval

#### Scenario: Appointment with notes persisted
- GIVEN a booking is confirmed with notes = "First visit"
- WHEN it is persisted
- THEN the appointment row MUST include notes = "First visit"

#### Scenario: Appointment without notes
- GIVEN a booking is confirmed without notes
- WHEN it is persisted
- THEN the appointment row MUST have notes = null

### Requirement: Atomic booking

The system MUST prevent two bookings from occupying the same provider time interval. The booking function MUST accept an optional `notes` parameter and forward it to the persisted appointment record. Notes input MUST be trimmed; if the trimmed result is empty, the system MUST store null.

(Previously: Atomic booking prevented double-booking but did not carry notes through the booking function.)

#### Scenario: Concurrent double booking
- GIVEN two bookings attempt to reserve the same provider interval
- WHEN both are persisted
- THEN at most one MUST succeed
- AND the other MUST be rejected by a conflict

#### Scenario: Booking with notes
- GIVEN a valid booking request with notes = "  Needs wheelchair access  "
- WHEN the booking is persisted
- THEN the appointment MUST store notes = "Needs wheelchair access" (trimmed)

#### Scenario: Booking with empty notes stores null
- GIVEN a valid booking request with notes = "   " (whitespace only)
- WHEN the booking is persisted
- THEN the appointment MUST store notes = null
