# Delta for Patient Record Summary

## MODIFIED Requirements

### Requirement: Patient data section

The patient record view MUST show the patient's full name, phone, email, notes, registration date, and ficha de identificación (birth date, sex, address, occupation, referral source, secondary phone, emergency contact name, emergency contact phone, emergency contact relationship) with explicit empty values when optional fields are missing. The ficha de identificación fields MUST be editable through the patient update API. The patient record view MUST be organized in tabs: Datos, Historia, Consultas, Citas and Plan de tratamiento.

(Previously: The patient record view was organized in tabs: Datos, Historia, Consultas and Citas. A new "Plan de tratamiento" tab has been added.)

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
