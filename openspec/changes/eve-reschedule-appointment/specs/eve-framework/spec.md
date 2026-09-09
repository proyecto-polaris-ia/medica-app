## ADDED Requirements

### Requirement: Eve Reschedule Appointment Tool

The Eve agent MUST expose a `reschedule-appointment` tool for patient requests to move or reprogram an existing appointment. The tool MUST update an existing appointment row instead of inserting a new appointment row.

#### Scenario: Existing appointment is moved without duplicate
- GIVEN a patient has an existing appointment
- AND the patient asks to move that appointment to a new available time
- WHEN Eve calls `reschedule-appointment` with the original appointment identity and the new interval
- THEN the existing appointment row MUST be updated to the new interval
- AND no second appointment row MUST be inserted for that move

#### Scenario: Missing original appointment is not recreated
- GIVEN the original appointment cannot be identified safely
- WHEN Eve calls `reschedule-appointment`
- THEN the tool MUST return `success: false`
- AND Eve MUST NOT call `book-appointment` as a fallback for the same move request

#### Scenario: Reschedule conflict is surfaced
- GIVEN the requested new interval overlaps another appointment for the provider
- WHEN the backend reports a booking conflict
- THEN `reschedule-appointment` MUST return `success: false` with `conflict: true`
- AND Eve MUST ask the patient to choose another real available time

### Requirement: Eve Reschedule Instructions

Eve instructions and booking skill guidance MUST distinguish new bookings from reschedules. For move/reprogram/change-time requests about an existing appointment, Eve MUST use `reschedule-appointment` and MUST NOT use `book-appointment`.

#### Scenario: Move request selects reschedule guidance
- GIVEN the patient asks to move an appointment
- WHEN Eve follows the booking skill
- THEN the skill MUST direct Eve to validate availability and call `reschedule-appointment`
- AND it MUST forbid confirming the move unless `reschedule-appointment` returns `success: true`
