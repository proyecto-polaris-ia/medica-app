# Delta for Flow Engine

## MODIFIED Requirements

### Requirement: Action Execution
The system MUST execute actions deterministically when a state requires it, and MUST support an onboarding action alongside the existing booking actions within the same closed action contract.

(Previously: The system executed only the existing booking actions such as `getFreeSlots` and `bookAppointment`, with no onboarding action in the contract.)

#### Scenario: Onboarding action through the same engine contract
- GIVEN a flow state with the onboarding action
- WHEN all required entities are present
- THEN the system MUST execute the onboarding action through the same engine contract
- AND the action result MUST determine the next transition

#### Scenario: Existing booking actions unchanged
- GIVEN a flow state with `action: 'getFreeSlots'` or `action: 'bookAppointment'`
- WHEN all required entities are present
- THEN the system MUST call the existing booking action with the entities
- AND the existing booking flow behavior MUST remain unchanged

### Requirement: Flow Registry
The system MUST maintain a registry of available flows, including the onboarding flow, so that a flow is accessible by name and the orchestrator can instantiate it.

(Previously: The registry exposed only the booking flow, so any other flow name resolved as unknown.)

#### Scenario: Onboarding flow registered
- GIVEN the onboarding flow definition
- WHEN the flow is added to the registry
- THEN the onboarding flow MUST be accessible by name
- AND the orchestrator MUST be able to instantiate it

#### Scenario: Flow not found
- GIVEN a flow name that is not registered
- WHEN the orchestrator tries to load the flow
- THEN the system MUST throw an error
- AND the error MUST include the unknown flow name

## ADDED Requirements

### Requirement: Reconocimiento del flujo de onboarding en el control de tema

El control de flujo MUST reconocer el nombre del flujo de onboarding para poder
continuar una sesión de onboarding en curso, además del flujo de reserva. Este
reconocimiento MUST NOT alterar el comportamiento existente del flujo de reserva.

#### Scenario: El control de tema reconoce la sesión de onboarding

- GIVEN una conversación con una sesión de onboarding activa y no expirada
- WHEN llega un mensaje que podría interpretarse como un cambio de tema
- THEN el sistema MUST reconocer el flujo de onboarding en curso
- AND el sistema MUST continuar la sesión de onboarding

#### Scenario: El flujo de reserva conserva su comportamiento

- GIVEN una conversación con una sesión de reserva activa y no expirada
- WHEN llega un mensaje
- THEN el comportamiento existente del flujo de reserva MUST permanecer sin cambios
