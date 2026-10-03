# Delta for WhatsApp Inbound Automation

## ADDED Requirements

### Requirement: Respuestas a recordatorio antes de la clasificación general

El pipeline de entrada MUST reconocer, antes de la clasificación general de
intención, los mensajes entrantes que son respuestas a un recordatorio de cita
reciente y en estado elegible. El reconocimiento MUST ejecutarse tanto en el path
de flow engine como en el path legacy cuando NO existe una sesión de flow engine
activa y no expirada, y MUST regirse por la ventana de 36 horas desde
`appointment_reminders.sent_at` y por la idempotencia del ledger de mensajes.

#### Scenario: Confirmación reconocida antes de clasificar

- GIVEN un mensaje entrante que es una confirmación a un recordatorio elegible
- WHEN el pipeline procesa el mensaje
- THEN el sistema MUST reconocerlo como respuesta a recordatorio
- AND el sistema MUST NOT clasificarlo como una intención nueva general

#### Scenario: Sesión de flow engine activa conserva el flujo de reserva

- GIVEN una conversación con una sesión de flow engine activa y no expirada
- WHEN llega un mensaje que parece una confirmación a un recordatorio
- THEN el sistema MUST NOT ejecutar el reconocimiento de respuesta a recordatorio
- AND el sistema MUST continuar el flujo de reserva

#### Scenario: Path legacy reconoce la respuesta

- GIVEN `WHATSAPP_FLOW_ENGINE_ENABLED` apagado
- AND el manejo de respuestas a recordatorio habilitado
- AND un mensaje de confirmación a un recordatorio elegible
- WHEN el pipeline legacy procesa el mensaje
- THEN el sistema MUST reconocerlo como respuesta a recordatorio

#### Scenario: Idempotencia por ledger de mensajes

- GIVEN un mensaje de respuesta a recordatorio ya procesado con su id de proveedor
- WHEN el proveedor vuelve a entregar el mismo mensaje
- THEN el sistema MUST reconocer el duplicado en el ledger de mensajes
- AND el sistema MUST NOT repetir la transición ni duplicar el acuse
