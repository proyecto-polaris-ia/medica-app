# Flow Engine Specification

**Baseline**: new-capability

## Purpose

Provide a deterministic, state-machine-based architecture for multi-step conversational flows. The Flow Engine separates flow logic (deterministic) from language processing (LLM-based), enabling predictable, testable, and maintainable conversational experiences.

## Requirements

### Requirement: Flow Definition
The system MUST support declarative flow definitions that specify states, transitions, required entities, and actions.

#### Scenario: Flow definition structure
- GIVEN a flow definition file
- WHEN the system loads the flow
- THEN the flow MUST define an `initialState`
- AND the flow MUST define all possible `states`
- AND each state MUST specify `required` entities (if any)
- AND each state MUST specify a `prompt` template
- AND each state MUST specify `transitions` to other states

#### Scenario: State with action
- GIVEN a state definition with an `action` property
- WHEN the flow engine reaches that state
- THEN the system MUST execute the specified action
- AND the action result MUST determine the next transition

### Requirement: Flow State Persistence
The system MUST persist flow state per conversation to enable multi-turn interactions.

#### Scenario: State persisted after each message
- GIVEN an active flow in a conversation
- WHEN a message is processed
- THEN the flow state MUST be updated in `whatsapp_conversations.flow_state`
- AND the state MUST include the current state name
- AND the state MUST include collected entities

#### Scenario: State recovered across messages
- GIVEN a conversation with a persisted flow state
- WHEN a new message arrives
- THEN the system MUST load the previous flow state
- AND the system MUST continue from the previous state
- AND previously collected entities MUST be available

### Requirement: Entity Extraction
The system MUST extract entities from user messages and merge them with previously collected entities.

#### Scenario: Entity extracted from message
- GIVEN a flow state requiring `localDate`
- WHEN the user says "el 15 de septiembre"
- THEN the system MUST extract `localDate: "2026-09-15"`
- AND the entity MUST be merged into the flow state

#### Scenario: Entity validation
- GIVEN a required entity with validation rules
- WHEN the entity is extracted
- THEN the system MUST validate the entity format
- AND invalid entities MUST trigger a re-prompt

### Requirement: Deterministic Transitions
The system MUST transition between states based on defined rules, not LLM decisions.

#### Scenario: All required entities present
- GIVEN a state with `required: ['serviceId', 'providerId']`
- WHEN both entities are present in the flow state
- THEN the system MUST transition to the next state
- AND the transition MUST follow the defined `transitions` map

#### Scenario: Missing required entity
- GIVEN a state with `required: ['localDate']`
- WHEN `localDate` is not present
- THEN the system MUST NOT transition
- AND the system MUST prompt for the missing entity

### Requirement: Action Execution
The system MUST execute actions deterministically when a state requires it.

#### Scenario: getFreeSlots action
- GIVEN a state with `action: 'getFreeSlots'`
- WHEN all required entities are present
- THEN the system MUST call `getFreeSlots` with the entities
- AND the result MUST be stored in the flow state
- AND the transition MUST be based on the result (has_slots / no_slots)

#### Scenario: bookAppointment action
- GIVEN a state with `action: 'bookAppointment'`
- WHEN all required entities are present
- THEN the system MUST call `bookAppointment` with the entities
- AND success MUST transition to the next state
- AND failure MUST handle the error appropriately

### Requirement: Intent Routing
The system MUST route messages to the appropriate handler based on classified intent.

#### Scenario: Intent routes to Flow Engine
- GIVEN a message classified as `book_appointment`
- WHEN the Flow Engine is enabled
- THEN the message MUST be processed by the Flow Engine
- AND the appropriate flow MUST be selected

#### Scenario: Intent routes to Knowledge Handler
- GIVEN a message classified as `inquiry`
- WHEN the Flow Engine is enabled
- THEN the message MUST be processed by the Knowledge Handler
- AND the Flow Engine MUST NOT be invoked

#### Scenario: Intent routes to Escalation Handler
- GIVEN a message classified as `support`
- WHEN the Flow Engine is enabled
- THEN the message MUST be processed by the Escalation Handler
- AND no flow state MUST be created

### Requirement: Feature Flag Control
The system MUST support a feature flag to enable/disable the Flow Engine.

#### Scenario: Flow Engine enabled
- GIVEN `WHATSAPP_FLOW_ENGINE_ENABLED=true`
- WHEN a message is processed
- THEN the Flow Engine path MUST be used

