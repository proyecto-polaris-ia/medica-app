# Delta for Eve Framework

## ADDED Requirements

### Requirement: Patient Appointment Lookup Tool

The Eve agent MUST expose a read-only `list-my-appointments` tool that lets a WhatsApp patient ask for their own upcoming appointments. The tool MUST derive patient identity only from trusted WhatsApp session auth/context and MUST NOT accept arbitrary phone input from the model or conversation.

#### Scenario: Trusted WhatsApp patient lists appointments
- GIVEN the Eve turn has trusted WhatsApp phone `P`
- AND patient `P` has upcoming active appointments
- WHEN the agent calls `list-my-appointments`
- THEN the tool MUST return only appointments linked to patient `P`
- AND it MUST include appointment id, service, provider, date/time, and status

#### Scenario: Missing trusted WhatsApp identity is refused
- GIVEN the Eve turn has no trusted WhatsApp phone
- WHEN the agent calls `list-my-appointments`
- THEN the tool MUST return `success: false`
- AND the error MUST say appointment lookup cannot proceed without a WhatsApp linked to the patient

#### Scenario: Tool schema does not accept patient phone
- GIVEN the tool schema is inspected
- WHEN its input fields are listed
- THEN it MUST NOT include `patientPhone`, `phone`, or any arbitrary patient lookup field

### Requirement: Patient Appointment Lookup Instructions

`agent/instructions.md` MUST tell Eva to use `list-my-appointments` when patients ask what appointments they have, and to preserve the security refusal when no trusted WhatsApp identity exists.

#### Scenario: Lookup guidance is present
- GIVEN `agent/instructions.md` is read
- WHEN the tool guidance section is inspected
- THEN it MUST mention `list-my-appointments`
- AND it MUST state that appointment lookup requires trusted WhatsApp identity
