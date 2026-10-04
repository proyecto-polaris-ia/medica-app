# Delta for appointment-reminder-reply

Stage 7 (#37) eliminó el pipeline legacy que invocaba este capability; el
requisito de precedencia por sesión de flow engine quedó obsoleto. Este delta
rehooka la capacidad a Eve como tool dedicada y traslada la precedencia y el
flag al boundary del tool.

## MODIFIED Requirements

### Requirement: Control por feature flag

El manejo de respuestas a recordatorio MUST estar controlado por el feature flag
`WHATSAPP_REMINDER_REPLY_ENABLED`, cuyo valor por defecto MUST ser apagado
(`false`). El punto de enforcement del flag MUST ser la herramienta Eve
`handle-reminder-reply`. Con el flag apagado, el tool MUST NOT procesar ninguna
respuesta a recordatorio, MUST NOT modificar ninguna cita y MUST reportar que no
hay manejo para que Eve continúe conversacionalmente.

#### Scenario: Flag apagado deshabilita el manejo en Eve

- GIVEN `WHATSAPP_REMINDER_REPLY_ENABLED` ausente o con valor `false`
- WHEN Eve invoca `handle-reminder-reply` para una respuesta elegible
- THEN el tool MUST retornar sin procesar la respuesta (`handled: false`)
- AND el sistema MUST NOT modificar ninguna cita
- AND Eve MUST continuar la conversación sin acuse de recordatorio

#### Scenario: Flag encendido habilita el manejo

- GIVEN `WHATSAPP_REMINDER_REPLY_ENABLED=true`
- WHEN Eve invoca `handle-reminder-reply` para una respuesta elegible
- THEN el tool MUST procesarla como respuesta a recordatorio

### Requirement: Precedencia de la respuesta a recordatorio en Eve

Cuando un mensaje entrante pueda ser respuesta a un recordatorio (afirmación o
cancelación breve como "1", "sí", "confirmo", "no puedo", "cancelo"), Eve MUST
invocar `handle-reminder-reply` antes de responder con cualquier otra
herramienta o con una respuesta conversacional. Cuando el tool reporte que
manejó el mensaje (`handled: true`), Eve MUST transmitir el `responseText`
retornado tal cual y MUST NOT aplicar otras herramientas de escritura a ese
mismo mensaje. Cuando el tool reporte que no hay manejo (`handled: false`), Eve
MAY continuar con el resto de la conversación.

#### Scenario: Respuesta breve a recordatorio tiene precedencia

- GIVEN una cita elegible con recordatorio enviado hace menos de 36 horas
- WHEN el paciente responde "1" desde el teléfono de la cita
- THEN Eve MUST invocar `handle-reminder-reply` antes de cualquier otra acción
- AND Eve MUST transmitir el `responseText` retornado tal cual

#### Scenario: Mensaje no relacionado no dispara el manejo

- GIVEN el paciente pregunta algo ajeno a la cita (por ejemplo, precios o
  horarios generales)
- WHEN Eve evalúa el mensaje
- THEN Eve MUST NOT forzar el uso de `handle-reminder-reply`
- AND Eve MAY responder con las herramientas correspondientes

#### Scenario: Manejo ejecutado excluye otras escrituras del mismo mensaje

- GIVEN `handle-reminder-reply` retornó `handled: true` con `outcome:
  confirmation`
- WHEN Eve responde al paciente
- THEN Eve MUST NOT invocar `book-appointment` ni `reschedule-appointment`
  derivadas de ese mismo mensaje
- AND el acuse MUST corresponder al `responseText` del tool

## ADDED Requirements

### Requirement: Herramienta Eve de respuesta a recordatorio

Eve MUST exponer la herramienta `handle-reminder-reply` que, dado el teléfono
confiable del remitente y el texto del mensaje, ejecute la detección
determinista de respuestas a recordatorio (`classifyReminderReply` +
`handleReminderReply`) y retorne `{ success, handled, outcome, responseText,
needsHuman }`. El tool MUST usar el teléfono confiable del canal (`ctx`) y MUST
NOT aceptar un teléfono declarado por el paciente como identidad. El tool MUST
NOT enviar WhatsApps por sí mismo: la respuesta y el envío los maneja Eve. Los
errores de I/O MUST retornarse como `success: false` sin lanzar excepciones al
agente.

#### Scenario: Confirmación elegible retorna manejo con acuse

- GIVEN una cita en estado `requested` o `pending` con recordatorio reciente
- WHEN Eve invoca `handle-reminder-reply` y el paciente respondió "sí"
- THEN el tool MUST retornar `handled: true` con `outcome: confirmation`
- AND `responseText` MUST contener la fecha y hora reales de la cita

#### Scenario: Ambigüedad clínica escala sin tocar el estado

- GIVEN una respuesta elegible que mezcla la confirmación con una señal clínica
  ("sí, pero me duele")
- WHEN Eve invoca `handle-reminder-reply`
- THEN el tool MUST retornar `outcome: ambiguous` con `needsHuman: true`
- AND el sistema MUST NOT modificar el estado de la cita

#### Scenario: Teléfono no confiable es rechazado

- GIVEN un contexto sin `trustedContactSource: whatsapp` y `trustedPatientPhone`
- WHEN Eve invoca `handle-reminder-reply`
- THEN el tool MUST retornar `success: false` sin ejecutar detección ni
  modificar citas

#### Scenario: Error de infraestructura se surfacea sin romper la sesión

- GIVEN una falla de Supabase al consultar recordatorios
- WHEN Eve invoca `handle-reminder-reply`
- THEN el tool MUST retornar `success: false` con un mensaje de error
- AND Eve MUST ofrecer escalación a humano en lugar de confirmar la cita
