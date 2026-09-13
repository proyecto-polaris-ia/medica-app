# Admin Panel Delta

## Modified Requirements

### Requirement: Patients record access
The admin panel MUST allow authenticated staff to open a read-only initial patient record from the patients list.

#### Scenario: Patient list opens record page
- GIVEN an authenticated admin on `/patients`
- WHEN they activate the record action for a patient
- THEN the app MUST navigate to `/patients/{patient_id}`

### Requirement: Appointment patient record modal
The admin appointments surface MUST allow authenticated staff to open a read-only patient record modal from a patient name when an appointment is linked to a patient.

#### Scenario: Appointment list opens patient record modal
- GIVEN an authenticated admin on `/appointments`
- AND an appointment is linked to patient `P1`
- WHEN they activate the patient name in the list
- THEN the app MUST open a modal showing patient `P1` record information

#### Scenario: Appointment without patient has no record action
- GIVEN an appointment is not linked to a patient
- WHEN the appointment is rendered
- THEN the patient cell MUST NOT offer a patient record action
