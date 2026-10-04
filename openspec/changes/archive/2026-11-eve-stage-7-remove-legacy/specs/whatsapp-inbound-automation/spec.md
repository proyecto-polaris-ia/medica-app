# Delta for WhatsApp Inbound Automation

> Scope note: the `appointment-reminders` and `send-onboarding-nudge` crons and
> the `appointment-reminder-reply` and `whatsapp-onboarding` specs remain active
> and are out of scope for this change. Only the legacy inbound pipeline
> (orchestrator + inbound-service) is removed.

## REMOVED Requirements

### Requirement: Side-effect-free agent decisioning

(Reason: it described the legacy `whatsapp-inbound-agent.ts` decisioning module,
which is deleted.)
(Migration: inbound decisioning and drafting are now owned by the Eve agent and
its tools/instructions.)

### Requirement: Name-to-ID resolution for booking

(Reason: it described natural-language name resolution inside the legacy booking
tool action.)
(Migration: Eve tools resolve names through the existing catalog functions.)

### Requirement: Booking catalog injection

(Reason: it injected the catalog into the legacy agent prompt; the legacy agent
is deleted.)
(Migration: the Eve `list-catalog` tool exposes the same catalog to the agent.)

### Requirement: Validated conservative model output

(Reason: it validated structured output from the legacy LLM provider, which is
deleted.)
(Migration: response validation is owned by the Eve runtime and its tools.)

### Requirement: Inbound orchestration side effects

(Reason: it described the deleted `orchestrator.ts` processing each message into
a response, booking tool call, or escalation.)
(Migration: Eve Workflows orchestrate the conversation; escalation side effects
remain in `eve-escalation.ts`.)

### Requirement: Flow Engine integration

(Reason: it referenced `WHATSAPP_FLOW_ENGINE_ENABLED` and orchestrator-driven
flow execution for WhatsApp, both deleted.)
(Migration: Eve owns WhatsApp conversation state; the Flow Engine remains the
runtime for web chat.)

### Requirement: Orchestration idempotency

(Reason: it required the deleted orchestrator not to duplicate outbound sends for
an already-persisted message.)
(Migration: message-ledger idempotency is retained by `Idempotent message ledger`
and `Inbound webhook persistence`; the Eve path persists through the same store.)

### Requirement: Respuestas a recordatorio antes de la clasificación general

(Reason: it specified reminder-reply recognition inside the legacy inbound
pipeline and its legacy path, both deleted.)
(Migration: the reminder crons and the reminder-reply service remain; the
remaining behavior is specified by `appointment-reminder-reply`.)

---

## ADDED Requirements

### Requirement: Legacy Pipeline Removal Boundary

The system MUST NOT expose a legacy WhatsApp processing path. After signature
verification, the Meta webhook MUST forward every inbound message to the Eve
agent; `src/lib/whatsapp/orchestrator.ts`, `inbound-service.ts`, `escalation.ts`,
`onboarding-context.ts`, `eve-flag.ts`, and `src/lib/ai/whatsapp-inbound-agent.ts`
MUST NOT exist, while the shared `store.ts`, `client.ts`, `normalize.ts`,
`signature.ts`, and `eve-escalation.ts` MUST remain.

#### Scenario: no legacy path remains
- GIVEN the Stage 7 tree
- WHEN `app/api/whatsapp/webhook/route.ts` is inspected
- THEN it forwards to `/eve/v1/whatsapp` and imports no legacy orchestrator or
  inbound-service module
- AND the deleted modules are absent
- AND `eve-escalation.ts` and the shared store, client, normalize, and signature
  modules are present

#### Scenario: shared store keeps provider-message idempotency
- GIVEN an Eve escalation synthetic message already persisted for its provider
  message id
- WHEN the same message is processed again
- THEN no duplicate message row MUST be created
- AND the existing escalation MUST be reused
