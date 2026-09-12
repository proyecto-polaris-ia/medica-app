## MODIFIED Requirements

### Requirement: Patient resolution from contact

The system MUST resolve or create a patient record from the inbound contact when booking. Resolution MUST accept either a `patientId` (direct lookup) OR contact data containing phone and/or email plus `fullName`. When `patientId` is provided, the system MUST resolve by id and MUST NOT create a new patient. When a trusted channel phone is present, the system MUST use that phone as the patient phone and MUST NOT allow the conversation text to override it. When email is provided, the system MUST forward it to patient resolution and preserve existing identity-conflict handling.

#### Scenario: WhatsApp contact phone is authoritative
- GIVEN a WhatsApp booking or reschedule has trusted sender phone `P`
- AND the user asks to use another phone `Q`
- WHEN patient resolution runs
- THEN it MUST use phone `P`
- AND it MUST NOT resolve or create by phone `Q`

#### Scenario: Email enriches patient identity
- GIVEN a booking or reschedule includes trusted phone `P` and email `E`
- WHEN patient resolution runs
- THEN it MUST resolve or create using phone `P` and email `E`
- AND existing conflict handling MUST apply if `P` and `E` belong to different patients

#### Scenario: Non-WhatsApp contact must be collected
- GIVEN an appointment request comes from a channel without trusted phone context
- WHEN no patient phone is available
- THEN the system MUST ask for or require a patient phone before creating or rescheduling a WhatsApp-style patient-linked appointment
