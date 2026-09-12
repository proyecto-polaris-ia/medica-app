# Eve Framework Specification

**Baseline**: new-capability

## Purpose

Introduce the Vercel Eve framework as the foundation for the staged migration of the WhatsApp inbound agent. Stage 1 establishes a minimal, additive agent scaffold — runtime config, system prompt with clinical guardrails, Next.js integration via `withEve`, and a credential-free smoke test — without touching the running legacy agent.

## Requirements

### Requirement: Eve Dependency Installation

The project MUST declare `eve` (v0.52.x) as a runtime dependency, installable via `npm install`.

#### Scenario: Fresh install succeeds
- GIVEN a clean `node_modules`
- WHEN `npm install` runs
- THEN `eve` resolves to 0.52.x and install exits 0

### Requirement: Agent Runtime Configuration

`agent/agent.ts` MUST export an agent config via `defineAgent` with `model` set to a valid AI Gateway identifier (e.g. `"openai/gpt-4o"`) and `limits.sessionTimeoutMs` set to exactly `1800000` (30 minutes).

#### Scenario: Valid model and timeout
- GIVEN `agent/agent.ts` imported
- WHEN the default export is inspected
- THEN `model` is a non-empty string matching `<provider>/<model-id>` AND `limits.sessionTimeoutMs` equals `1800000`

### Requirement: Agent System Prompt with Clinical Guardrails

`agent/instructions.md` MUST exist, be written in Spanish, and explicitly state ALL five clinical guardrails: (1) no diagnosing, (2) no prescribing medications, (3) no inventing availability, (4) no definitive prices via WhatsApp, (5) escalate to human on strong pain, urgency, infection, allergy, medication/prescription request, or ambiguous intent.

#### Scenario: All guardrails present
- GIVEN `agent/instructions.md` content
- WHEN searched for each guardrail concept
- THEN all five are explicitly stated

#### Scenario: Escalation triggers enumerated
- GIVEN the escalation section
- WHEN inspected
- THEN it lists: strong pain, urgency, infection, allergy, medication/prescription request, ambiguous intent

### Requirement: Next.js Eve Integration

`next.config.mjs` MUST wrap the config with `withEve` from `eve/next`, mounting Eve routes under `/eve/v1/`. Existing Next.js config MUST remain functional.

#### Scenario: withEve wrapper applied
- GIVEN `next.config.mjs` read
- WHEN inspected
- THEN it imports `withEve` from `eve/next` and wraps the exported config

#### Scenario: Eve health endpoint reachable
- GIVEN the dev server running
- WHEN `GET /eve/v1/health` is called
- THEN response is 200 OK

### Requirement: Environment Variable Documentation

`.env.local.example` MUST document `AI_GATEWAY_API_KEY` with a descriptive comment. All existing Supabase and WhatsApp variables MUST remain.

#### Scenario: New var documented, existing preserved
- GIVEN `.env.local.example` read
- WHEN inspected
- THEN `AI_GATEWAY_API_KEY` is present with comment AND all pre-existing variables remain

### Requirement: Credential-Free Smoke Test

A test file MUST assert: (a) agent config exports valid model, (b) `sessionTimeoutMs` equals `1800000`, (c) `instructions.md` contains all five guardrails. The test MUST pass with no API keys and no running server.

#### Scenario: Passes without credentials
- GIVEN no env vars set
- WHEN `npm run test` executes the smoke test
- THEN test passes (exit 0)

#### Scenario: Detects missing guardrail
- GIVEN `instructions.md` modified to remove one guardrail
- WHEN smoke test runs
- THEN test fails with clear assertion error

### Requirement: Non-Interference with Legacy Agent

Stage 1 MUST NOT modify `src/lib/whatsapp/`, `src/lib/flows/`, `src/lib/ai/`, or `app/api/whatsapp/`.

#### Scenario: Legacy directories untouched
- GIVEN the git diff for Stage 1
- WHEN inspected
- THEN no files in those directories are modified

### Requirement: Build and Type Safety

The project MUST pass `npx tsc --noEmit` and `npm run test` with no errors.

#### Scenario: TypeScript and tests pass
- GIVEN Stage 1 applied
- WHEN `npx tsc --noEmit` and `npm run test` run
- THEN both exit 0

### Requirement: Read-Only Catalog Tool

The Eve agent MUST expose a `list-catalog` tool that returns clinic services and providers from existing catalog functions without modifying database state.

#### Scenario: Catalog is returned as structured data
- GIVEN services and providers exist in the database
- WHEN the agent calls `list-catalog`
- THEN the tool returns `services` with `id`, `name`, and human-readable `duration`
- AND it returns `providers` with `id` and `name`

