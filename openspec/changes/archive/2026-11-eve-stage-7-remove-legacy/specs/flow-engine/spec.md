# Delta for Flow Engine

> Scope note: after Stage 7 the Flow Engine remains the deterministic
> conversation runtime for **web chat** (`app/api/web-chat/message/route.ts` →
> `src/lib/web-chat/web-inbound-service.ts`). The WhatsApp orchestrator that
> previously consumed it is deleted.

## REMOVED Requirements

### Requirement: Feature Flag Control

(Reason: `WHATSAPP_FLOW_ENGINE_ENABLED` is deleted; the engine has no runtime
enable switch and is invoked directly by its callers.)
(Migration: web chat calls the engine unconditionally; no flag read remains.)

### Requirement: Precedencia de la sesión de flujo activa

(Reason: it governed legacy WhatsApp reminder-reply precedence inside the deleted
inbound pipeline.)
(Migration: the remaining reminder-reply behavior is specified by
`appointment-reminder-reply`; the pure session-active helper is relocated to a
live flow module.)

---

## MODIFIED Requirements

### Requirement: Flow State Persistence

The system MUST persist flow state per conversation to enable multi-turn
interactions, using the caller's conversation store.

#### Scenario: State persisted after each message
- GIVEN an active flow in a conversation
- WHEN a message is processed
- THEN the flow state MUST be updated in the caller's conversation store
- AND the state MUST include the current state name
- AND the state MUST include collected entities

#### Scenario: State recovered across messages
- GIVEN a conversation with a persisted flow state
- WHEN a new message arrives
- THEN the system MUST load the previous flow state
- AND the system MUST continue from the previous state
- AND previously collected entities MUST be available

### Requirement: Intent Routing

The system MUST route messages to the appropriate handler based on classified
intent, without requiring a feature flag.

#### Scenario: Intent routes to Flow Engine
- GIVEN a message classified as `book_appointment` or `check_availability`
- WHEN the web chat handler dispatches it
- THEN the message MUST be processed by the Flow Engine
- AND the `book_appointment` flow MUST be selected

#### Scenario: Intent routes to Knowledge Handler
- GIVEN a message classified as `inquiry`
- WHEN the web chat handler dispatches it
- THEN the message MUST be processed by the knowledge handler
- AND the Flow Engine MUST NOT be invoked

#### Scenario: Intent routes to Escalation Handler
- GIVEN a message classified as `support` or `handoff`
- WHEN the web chat handler dispatches it
- THEN the message MUST be handled as a human handoff
- AND no flow state MUST be created

### Requirement: Action Execution

The system MUST execute actions deterministically when a state requires it,
supporting the booking actions (`getFreeSlots`, `bookAppointment`) and the
name-resolution actions (`resolveService`, `resolveProvider`).

#### Scenario: Existing booking actions unchanged
- GIVEN a flow state with `action: 'getFreeSlots'` or `action: 'bookAppointment'`
- WHEN all required entities are present
- THEN the system MUST call the existing booking action with the entities
- AND the existing booking flow behavior MUST remain unchanged

#### Scenario: Name-resolution actions execute
- GIVEN a flow state with `action: 'resolveService'` or `action: 'resolveProvider'`
- WHEN the required name entity is present
- THEN the system MUST resolve the name to its catalog id
- AND the action result MUST determine the next transition

---

## ADDED Requirements

### Requirement: Web Chat Deterministic Runtime

The Flow Engine MUST remain the deterministic conversation runtime for web chat,
persisting state in `web_chat_sessions` and executing booking actions through the
existing booking services.

#### Scenario: web chat booking uses the engine
- GIVEN a web chat booking conversation
- WHEN the request is dispatched
- THEN the Flow Engine MUST drive the state transitions
- AND the flow state MUST persist in `web_chat_sessions`

#### Scenario: engine has no WhatsApp dependency
- GIVEN the Stage 7 tree
- WHEN `src/lib/flows/` is inspected
- THEN the engine, registry, types, and flow control MUST remain
- AND no engine module MUST import a deleted WhatsApp module
