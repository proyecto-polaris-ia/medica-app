# Delta Spec: Bugfix citas zona horaria

**Change**: bugfix-citas-zona-horaria
**Baseline**: `openspec/specs/appointments-calendar-view/spec.md`

## MODIFIED Requirements

### Requirement: Clinic timezone rendering
Appointment times MUST be rendered in the clinic timezone `America/Mexico_City`,
including daylight-saving transitions, in **every** view of the `/appointments`
page: the list, the calendar, and the appointment edit modal. The
`datetime-local` capture of the edit form MUST be interpreted as clinic time
when converting to the stored UTC instant; it SHALL NOT depend on the device
timezone.

#### Scenario: Same appointment shows the same wall-clock time in list and calendar

- GIVEN an appointment stored as `timestamptz` for 17:00 clinic time
- AND the admin device is set to a timezone other than `America/Mexico_City`
- WHEN the list and the calendar render the appointment
- THEN both views MUST display "17:00"

#### Scenario: Editing without changing the time does not shift the instant

- GIVEN an appointment stored for 17:00 clinic time
- AND the admin opens the edit modal from a device in another timezone
- WHEN the admin saves the form without touching the time inputs
- THEN the stored UTC instants MUST be unchanged

#### Scenario: Captured time is interpreted as clinic time

- GIVEN the admin device is in a timezone one hour ahead of the clinic
- WHEN the admin captures "17:00" in the edit modal
- THEN the system MUST store the UTC instant corresponding to 17:00 in
  `America/Mexico_City` (23:00Z)

#### Scenario: DST boundary correctness

- GIVEN an appointment stored as `timestamptz` near a DST change
- WHEN the calendar renders it
- THEN the displayed wall-clock time MUST be correct for `America/Mexico_City`

#### Scenario: Patient record shows clinic time

- GIVEN a patient record with visits or appointments rendered in the admin panel
- AND the admin device is set to a timezone other than `America/Mexico_City`
- WHEN the datetime columns render
- THEN the displayed wall-clock times MUST be correct for `America/Mexico_City`
