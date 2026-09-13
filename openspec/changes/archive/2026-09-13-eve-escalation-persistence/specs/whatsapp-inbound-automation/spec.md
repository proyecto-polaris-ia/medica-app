# WhatsApp Inbound Automation Delta

## Modified Requirements

### Requirement: Eve escalation persistence
When the Eve WhatsApp agent escalates a conversation to a human, it MUST persist an open escalation in the existing `whatsapp_escalations` queue using the trusted WhatsApp contact phone.

#### Scenario: Eve creates escalation from trusted WhatsApp contact
- GIVEN Eve is handling a WhatsApp message with trusted sender phone `P`
- WHEN the agent escalates the conversation to a human
- THEN the system MUST create or reuse the WhatsApp contact for `P`
- AND it MUST create an open `whatsapp_escalations` row linked to the contact and conversation
- AND it MUST mark the conversation as `escalated`

#### Scenario: Eve refuses escalation persistence without trusted contact
- GIVEN Eve does not have trusted WhatsApp sender phone context
- WHEN the agent attempts to create a human escalation
- THEN the tool MUST return a safe failure
- AND it MUST NOT create a `whatsapp_escalations` row

#### Scenario: Patient response follows persisted escalation
- GIVEN the escalation was created successfully
- WHEN Eve responds to the patient
- THEN it MAY say a person from the clinic will follow up