#### Scenario: Catalog read fails gracefully
- GIVEN the catalog data source throws an error
- WHEN the agent calls `list-catalog`
- THEN the tool returns `success: false` with an actionable error message

### Requirement: Read-Only Availability Tool

The Eve agent MUST expose a `check-availability` tool that accepts `serviceName`, `providerName`, and `date` (`YYYY-MM-DD`) and returns up to five available slots computed by existing availability logic.

#### Scenario: Available slots are returned
- GIVEN a matching service, matching provider, and free slots for the requested date
- WHEN the agent calls `check-availability`
- THEN the tool resolves the service and provider using existing catalog functions
- AND returns `success: true`, `available: true`, the resolved service/provider names, the date, and local time slot strings

#### Scenario: Missing service or provider is handled
- GIVEN the requested service or provider cannot be resolved
- WHEN the agent calls `check-availability`
- THEN the tool returns `success: false`, `available: false`, and an error describing the missing entity

#### Scenario: Invalid date is rejected
- GIVEN a date that is not in `YYYY-MM-DD` format or is not a valid calendar date
- WHEN the agent calls `check-availability`
- THEN the tool returns `success: false`, `available: false`, and a format hint

#### Scenario: No availability is handled
- GIVEN the service and provider resolve but no slots exist
- WHEN the agent calls `check-availability`
- THEN the tool returns `success: true`, `available: false`, and a message suggesting another date

### Requirement: Read-Only Knowledge Search Tool

The Eve agent MUST expose a `search-knowledge` tool that searches only approved `whatsapp_knowledge_entries` and returns up to three relevant entries.

#### Scenario: Approved knowledge matches are returned
- GIVEN approved knowledge entries match the query by topic, question, answer, or tags
- WHEN the agent calls `search-knowledge`
- THEN the tool returns `success: true`, `found: true`, and up to three entries with `topic`, `question`, and `answer`

#### Scenario: Draft and archived entries are not exposed
- GIVEN matching entries exist with statuses other than `approved`
- WHEN the agent calls `search-knowledge`
- THEN those entries are excluded from the result

#### Scenario: No knowledge match is handled
- GIVEN no approved entries match the query
- WHEN the agent calls `search-knowledge`
- THEN the tool returns `success: true`, `found: false`, and a helpful message

### Requirement: Tool Instructions

`agent/instructions.md` MUST mention the available read-only tools and MUST tell the agent to consult them instead of inventing catalog, availability, or knowledge answers.

#### Scenario: Agent instructions include tool guidance
- GIVEN `agent/instructions.md` is read
- WHEN the tool guidance section is inspected
- THEN it names `list-catalog`, `check-availability`, and `search-knowledge`
- AND it preserves the existing clinical guardrails

### Requirement: Write Patient Resolution Tool

The Eve agent MUST expose a `resolve-patient` tool that resolves existing patients or creates new patients through existing deterministic booking services. The tool MUST return structured success or error data and MUST reject identity conflicts.

#### Scenario: Patient is resolved or created
- GIVEN valid patient contact details
- WHEN the agent calls `resolve-patient`
- THEN the tool returns patient identity data with `success: true` or a structured error for conflicts/validation failures

### Requirement: Write Appointment Booking Tool
The Eve agent MUST expose a `book-appointment` tool that resolves service, provider, and patient data, validates the requested interval, and writes appointments only through the existing atomic booking service. The tool MUST accept optional patient email. When the turn originates from WhatsApp, it MUST use the trusted WhatsApp sender phone for patient resolution and MUST ignore any different phone requested in the conversation.

#### Scenario: Confirmed booking is persisted
- GIVEN a valid future slot, patient, service, and provider
- WHEN the agent calls `book-appointment`
- THEN the tool persists the appointment through existing booking logic and returns structured confirmation data

#### Scenario: Booking conflict is surfaced
- GIVEN the requested provider interval is already occupied
- WHEN the booking service reports a conflict
- THEN `book-appointment` returns `success: false` and `conflict: true`

#### Scenario: WhatsApp phone is locked for booking
- GIVEN a WhatsApp sender phone `P`
- AND the user says to use another phone `Q`
- WHEN Eve books the appointment
- THEN patient resolution MUST use phone `P`
- AND MUST NOT use phone `Q`

#### Scenario: Booking forwards optional email
- GIVEN a booking request includes email `E`
- WHEN Eve calls `book-appointment`
- THEN patient resolution MUST receive email `E` with the selected phone/contact identity

### Requirement: Eve Reschedule Appointment Tool
The Eve agent MUST expose a `reschedule-appointment` tool for patient requests to move or reprogram an existing appointment. The tool MUST update an existing appointment row instead of inserting a new appointment row. The tool MUST accept optional patient email. When the turn originates from WhatsApp, it MUST use the trusted WhatsApp sender phone for patient resolution and MUST ignore any different phone requested in the conversation.

