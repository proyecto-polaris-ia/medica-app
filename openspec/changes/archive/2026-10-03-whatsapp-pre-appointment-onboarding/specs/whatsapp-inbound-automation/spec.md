# Delta for WhatsApp Inbound Automation

## MODIFIED Requirements

### Requirement: Flow Engine integration
The system MUST support deterministic flow execution for multi-step conversations
when the Flow Engine is enabled via feature flag, including starting and
continuing the pre-appointment onboarding flow inside the flow-engine path.

(Previously: The Flow Engine integration handled only the booking intent, with no
onboarding flow started or continued in the flow-engine path.)

#### Scenario: Flow Engine starts onboarding
- GIVEN `WHATSAPP_FLOW_ENGINE_ENABLED=true`
- AND the onboarding feature flag enabled
- AND a patient that satisfies the onboarding trigger
- WHEN the orchestrator processes the message
- THEN the Flow Engine MUST start the onboarding flow
- AND the flow state MUST be persisted in `whatsapp_conversations.flow_state`

#### Scenario: Flow Engine continues onboarding
- GIVEN a conversation with a persisted onboarding flow state within the timeout
- WHEN a new inbound message arrives
- THEN the system MUST continue the onboarding from the previous state
- AND previously collected values MUST remain available

#### Scenario: Legacy path when Flow Engine disabled
- GIVEN `WHATSAPP_FLOW_ENGINE_ENABLED=false` or not set
- WHEN a message is processed
- THEN the legacy LLM-based path MUST be used
- AND backward compatibility MUST be maintained

### Requirement: Eve escalation persistence
When the Eve WhatsApp agent escalates a conversation to a human, it MUST persist an open escalation in the existing `whatsapp_escalations` queue using the trusted WhatsApp contact phone, and it MUST clear any in-progress flow state so the onboarding is paused.

(Previously: Escalation persisted the escalation record and marked the conversation as escalated, without clearing any in-progress flow state.)

#### Scenario: Eve creates escalation from trusted WhatsApp contact
- GIVEN Eve is handling a WhatsApp message with trusted sender phone `P`
- WHEN the agent escalates the conversation to a human
- THEN the system MUST create or reuse the WhatsApp contact for `P`
- AND it MUST create an open `whatsapp_escalations` row linked to the contact and conversation
- AND it MUST mark the conversation as `escalated`

#### Scenario: Escalation clears the onboarding flow state
- GIVEN a conversation with an in-progress onboarding flow state
- WHEN the conversation is escalated to a human
- THEN the system MUST clear the flow state
- AND the onboarding MUST NOT continue until a new session is started

#### Scenario: No history written after escalation
- GIVEN a conversation escalated during onboarding
- WHEN the system processes subsequent messages
- THEN the system MUST NOT write clinical history for that onboarding
- AND the flow state MUST remain cleared

#### Scenario: Eve refuses escalation persistence without trusted contact
- GIVEN Eve does not have trusted WhatsApp sender phone context
- WHEN the agent attempts to create a human escalation
- THEN the tool MUST return a safe failure
- AND it MUST NOT create a `whatsapp_escalations` row

#### Scenario: Patient response follows persisted escalation
- GIVEN the escalation was created successfully
- WHEN Eve responds to the patient
- THEN it MAY say a person from the clinic will follow up
