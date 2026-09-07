# eve-skills Specification

**Baseline**: new-capability

## Purpose

Add procedural, on-demand guidance to the Eve agent in the form of three markdown skills (`booking-flow`, `clinical-escalation`, `knowledge-answers`) plus the instruction references that define when each loads. Skills give the model structure without moving any decision into code: the LLM still interprets language and redacts; the deterministic backend tools still validate and execute all actions.

## Requirements

### Requirement: Booking flow skill exists and is complete

`agent/skills/booking-flow.md` MUST exist, be written in Spanish de México (neutral/profesional), and describe a step-by-step booking procedure in order: confirm intent, collect required data, query availability with `check-availability`, present available slots, confirm then book with `book-appointment`, and handle unavailability/conflicts with `check-availability` or `get-next-available`.

#### Scenario: Booking steps are ordered
- GIVEN `agent/skills/booking-flow.md` is read
- WHEN its step procedure is inspected
- THEN the order orders intent confirmation, data collection, availability query, slot presentation, confirm-and-book, and conflict handling

#### Scenario: Booking never invents availability
- GIVEN the booking skill content
- WHEN searched for guidance on availability
- THEN it instructs the agent to always query `check-availability` or `get-next-available` and never invent horarios

#### Scenario: Booking specifies tool usage
- GIVEN the booking skill content
- WHEN the tool references are inspected
- THEN it names `check-availability`, `book-appointment`, and `get-next-available`

### Requirement: Clinical escalation skill exists and is complete

`agent/skills/clinical-escalation.md` MUST exist, be written in Spanish de México, enumerate immediate-escalation triggers (strong pain, significant swelling, unstoppable bleeding, visible infection, dental trauma, medication allergy, adverse reaction, systemic conditions, medication/prescription requests, and diagnosis requests), and provide an escalation reply template plus "how to escalate" steps that forbid clinical advice.

#### Scenario: Urgent symptoms trigger escalation
- GIVEN the escalation skill content
- WHEN searched for urgent symptoms
- THEN it lists strong pain, swelling, bleeding, infection, and trauma as immediate-escalation triggers

#### Scenario: Inappropriate requests trigger escalation
- GIVEN the escalation skill content
- WHEN searched for request handling
- THEN it lists medication requests, diagnosis requests, and prescription requests as immediate-escalation triggers

#### Scenario: Escalation forbids clinical advice
- GIVEN the escalation skill content
- WHEN the "how to escalate" steps are inspected
- THEN it instructs the agent not to suggest medications, diagnose, or give clinical instructions

#### Scenario: Escalation provides a reply template
- GIVEN the escalation skill content
- WHEN inspected
- THEN it includes a reusable escalation message template

### Requirement: Knowledge answers skill exists and is complete

`agent/skills/knowledge-answers.md` MUST exist, be written in Spanish de México, describe when to use `search-knowledge`, when not to (booking → booking flow; symptoms → escalate; exact pricing; out-of-base), and instruct the agent to answer only from returned knowledge and admit when nothing is found instead of inventing.

#### Scenario: Knowledge skill scopes tool usage
- GIVEN the knowledge skill content
- WHEN inspected
- THEN it instructs using `search-knowledge` for general questions (horarios, ubicación, servicios generales, formas de pago, first-visit requirements)

#### Scenario: Knowledge skill routes away from clinical and booking cases
- GIVEN the knowledge skill content
- WHEN inspected
- THEN it routes booking requests to the booking flow and symptom/clinical mentions to escalation

#### Scenario: Knowledge skill forbids invention
- GIVEN the knowledge skill content
- WHEN searched for no-result guidance
- THEN it instructs the agent to admit it lacks the information and offer escalation rather than fabricate an answer

### Requirement: Instructions reference the skills

`agent/instructions.md` MUST reference the three skills by filename and state, for each, the trigger that loads it: booking intent → `booking-flow.md`; symptoms/pain/medication/clinical concerns → `clinical-escalation.md`; general/service/location/hours questions → `knowledge-answers.md`. The existing five clinical guardrails MUST be preserved verbatim in substance.

#### Scenario: Instructions name each skill with a trigger
- GIVEN `agent/instructions.md` is read
- WHEN the skills section is inspected
- THEN it names `booking-flow.md`, `clinical-escalation.md`, and `knowledge-answers.md` together with their respective triggers

#### Scenario: Guardrails are preserved
- GIVEN `agent/instructions.md` after the edit
- WHEN searched for the guardrail concepts
- THEN all existing guardrails (no diagnostic, no recetar, no inventar horarios, no precios definitivos, escalar a humano) remain present

### Requirement: Skills are load-safe and testable

The three skill files MUST be plain markdown with no code execution, and a credential-free test MUST assert that all three files exist and contain their defining markers (e.g. a Spanish title and the expected tool name or escalation keyword). The test MUST run with no API keys and no running server.

#### Scenario: Skills exist with expected markers
- GIVEN no environment variables and no server
- WHEN `npm run test` executes the skill test
- THEN the test passes by reading the three files from disk

#### Scenario: Missing skill fails the test
- GIVEN one skill file is deleted
- WHEN the skill test runs
- THEN the test fails with a clear assertion naming the missing file

## Non-functional / guardrails

- Skills are guidance, not enforcement; the model MAY deviate, but every deterministic action (availability, booking) remains a tool call.
- The LLM never decides availability, never writes to the database directly, and never sends WhatsApp messages itself.
