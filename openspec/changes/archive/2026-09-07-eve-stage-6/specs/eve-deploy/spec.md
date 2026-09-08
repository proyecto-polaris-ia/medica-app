# eve-deploy Specification

**Baseline**: new-capability

## Purpose

Introduce a runtime feature flag that routes inbound WhatsApp messages between the Eve agent and the legacy agent, with fallback and observability, and document the operational procedure. Signature verification and verification-handshake behavior are identical on both paths.

## Requirements

### Requirement: Feature flag routes between Eve and legacy

The WhatsApp webhook route MUST route to the Eve agent when `WHATSAPP_EVE_ENABLED` is a truthy flag value (`true`, `1`, or `yes`, case-insensitive), and to the legacy agent otherwise.

#### Scenario: flag enabled routes to Eve
- GIVEN `WHATSAPP_EVE_ENABLED=true`
- WHEN a verified message POST arrives
- THEN the route forwards the message to the Eve endpoint

#### Scenario: flag absent or false routes to legacy
- GIVEN `WHATSAPP_EVE_ENABLED` unset or `"false"`
- WHEN a verified message POST arrives
- THEN the route processes the message through the legacy path

#### Scenario: alternative truthy values are accepted
- GIVEN `WHATSAPP_EVE_ENABLED=1` or `"yes"`
- WHEN the flag is read
- THEN it is treated as enabled, matching the existing `WHATSAPP_FLOW_ENGINE_ENABLED` convention

### Requirement: Signature verification is unchanged and shared

The route MUST verify the `x-hub-signature-256` signature before routing to either agent, and the GET verification handshake MUST remain unchanged.

#### Scenario: invalid signature is rejected before routing
- GIVEN a message POST with an invalid or missing signature
- WHEN the route receives it
- THEN no agent (Eve or legacy) is invoked and an error status is returned

#### Scenario: verification handshake unchanged
- GIVEN a GET with `hub.mode=subscribe` and the correct verify token
- WHEN the route receives it
- THEN it returns the challenge as `text/plain` with status 200

### Requirement: Eve forwarding forwards the raw verified request

When routing to Eve, the route MUST forward the request body and the `x-hub-signature-256` header to the Eve WhatsApp endpoint (`/eve/v1/whatsapp`) and relay the response status and body.

#### Scenario: Eve forward relays response
- GIVEN a flagged message routed to Eve
- WHEN the Eve endpoint responds
- THEN the route returns the Eve response body and status to the caller

### Requirement: Legacy fallback on Eve failure

If the Eve forward throws (e.g. forward fetch error), the route MUST fall back to the legacy processing path so no inbound message is dropped.

#### Scenario: Eve forward failure falls back to legacy
- GIVEN the Eve forward request throws
- WHEN a flagged message is routed
- THEN the route processes the message through the legacy path

### Requirement: Structured request logging

The route MUST emit a structured log record naming the active agent (`eve` or `legacy`) and the message identifier for each POST, to support Vercel log filtering and monitoring.

#### Scenario: log records the selected agent
- GIVEN a message POST is handled
- WHEN the active agent is selected
- THEN a log record includes the agent name and (when available) the inbound message id

### Requirement: Flag is documented

`.env.local.example` MUST document `WHATSAPP_EVE_ENABLED` with a descriptive comment indicating it switches between the Eve and legacy agents.

#### Scenario: flag appears in env example
- GIVEN `.env.local.example`
- WHEN inspected
- THEN `WHATSAPP_EVE_ENABLED` is present with a comment

### Requirement: Runbook documents monitoring and rollback

`docs/eve-runbook.md` MUST document the feature-flag toggles for enabling/disabling Eve, the rollback procedure, the key monitoring surfaces (Agent Runs and Vercel logs), error-rate and response-time targets, and a list of common issues with resolutions.

#### Scenario: runbook covers rollback and monitoring
- GIVEN `docs/eve-runbook.md`
- WHEN inspected
- THEN it includes enable/disable commands, a rollback procedure referencing `WHATSAPP_EVE_ENABLED`, monitoring guidance, and common-issue resolutions

### Requirement: Type safety and test suite

The project MUST pass `npx tsc --noEmit` and `npm run test` with the routing change applied.

#### Scenario: typecheck and tests pass
- GIVEN Stage 6 applied
- WHEN `npx tsc --noEmit` and `npm run test` run
- THEN both exit 0
