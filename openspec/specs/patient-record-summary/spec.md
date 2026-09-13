# Patient Record Summary Specification

## Purpose

Provide a read-only initial patient record surface for authenticated clinic staff, showing patient identity data plus future and attended appointments as the foundation for later clinical expediente features.

## Requirements

### Requirement: Authenticated patient record API
The system MUST expose a server-side admin API that returns a patient record summary only to authenticated users.

#### Scenario: Authenticated user receives record
- GIVEN an authenticated admin
- WHEN they request `/api/admin/patients/{patient_id}/record`
- THEN the API MUST return patient contact data, future appointments, and attended appointments for that patient

#### Scenario: Unauthenticated user rejected
- GIVEN a request without a valid admin session
- WHEN it requests `/api/admin/patients/{patient_id}/record`
- THEN the API MUST return `401` and MUST NOT expose patient data

### Requirement: Patient data section
The patient record view MUST show the patient's full name, phone, email, notes, and registration date with explicit empty values when optional fields are missing.

#### Scenario: Missing optional contact fields
- GIVEN a patient has no phone, email, or notes
- WHEN the record renders
- THEN each missing field MUST render a visible placeholder instead of disappearing

### Requirement: Future appointments section
The patient record view MUST show future appointments for the patient sorted by start time ascending, excluding cancelled, rescheduled, no-show, and attended appointments.

#### Scenario: Future appointments sorted
- GIVEN two future active appointments for the same patient
- WHEN the record renders
- THEN the earliest future appointment MUST appear first

### Requirement: Attended appointments section
The patient record view MUST show appointments for the patient with status `attended`, sorted by start time descending.

#### Scenario: Attended appointments history
- GIVEN attended appointments for the patient
- WHEN the record renders
- THEN the most recent attended appointment MUST appear first
