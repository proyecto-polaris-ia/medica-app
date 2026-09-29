# Patient Record Summary Specification

## Purpose

Provide the patient record surface for authenticated clinic staff, showing patient identity data with editable ficha de identificación plus future and attended appointments as the foundation of the clinical expediente.

## Requirements

### Requirement: Authenticated patient record API

The system MUST expose a server-side admin API that returns the patient's identification data, ficha de identificación and appointment summary only to authenticated users. The patient data section MUST be editable via the patient update API.

#### Scenario: Authenticated user receives record

- GIVEN an authenticated admin
- WHEN they request the patient record
- THEN the API MUST return patient identification data, ficha de identificación, future appointments, and attended appointments for that patient

#### Scenario: Unauthenticated user rejected

- GIVEN a request without a valid admin session
- WHEN it requests the patient record
- THEN the API MUST return `401` and MUST NOT expose patient data

### Requirement: Patient data section

The patient record view MUST show the patient's full name, phone, email, notes, registration date, and ficha de identificación (birth date, sex, address, occupation, referral source, secondary phone, emergency contact name, emergency contact phone, emergency contact relationship) with explicit empty values when optional fields are missing. The ficha de identificación fields MUST be editable through the patient update API. The patient record view MUST be organized in tabs: Datos, Historia, Consultas, Citas and Plan de tratamiento.

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

#### Scenario: Plan de tratamiento tab is visible

- GIVEN an authenticated admin viewing the patient record
- WHEN the tabs render
- THEN the system MUST display a "Plan de tratamiento" tab alongside Datos, Historia, Consultas and Citas

#### Scenario: Plan de tratamiento tab lists patient plans

- GIVEN an authenticated admin viewing the patient record of a patient with treatment plans
- WHEN they select the "Plan de tratamiento" tab
- THEN the system MUST display the list of treatment plans with status, responsible dentist, and total amount

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