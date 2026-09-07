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

The Eve agent MUST expose a `book-appointment` tool that resolves service, provider, and patient data, validates the requested interval, and writes appointments only through the existing atomic booking service.

#### Scenario: Confirmed booking is persisted
- GIVEN a valid future slot, patient, service, and provider
- WHEN the agent calls `book-appointment`
- THEN the tool persists the appointment through existing booking logic and returns structured confirmation data

#### Scenario: Booking conflict is surfaced
- GIVEN the requested provider interval is already occupied
- WHEN the booking service reports a conflict
- THEN `book-appointment` returns `success: false` and `conflict: true`

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
