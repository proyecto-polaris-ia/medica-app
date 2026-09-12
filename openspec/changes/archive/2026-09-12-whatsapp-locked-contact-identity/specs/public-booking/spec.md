## MODIFIED Requirements

### Requirement: Public booking endpoint patient contact

The public booking endpoint MUST continue to accept patient contact data collected by the web booking form, including phone and optional email. Unlike WhatsApp-origin booking, public web booking has no trusted channel phone and MUST use the submitted validated contact fields.

#### Scenario: Web booking uses submitted contact fields
- GIVEN a public web booking request includes phone `P` and email `E`
- WHEN the booking endpoint resolves the patient
- THEN it MUST pass both `P` and `E` to patient resolution
