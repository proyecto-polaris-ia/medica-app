# Delta for Appointment Booking

## ADDED Requirements

### Requirement: Patient-scoped appointment lookup

The system MUST support patient-scoped appointment lookup for WhatsApp by resolving the patient from a trusted WhatsApp phone and returning only upcoming active appointments for that patient. The lookup MUST be read-only and MUST NOT create or update patient records.

#### Scenario: Upcoming active appointments are returned
- GIVEN a trusted WhatsApp phone maps to patient `P`
- AND patient `P` has requested, confirmed, or pending future appointments
- WHEN lookup runs
- THEN only those upcoming active appointments for patient `P` MUST be returned

#### Scenario: Unlinked WhatsApp returns safe empty result
- GIVEN a trusted WhatsApp phone does not map to any patient
- WHEN lookup runs
- THEN the system MUST return a successful empty result
- AND it MUST NOT create a patient record

#### Scenario: Cancelled and past appointments are excluded
- GIVEN patient `P` has cancelled, rescheduled, attended, no-show, or past appointments
- WHEN lookup runs
- THEN those appointments MUST NOT be returned in the upcoming active appointment list
