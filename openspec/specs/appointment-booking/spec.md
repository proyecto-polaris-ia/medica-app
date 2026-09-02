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
zone (`America/Mexico_City`) and store instants as `timestamptz`.

#### Scenario: Local slot resolves to correct instant
- GIVEN a slot is offered at 17:00 local time
- WHEN it is persisted
- THEN the stored instant MUST correspond to 17:00 in America/Mexico_City

### Requirement: Cancellation releases the interval
The system MUST release an interval when an appointment is cancelled or
reprogrammed.

#### Scenario: Cancelled appointment frees the slot
- GIVEN an appointment occupies an interval
- WHEN it is cancelled
- THEN the interval MUST become available for new bookings

### Requirement: Patient resolution from contact
The system MUST resolve or create a patient record from the inbound WhatsApp
contact phone when booking.

#### Scenario: First booking creates a patient
- GIVEN a WhatsApp contact with a phone and no linked patient
- WHEN a booking is made for that contact
- THEN a patient record MUST be created and linked to the contact
