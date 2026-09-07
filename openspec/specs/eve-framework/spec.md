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