#### Scenario: Existing appointment is updated instead of duplicated
- GIVEN a patient has an existing appointment
- WHEN the patient asks to move the appointment and confirms a new available slot
- THEN Eve MUST call `reschedule-appointment`
- AND the tool MUST update the original appointment row instead of creating a second appointment

#### Scenario: WhatsApp phone is locked for reschedule
- GIVEN a WhatsApp sender phone `P`
- AND the user asks to reprogram using another phone `Q`
- WHEN Eve calls `reschedule-appointment`
- THEN patient resolution MUST use phone `P`
- AND MUST NOT use phone `Q`

### Requirement: Next Available Tool

The Eve agent MUST expose a `get-next-available` tool that resolves service and provider names and returns the next real available slot from existing availability logic.

#### Scenario: Next slot is returned or unavailable is explicit
- GIVEN a valid service, provider, and start date
- WHEN the agent calls `get-next-available`
- THEN the tool returns either a real ISO/formatted slot or an explicit unavailable result that tells the agent not to invent horarios

### Requirement: Bounded Write Tool Instructions

`agent/instructions.md` MUST tell the agent to use write tools only after collecting and confirming required booking data, and MUST state that appointment confirmation is only allowed after `book-appointment` returns `success: true`.

#### Scenario: Write guidance preserves guardrails
- GIVEN the agent instructions are read
- WHEN the tool guidance section is inspected
- THEN it names `resolve-patient`, `book-appointment`, and `get-next-available` while preserving the clinical guardrails

### Requirement: Booking Flow Skill

The Eve agent MUST provide `agent/skills/booking-flow.md`, written in Spanish de México, describing an ordered booking procedure that queries availability with `check-availability`, presents real slots, books only after confirmation via `book-appointment`, and recovers from conflicts with `get-next-available`, while never inventing horarios.

#### Scenario: Booking skill orders the flow and is bounded by tools
- GIVEN `agent/skills/booking-flow.md` is read
- WHEN its procedure is inspected
- THEN it orders intent, data collection, availability, presentation, confirm-and-book, and conflict handling
- AND it names `check-availability`, `book-appointment`, and `get-next-available`
- AND it instructs never inventing availability

### Requirement: Clinical Escalation Skill

The Eve agent MUST provide `agent/skills/clinical-escalation.md`, written in Spanish de México, enumerating immediate-escalation triggers (strong pain, swelling, unstoppable bleeding, infection, trauma, allergy, adverse reaction, systemic conditions, and medication/prescription/diagnosis requests) and providing an escalation procedure and reply template that forbids clinical advice.

#### Scenario: Escalation skill triggers, template, and no-advice rule present
- GIVEN `agent/skills/clinical-escalation.md` is read
- WHEN its content is inspected
- THEN it lists the urgent-symptom and inappropriate-request triggers
- AND it includes a reusable escalation reply template
- AND it instructs the agent not to diagnose, prescribe, or give clinical instructions

### Requirement: Knowledge Answers Skill

The Eve agent MUST provide `agent/skills/knowledge-answers.md`, written in Spanish de México, describing when to use `search-knowledge` for general questions, when to route to booking or escalation instead, and instructing the agent to answer only from returned knowledge and admit when nothing is found.

#### Scenario: Knowledge skill scopes usage and forbids invention
- GIVEN `agent/skills/knowledge-answers.md` is read
- WHEN its content is inspected
- THEN it instructs using `search-knowledge` for general questions
- AND it routes booking requests to the booking flow and symptoms to escalation
- AND it instructs not inventing answers and offering escalation when nothing is found

### Requirement: Skill References in Instructions

`agent/instructions.md` MUST reference the three skills by filename together with their load triggers (booking intent → `booking-flow.md`; symptoms/pain/medication → `clinical-escalation.md`; general/service questions → `knowledge-answers.md`) while preserving the five clinical guardrails.

#### Scenario: Instructions name each skill with a trigger and preserve guardrails
- GIVEN `agent/instructions.md` is read
- WHEN the skills section is inspected
- THEN it names `booking-flow.md`, `clinical-escalation.md`, and `knowledge-answers.md` with their respective triggers
- AND the five clinical guardrails remain present

### Requirement: WhatsApp Channel Bridge
The Eve agent MUST provide `agent/channels/whatsapp.ts` exporting a `chatSdkChannel` bridge built with a WhatsApp adapter (`createWhatsAppAdapter`) and a memory state adapter (`createMemoryState`), with `streaming` disabled and handlers for new mentions and subscribed messages. When forwarding a WhatsApp message to the agent, the channel MUST include trusted sender context derived from the adapter message metadata, including the sender phone/WhatsApp ID and business phone number ID.

