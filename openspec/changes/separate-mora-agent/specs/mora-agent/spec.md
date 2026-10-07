# Delta for mora-agent

## ADDED Requirements

### Requirement: Separated Collections Agent Surface

The collections capability MUST run as a separate agent surface from the reception agent (Eva): it MUST have its own instructions, its own collections tools, and its own collections skill. The reception agent MUST delegate collections conversations to the collections agent and MUST NOT answer balance or arrears questions with its own tools or its own amounts. The collections agent MUST NOT include appointment booking, rescheduling, or availability tools.

#### Scenario: Balance question is delegated to the collections agent
- GIVEN an inbound WhatsApp message from a verified patient asking how much they owe
- WHEN the message is processed by the reception agent
- THEN the reception agent delegates the conversation to the collections agent
- AND the patient-facing reply is composed by the collections agent

#### Scenario: Reception agent does not answer amounts directly
- GIVEN any patient conversation that involves an outstanding balance
- WHEN the reception agent handles the conversation
- THEN the reception agent does not state or compute any amount
- AND any amount shown to the patient originates from the collections agent's DB-derived tool output

#### Scenario: Collections agent has no booking capability
- GIVEN the compiled surface of the collections agent
- WHEN its available tools are inspected
- THEN no appointment booking, rescheduling, or availability tool is present
- AND only collections tools (balance, overdue listing, payment intent) are exposed

#### Scenario: Delegation is observable
- GIVEN a delegation from the reception agent to the collections agent
- WHEN the run is inspected in observability
- THEN the delegation start and completion are visible as distinct agent events

#### Scenario: Booking request is not delegated to collections
- GIVEN an inbound WhatsApp message asking to book or reschedule an appointment
- WHEN the message is processed by the reception agent
- THEN the appointment behavior answers it
- AND no collections delegation occurs

### Requirement: Channel-Bound Identity for Delegated Collections

The collections agent's identity resolution MUST derive the patient phone from the WhatsApp channel binding established at delegation time by the backend, and MUST NOT accept any patient phone supplied in chat text or in model-generated content for the purpose of disclosing balances. If no backend-bound identity exists for the delegated conversation, the collections agent MUST refuse balance disclosure with the security message.

#### Scenario: Delegated conversation resolves the caller's identity
- GIVEN a verified patient delegates through the reception agent to the collections agent
- WHEN the collections tools execute
- THEN the patient identity is resolved from the backend binding created at delegation time
- AND the balance tools return the linked patient's DB-derived balance

#### Scenario: Patient-supplied phone in chat is never used for balances
- GIVEN a patient types a phone number in chat that is not the channel-verified phone
- WHEN any balance or overdue question is handled
- THEN the tools do not resolve a patient from that chat-supplied number
- AND no balance for another patient is disclosed

#### Scenario: Missing backend binding refuses disclosure
- GIVEN a delegated collections conversation without a backend identity binding
- WHEN the collections tools execute
- THEN the tools return the security refusal
- AND no balance information is disclosed

## MODIFIED Requirements

### Requirement: Collections Intent Routing

Inbound WhatsApp messages about payments, balances, or arrears MUST be handled with collections behavior (Mora), reached by delegation from the reception agent (Eva), while agenda and FAQ messages MUST continue to be handled with the existing appointment and FAQ behavior. A message about an outstanding balance or a desire to pay MUST NOT be answered as if it were an agenda or FAQ request, and MUST NOT be answered by the reception agent's own tools.

#### Scenario: Balance request uses collections behavior
- GIVEN an inbound WhatsApp message asking how much is owed or about arrears
- WHEN the message is processed
- THEN the reception agent delegates to the collections behavior and balance tools
- AND it is not treated as an agenda or FAQ request

#### Scenario: Agenda request remains with appointment behavior
- GIVEN an inbound WhatsApp message asking to book or reschedule an appointment
- WHEN the message is processed
- THEN it is handled with the existing appointment behavior
- AND no balance or payment behavior is triggered

#### Scenario: FAQ request remains with knowledge answers
- GIVEN an inbound WhatsApp message asking a general clinic service question
- WHEN the message is processed
- THEN it is answered from approved knowledge
- AND no balance or payment behavior is triggered

### Requirement: Verified Contact Before Balance Disclosure

Mora MUST verify the WhatsApp sender identity (trusted/linked patient contact) before revealing any balance. The verified identity MUST be the channel-derived trusted contact established for the conversation (directly on the root session, or through the backend binding created at delegation time). A sender whose phone is not linked to a patient MUST NOT receive any balance information.

#### Scenario: Unverified sender receives no balance
- GIVEN a WhatsApp sender whose phone is not linked to any patient
- WHEN the sender asks for a balance
- THEN Mora does not reveal any balance
- AND Mora does not reveal any patient's financial data

#### Scenario: Verified sender receives only their own balance
- GIVEN a WhatsApp sender whose phone is linked to a patient
- WHEN the sender asks for that patient's balance
- THEN Mora reveals only the linked patient's DB-derived balance
- AND no other patient's balance is revealed
