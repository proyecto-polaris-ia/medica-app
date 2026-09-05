# Delta for Appointment Booking

## MODIFIED Requirements

### Requirement: Patient resolution from contact
The system MUST resolve or create a patient record from the inbound contact
when booking. Resolution MUST accept either a `patientId` (direct lookup) OR a
`{ phone_e164, fullName }` pair (phone-based lookup or create). When
`patientId` is provided, the system MUST resolve by id and MUST NOT create a
new patient. When only phone and name are provided, the system MUST resolve by
phone or create a new patient.
(Previously: The system resolved or created a patient from the inbound WhatsApp contact phone only.)

#### Scenario: First booking creates a patient
- GIVEN a WhatsApp contact with a phone and no linked patient
- WHEN a booking is made for that contact
- THEN a patient record MUST be created and linked to the contact

#### Scenario: Resolve by patientId
- GIVEN an internal booking request with `patientId = P1`
- WHEN the system resolves the patient
- THEN it MUST return patient `P1` and MUST NOT create a new record

#### Scenario: Resolve by phone when patientId absent
- GIVEN a booking request with `phone_e164` and `fullName` but no `patientId`
- WHEN the system resolves the patient
- THEN it MUST find an existing patient by phone or create a new one