#### Scenario: Bridge, adapters, and handlers are present
- GIVEN `agent/channels/whatsapp.ts` is read
- WHEN its source is inspected
- THEN it exports `bot`, `channel`, and `send`
- AND it configures the WhatsApp adapter and memory state with `streaming: false`
- AND it registers `onNewMention` and `onSubscribedMessage` handlers

#### Scenario: WhatsApp sender phone reaches Eve context
- GIVEN Meta sends an inbound WhatsApp message with `from = P`
- WHEN the Eve WhatsApp channel forwards the message to the agent
- THEN the forwarded turn MUST include trusted channel contact phone `P`
- AND the agent MUST NOT rely only on user-written text for patient phone identity

### Requirement: WhatsApp Credentials From Environment

The WhatsApp adapter MUST resolve `accessToken`, `phoneNumberId`, `verifyToken`, and `appSecret` from the `WHATSAPP_*` environment variables without hardcoding credentials in source.

#### Scenario: No plaintext credentials in source
- GIVEN `agent/channels/whatsapp.ts`
- WHEN inspected
- THEN no token or secret literal is present

### Requirement: WhatsApp Channel Graceful Degradation

The WhatsApp channel MUST always construct its adapter (so the webhook route stays registered — eve rejects a channel module that emits no routes), resolving each credential from its `WHATSAPP_*` environment variable with a non-empty placeholder fallback. This keeps `eve build` from crashing in credential-less environments.

#### Scenario: build succeeds without credentials
- GIVEN no `WHATSAPP_*` variables set
- WHEN `agent/channels/whatsapp.ts` is imported during `eve build`
- THEN the module loads without throwing and the WhatsApp webhook route stays registered

#### Scenario: real credentials are used when present
- GIVEN the four `WHATSAPP_*` variables set to non-empty values
- WHEN the channel config is built
- THEN the adapter resolves access token, app secret, phone number id, and verify token from the environment
- AND with partial credentials the adapter is constructed with placeholder values instead of throwing

### Requirement: WhatsApp Channel Non-Interference

Stage 5 MUST NOT modify `app/api/whatsapp/webhook/route.ts` or any file under `src/lib/whatsapp/`.

#### Scenario: Legacy webhook and WhatsApp code untouched
- GIVEN the Stage 5 diff
- WHEN inspected
- THEN no file under `app/api/whatsapp/` or `src/lib/whatsapp/` is modified

### Requirement: Chat SDK Dependency Pinning

The project MUST depend on `@chat-adapter/whatsapp`, `@chat-adapter/state-memory`, and their shared `chat` package, pinned to the `4.34.0` line that Eve 0.52.2 compiles internally.

#### Scenario: Versions match the Eve Chat SDK line
- GIVEN `package.json`
- WHEN inspected
- THEN the `@chat-adapter/*` packages are pinned to `4.34.0`

### Requirement: WhatsApp Agent Routing Feature Flag

`app/api/whatsapp/webhook/route.ts` MUST route verified inbound messages to the Eve agent when `WHATSAPP_EVE_ENABLED` is truthy (`true`, `1`, or `yes`, case-insensitive) and to the legacy agent otherwise, without weakening signature verification.

#### Scenario: flag enables Eve, absence routes legacy
- GIVEN a verified message POST
- WHEN the flag is truthy
- THEN the route forwards to `/eve/v1/whatsapp`
- AND when the flag is unset or `false` the route processes through the legacy path

#### Scenario: invalid signature rejected before routing
- GIVEN a message POST with an invalid signature
- WHEN the route receives it
- THEN neither agent is invoked and an error status is returned

### Requirement: Legacy Fallback on Eve Forward Failure

When routing to Eve, the route MUST fall back to the legacy processing path if the forward request throws, so no inbound message is dropped.

#### Scenario: forward failure falls back to legacy
- GIVEN a flagged message and an Eve forward that throws
- WHEN the route handles the message
- THEN the message is processed through the legacy path

### Requirement: WhatsApp Routing Observability

The route MUST emit a structured log record naming the active agent (`eve` or `legacy`) plus the correlation id and, when available, the inbound message id.

#### Scenario: route decision is logged
- GIVEN a message POST is handled
- WHEN the active agent is selected
- THEN a structured log record includes the agent name and correlation id

### Requirement: Eve Deployment Runbook

`docs/eve-runbook.md` MUST document the feature-flag enable/disable commands, the rollback procedure, monitoring surfaces, and common issues.

#### Scenario: runbook covers rollback and monitoring
- GIVEN `docs/eve-runbook.md`
- WHEN inspected
- THEN it includes enable/disable commands, rollback referencing `WHATSAPP_EVE_ENABLED`, monitoring guidance, and issue resolutions

### Requirement: ### Requirement: Patient Appointment Lookup Tool

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
