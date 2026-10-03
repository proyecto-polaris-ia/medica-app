# Delta for Flow Engine

## ADDED Requirements

### Requirement: Precedencia de la sesión de flujo activa

Cuando existe una sesión de flow engine activa y no expirada para una
conversación, esa sesión MUST tener prioridad sobre el manejo de respuestas a
recordatorio. El sistema MUST NOT ejecutar el reconocimiento ni la transición de
respuesta a recordatorio mientras la sesión esté activa y MUST continuar el flujo
en curso. Una sesión completa o expirada MUST NOT bloquear el manejo de
respuestas a recordatorio.

#### Scenario: Sesión activa tiene prioridad

- GIVEN una conversación con una sesión de flow engine activa y no expirada
- AND una cita elegible con recordatorio reciente para ese teléfono
- WHEN el paciente envía "1"
- THEN el sistema MUST ceder el mensaje a la sesión de flow engine
- AND el sistema MUST NOT aplicar ninguna transición de estado por respuesta a recordatorio

#### Scenario: Reserva en curso no interrumpida

- GIVEN una reserva en curso con una sesión de flow engine activa
- WHEN llega un mensaje que coincide con una confirmación de recordatorio
- THEN el flujo de reserva MUST continuar
- AND el sistema MUST NOT aplicar ninguna transición de estado por respuesta a recordatorio

#### Scenario: Sesión completa o expirada no bloquea

- GIVEN una conversación cuya sesión de flow engine está completa o expirada
- AND una cita elegible con recordatorio reciente
- WHEN el paciente responde "1"
- THEN el sistema MAY aplicar el manejo de respuesta a recordatorio
