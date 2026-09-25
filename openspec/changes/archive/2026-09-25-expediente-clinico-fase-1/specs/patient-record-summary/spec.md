# Delta for Patient Record Summary

## MODIFIED Requirements

### Requirement: Authenticated patient record API
The system MUST expose a server-side admin API that returns the patient's identification data, ficha de identificación and appointment summary only to authenticated users. The patient data section MUST be editable via the patient update API.

(Previously: The system returned a read-only patient record summary with contact data and appointment sections.)

#### Scenario: Authenticated user receives record
- GIVEN an authenticated admin
- WHEN they request the patient record
- THEN the API MUST return patient identification data, ficha de identificación, future appointments, and attended appointments for that patient

#### Scenario: Unauthenticated user rejected
- GIVEN a request without a valid admin session
- WHEN it requests the patient record
- THEN the API MUST return `401` and MUST NOT expose patient data

### Requirement: Patient data section
The patient record view MUST show the patient's full name, phone, email, notes, registration date, and ficha de identificación (birth date, sex, address, occupation, referral source, secondary phone, emergency contact name, emergency contact phone, emergency contact relationship) with explicit empty values when optional fields are missing. The ficha de identificación fields MUST be editable through the patient update API. The patient record view MUST be organized in tabs: Datos, Historia, Consultas and Citas.

(Previously: The patient record view showed only full name, phone, email, notes and registration date in a read-only layout.)

#### Scenario: Missing optional contact fields
- GIVEN a patient has no phone, email, or notes
- WHEN the record renders
- THEN each missing field MUST render a visible placeholder instead of disappearing

#### Scenario: Missing optional ficha fields
- GIVEN a patient has no birth date, address, or occupation
- WHEN the Datos tab renders
- THEN each missing ficha field MUST render a visible placeholder instead of disappearing

#### Scenario: Edit patient identification data
- GIVEN an authenticated admin viewing the Datos tab
- WHEN they update ficha de identificación fields and save
- THEN the system MUST persist the changes and reflect them in the patient record

### Requirement: Future appointments section
The patient record view MUST show future appointments for the patient sorted by start time ascending, excluding cancelled, rescheduled, no-show, and attended appointments. This section is accessible under the Citas tab.

#### Scenario: Future appointments sorted
- GIVEN two future active appointments for the same patient
- WHEN the record renders
- THEN the earliest future appointment MUST appear first

### Requirement: Attended appointments section
The patient record view MUST show appointments for the patient with status `attended`, sorted by start time descending. This section is accessible under the Citas tab.

#### Scenario: Attended appointments history
- GIVEN attended appointments for the patient
- WHEN the record renders
- THEN the most recent attended appointment MUST appear first