#### Scenario: Flow Engine disabled
- GIVEN `WHATSAPP_FLOW_ENGINE_ENABLED=false` or not set
- WHEN a message is processed
- THEN the legacy path MUST be used
- AND backward compatibility MUST be maintained

### Requirement: Flow Registry
The system MUST maintain a registry of available flows.

#### Scenario: Flow registered
- GIVEN a new flow definition
- WHEN the flow is added to the registry
- THEN the flow MUST be accessible by name
- AND the orchestrator MUST be able to instantiate the flow

#### Scenario: Flow not found
- GIVEN a flow name that is not registered
- WHEN the orchestrator tries to load the flow
- THEN the system MUST throw an error
- AND the error MUST include the unknown flow name

### Requirement: Prompt Template Resolution
The system MUST resolve placeholders in prompt templates using flow state entities.

#### Scenario: Placeholder resolved
- GIVEN a prompt template "Tengo estos horarios: {slots}"
- AND a flow state with `metadata.slots`
- WHEN the prompt is generated
- THEN `{slots}` MUST be replaced with the actual slots
- AND the response MUST be natural language

#### Scenario: Missing placeholder data
- GIVEN a prompt template with a placeholder
- AND the flow state does not have the data
- THEN the system MUST use a default value
- OR the system MUST skip the placeholder

### Requirement: Terminal State
The system MUST support terminal states that end the flow.

#### Scenario: Flow completes
- GIVEN a state with `terminal: true`
- WHEN the flow engine reaches that state
- THEN the flow MUST be marked as complete
- AND the flow state MUST be cleared or archived
- AND a completion message MUST be sent

### Requirement: Error Handling
The system MUST handle errors gracefully without losing conversation context.

#### Scenario: Action fails
- GIVEN a flow state executing an action
- WHEN the action throws an error
- THEN the system MUST NOT crash
- AND the system MUST log the error
- AND the system MUST offer a fallback (retry or escalate)

#### Scenario: Invalid state transition
- GIVEN a flow state with no valid transition
- WHEN the system tries to advance
- THEN the system MUST throw a descriptive error
- AND the error MUST include the current state and attempted transition

## Data Model

### Flow State (persisted in `whatsapp_conversations.flow_state`)

```typescript
type FlowState = {
  name: string;                    // Current state name
  entities: ExtractedEntities;     // Collected entities
  candidates?: Array<{             // Available options (e.g., time slots)
    startAt: string;
    endAt: string;
    serviceId?: string;
    providerId?: string;
  }>;
  metadata?: Record<string, unknown>;  // Additional data
};
```

### Flow Definition

```typescript
type FlowDefinition = {
  name: string;
  initialState: string;
  states: {
    [stateName: string]: {
      required?: string[];         // Required entities
      optional?: string[];         // Optional entities
      action?: string;             // Action to execute
      prompt: string;              // Prompt template
      transitions?: {              // State transitions
        [result: string]: string;  // result -> nextState
      };
      terminal?: boolean;          // Is terminal state
    };
  };
};
```

## Available Flows

### book_appointment

Multi-step flow for scheduling appointments.

**States:**
1. `collect_date` → Ask for preferred date
2. `collect_service` → Ask for service type
3. `collect_provider` → Ask for preferred provider
4. `check_availability` → Query available slots (action: `getFreeSlots`)
5. `select_slot` → User selects a slot
6. `confirm_booking` → Confirm and book (action: `bookAppointment`)
7. `collect_notes` → Ask for additional notes
8. `complete` → Flow completed

### Future Flows

- `reschedule_appointment` — Reschedule existing appointment
- `cancel_appointment` — Cancel existing appointment
- `support_request` — Handle support requests with context

## Integration Points

| Component | Integration |
|-----------|-------------|
| `orchestrator.ts` | Routes intents to Flow Engine |
| `inbound-service.ts` | Entry point, feature flag check |
| `store.ts` | Persists/loads flow state |
| `booking/` | Actions execute booking logic |
| `ai/` | LLM classifies intent, extracts entities |

## Testing Strategy

1. **Unit tests**: Test Flow Engine logic in isolation
2. **Integration tests**: Test full flow execution
3. **State tests**: Test state persistence and recovery
4. **Error tests**: Test error handling and fallbacks

## Rollback Plan

1. Set `WHATSAPP_FLOW_ENGINE_ENABLED=false`
2. Redeploy (or wait for next deploy)
3. Legacy path activates immediately
4. No data migration needed (flow_state is ignored)
