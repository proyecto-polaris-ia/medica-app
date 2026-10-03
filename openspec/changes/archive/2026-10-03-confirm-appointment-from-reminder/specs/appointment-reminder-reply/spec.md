# Appointment Reminder Reply Specification

## Purpose

Cerrar el ciclo de los recordatorios de cita interpretando de forma determinista
la respuesta entrante del paciente. La capacidad reconoce una confirmación o una
cancelación a partir de un recordatorio reciente y una cita en estado elegible,
aplica la transición de estado acotada, responde con la fecha y hora reales de la
cita, registra el rastro auditable en `appointments.notes`, escala a humano
cuando corresponde y nunca modifica una cita inexistente, terminal o ambigua. El
LLM interpreta el lenguaje; el backend decide y ejecuta la transición.

## ADDED Requirements

### Requirement: Detección del contexto de recordatorio activo

El sistema MUST considerar un mensaje entrante como respuesta a un recordatorio
solo cuando el teléfono remitente corresponde a una cita con un recordatorio
enviado dentro de las últimas 36 horas (`appointment_reminders.sent_at`) y la
cita está en un estado elegible sin confirmar (`requested` o `pending`). Fuera de
esa ventana o sin un recordatorio reciente, el mensaje MUST NOT considerarse
respuesta a recordatorio.

#### Scenario: Recordatorio reciente y cita elegible

- GIVEN una cita en estado `requested` o `pending` cuyo recordatorio se envió hace menos de 36 horas
- WHEN el paciente responde por WhatsApp desde el teléfono de esa cita
- THEN el sistema MUST considerar el mensaje como respuesta a recordatorio

#### Scenario: Recordatorio fuera de la ventana de 36 horas

- GIVEN una cita cuyo recordatorio se envió hace más de 36 horas
- WHEN el paciente responde "sí" desde el teléfono de esa cita
- THEN el sistema MUST NOT considerar el mensaje como respuesta a recordatorio

#### Scenario: Teléfono sin recordatorio reciente

- GIVEN un teléfono sin una cita con recordatorio enviado dentro de las últimas 36 horas
- WHEN el paciente envía "sí"
- THEN el sistema MUST NOT considerar el mensaje como respuesta a recordatorio

### Requirement: Confirmación determinista y tolerante

El sistema MUST interpretar como confirmación los mensajes afirmativos simples
definidos por el flujo de recordatorio ("1", "si", "sí", "confirmo", "va", "ok")
y MUST ser tolerante a mayúsculas y acentos. Un mensaje que no sea afirmativo
MUST NOT interpretarse como confirmación.

#### Scenario: Respuesta con dígito afirmativo

- GIVEN una respuesta a recordatorio elegible con el texto "1"
- WHEN el sistema interpreta el mensaje
- THEN el sistema MUST interpretarlo como confirmación

#### Scenario: Tolerancia a mayúsculas y acentos

- GIVEN una respuesta a recordatorio elegible con los textos "Sí", "SI" o "si"
- WHEN el sistema interpreta el mensaje
- THEN el sistema MUST interpretarlo como confirmación

#### Scenario: Otras afirmaciones simples

- GIVEN una respuesta a recordatorio elegible con los textos "confirmo", "va" u "ok"
- WHEN el sistema interpreta el mensaje
- THEN el sistema MUST interpretarlo como confirmación

#### Scenario: Mensaje no afirmativo no confirma

- GIVEN una respuesta a recordatorio elegible con el texto "no" o cualquier mensaje no afirmativo
- WHEN el sistema interpreta el mensaje
- THEN el sistema MUST NOT interpretarlo como confirmación

### Requirement: Clasificación de intención verificable

El sistema MUST clasificar de forma determinista la intención de una respuesta a
recordatorio como confirmación, cancelación, ambigua o ninguna, y esa
clasificación MUST ser verificable de forma aislada con entradas positivas,
negativas y ambiguas.

#### Scenario: Entradas positivas de confirmación

- GIVEN un conjunto de textos afirmativos de confirmación
- WHEN el sistema clasifica cada texto
- THEN el sistema MUST clasificarlo como confirmación

#### Scenario: Entradas positivas de cancelación

- GIVEN un conjunto de textos que expresan cancelación
- WHEN el sistema clasifica cada texto
- THEN el sistema MUST clasificarlo como cancelación

#### Scenario: Entradas negativas

- GIVEN un mensaje que no expresa confirmación ni cancelación
- WHEN el sistema clasifica el mensaje
- THEN el sistema MUST clasificarlo como ninguna

#### Scenario: Entrada ambigua

- GIVEN un mensaje que mezcla una confirmación con un síntoma, por ejemplo "sí, pero me duele mucho"
- WHEN el sistema clasifica el mensaje
- THEN el sistema MUST clasificarlo como ambigua

### Requirement: Transición a `confirmed` y acuse con datos reales

Cuando una respuesta a recordatorio elegible se clasifica como confirmación, el
sistema MUST transicionar la cita de `requested` o `pending` a `confirmed` y MUST
responder al paciente con un acuse breve que incluya la fecha y hora reales
leídas de la cita. El sistema MUST NOT inventar una fecha u hora distinta de la
registrada.

#### Scenario: Cita en `requested` se confirma

- GIVEN una cita en `requested` con un recordatorio reciente elegible
- WHEN el paciente responde "1"
- THEN el sistema MUST cambiar el estado de la cita a `confirmed`
- AND MUST responder con un acuse breve

#### Scenario: Cita en `pending` se confirma

- GIVEN una cita en `pending` con un recordatorio reciente elegible
- WHEN el paciente responde "confirmo"
- THEN el sistema MUST cambiar el estado de la cita a `confirmed`
- AND MUST responder con un acuse breve

#### Scenario: El acuse usa la fecha y hora reales de la cita

- GIVEN una cita elegible que se confirma desde el recordatorio
- WHEN el sistema redacta el acuse
- THEN la fecha y hora del acuse MUST coincidir con las de la cita registrada
- AND el sistema MUST NOT inventar una fecha u hora distintas

### Requirement: Cancelación desde el recordatorio

Cuando una respuesta a recordatorio elegible se clasifica como cancelación, el
sistema MUST transicionar la cita de `requested`, `pending` o `confirmed` a
`cancelled`, MUST anexar el texto libre del paciente como motivo en
`appointments.notes` y MUST crear una escalación suave a humano que ofrezca
reagendar, reutilizando el flujo de reagenda existente.

#### Scenario: Cancelación de una cita en `requested` o `pending`

- GIVEN una cita en `requested` o `pending` con un recordatorio reciente elegible
- WHEN el paciente responde que no podrá asistir
- THEN el sistema MUST cambiar el estado de la cita a `cancelled`

#### Scenario: Cancelación de una cita ya confirmada

- GIVEN una cita en `confirmed` con un recordatorio reciente elegible
- WHEN el paciente responde que no podrá asistir
- THEN el sistema MUST cambiar el estado de la cita a `cancelled`

#### Scenario: El motivo se anexa a las notas

- GIVEN una cancelación con el texto libre "no alcanzo, trabajo"
- WHEN el sistema aplica la cancelación
- THEN `appointments.notes` MUST contener el motivo con el texto libre del paciente

#### Scenario: Escalación suave ofrece reagendar

- GIVEN una cancelación procesada desde el recordatorio
- WHEN el sistema escala a humano
- THEN el sistema MUST crear una escalación a humano
- AND la escalación MUST ofrecer reagendar reutilizando el flujo de reagenda existente

### Requirement: Ambigüedad clínica escala y no toca el estado

Si el mensaje mezcla una confirmación o una cancelación con dolor, urgencia,
infección, alergia o solicitud de medicamento o receta, el sistema MUST escalar a
humano y MUST NOT cambiar el estado de la cita.

#### Scenario: Confirmación mezclada con dolor

- GIVEN una cita elegible con recordatorio reciente
- WHEN el paciente responde "sí, me duele mucho"
- THEN el sistema MUST crear una escalación a humano
- AND el estado de la cita MUST permanecer sin cambios

#### Scenario: Cancelación mezclada con urgencia o infección

- GIVEN una cita con recordatorio reciente
- WHEN el paciente responde "no puedo, tengo una infección"
- THEN el sistema MUST crear una escalación a humano
- AND el estado de la cita MUST permanecer sin cambios

#### Scenario: Solicitud de medicamento con confirmación

- GIVEN una cita elegible con recordatorio reciente
- WHEN el paciente responde "ok, pero recuérdame qué medicina tomo"
- THEN el sistema MUST crear una escalación a humano
- AND el estado de la cita MUST permanecer sin cambios

### Requirement: Citas inexistentes o terminales nunca se modifican

El sistema MUST NOT confirmar ni cancelar una cita inexistente o en estado
terminal (`cancelled`, `rescheduled`, `no_show`, `attended`); en esos casos el
estado de la cita MUST permanecer sin cambios y el sistema MUST NOT aplicar
ninguna transición.

#### Scenario: Cita inexistente

- GIVEN un teléfono sin una cita vigente asociada
- WHEN el paciente responde una confirmación
- THEN el sistema MUST NOT confirmar ninguna cita
- AND MUST NOT aplicar ninguna transición de estado

#### Scenario: Confirmación sobre una cita en estado terminal

- GIVEN una cita en estado `cancelled`, `rescheduled`, `no_show` o `attended`
- WHEN el paciente responde "sí"
- THEN el sistema MUST NOT cambiar el estado de la cita
- AND el sistema MUST NOT marcarla como `confirmed`

#### Scenario: Cancelación sobre una cita ya terminal

- GIVEN una cita en estado `cancelled` o `rescheduled`
- WHEN el paciente responde que no podrá asistir
- THEN el estado de la cita MUST permanecer sin cambios
- AND el sistema MUST NOT aplicar una cancelación adicional

### Requirement: Respuesta fuera de ventana con escalación a humano

Una respuesta que coincide con una confirmación o una cancelación pero llega
fuera de la ventana de 36 horas, o sin un recordatorio reciente, MUST recibir el
manejo general del pipeline y MUST escalar a humano, sin cambiar el estado de
ninguna cita.

#### Scenario: Confirmación tardía fuera de la ventana

- GIVEN una cita cuyo recordatorio se envió hace más de 36 horas
- WHEN el paciente responde "1"
- THEN el sistema MUST NOT cambiar el estado de la cita
- AND el sistema MUST escalar a humano

#### Scenario: Confirmación sin recordatorio reciente

- GIVEN un teléfono sin un recordatorio enviado dentro de las últimas 36 horas
- WHEN el paciente responde "confirmo"
- THEN el sistema MUST NOT cambiar el estado de ninguna cita
- AND el sistema MUST escalar a humano

### Requirement: Rastro auditable de la transición

Cada cambio de estado originado por una respuesta a recordatorio MUST registrarse
en `appointments.notes` con la marca de tiempo en `America/Mexico_City`, el
resultado ("Confirmada" o "Cancelada" desde recordatorio) y el origen
("quién: sistema/recordatorio"), junto con el motivo cuando exista.

#### Scenario: Rastro de una confirmación

- GIVEN una cita confirmada desde el recordatorio
- WHEN el sistema registra la transición
- THEN `appointments.notes` MUST contener la marca de tiempo en `America/Mexico_City`
- AND MUST contener "Confirmada desde recordatorio (quién: sistema/recordatorio)"

#### Scenario: Rastro de una cancelación con motivo

- GIVEN una cita cancelada desde el recordatorio con un motivo del paciente
- WHEN el sistema registra la transición
- THEN `appointments.notes` MUST contener la marca de tiempo en `America/Mexico_City`
- AND MUST contener "Cancelada desde recordatorio (quién: sistema/recordatorio)"
- AND MUST contener el motivo con el texto libre del paciente

### Requirement: Idempotencia de las respuestas repetidas

Si el mismo mensaje del proveedor se procesa más de una vez, o el paciente envía
confirmaciones o cancelaciones equivalentes repetidas, el sistema MUST NOT
duplicar la transición, el acuse ni la escalación más allá de lo definido por el
cambio. La transición de estado MUST aplicarse de forma guardada por el estado
de origen, de modo que no revierta un estado ya terminal.

#### Scenario: Webhook duplicado del mismo mensaje

- GIVEN una respuesta a recordatorio ya procesada con el mismo id de proveedor
- WHEN el proveedor entrega el mismo mensaje de nuevo
- THEN el sistema MUST NOT aplicar una nueva transición de estado
- AND el sistema MUST NOT duplicar el acuse

#### Scenario: Confirmación repetida sobre una cita ya confirmada

- GIVEN una cita ya `confirmed` por una respuesta a recordatorio
- WHEN el paciente vuelve a responder con una confirmación
- THEN el sistema MUST NOT revertir ni cambiar el estado de la cita
- AND MUST NOT duplicar la escalación

#### Scenario: Cancelación repetida sobre una cita ya cancelada

- GIVEN una cita ya `cancelled` por una respuesta a recordatorio
- WHEN el paciente vuelve a responder que no podrá asistir
- THEN el sistema MUST NOT cambiar el estado de la cita
- AND MUST NOT duplicar la escalación

### Requirement: Control por feature flag

El manejo de respuestas a recordatorio MUST estar controlado por el feature flag
`WHATSAPP_REMINDER_REPLY_ENABLED`, cuyo valor por defecto MUST ser apagado
(`false`). Con el flag apagado, el comportamiento del pipeline MUST ser idéntico
al actual y MUST NOT procesarse ninguna respuesta a recordatorio.

#### Scenario: Flag apagado conserva el comportamiento actual

- GIVEN `WHATSAPP_REMINDER_REPLY_ENABLED` ausente o con valor `false`
- WHEN llega una confirmación a un recordatorio elegible
- THEN el sistema MUST NOT procesarla como respuesta a recordatorio
- AND el comportamiento del pipeline MUST permanecer igual al actual

#### Scenario: Flag encendido habilita el manejo

- GIVEN `WHATSAPP_REMINDER_REPLY_ENABLED=true`
- WHEN llega una confirmación a un recordatorio elegible
- THEN el sistema MUST procesarla como respuesta a recordatorio

### Requirement: Precedencia de la sesión de flow engine activa

Conforme a la regla de precedencia de `flow-engine`, cuando existe una sesión de
flow engine activa y no expirada para la conversación, el manejo de respuestas a
recordatorio MUST NOT ejecutarse, MUST NOT modificar ninguna cita y MUST ceder el
mensaje al flujo en curso. Una sesión completa o expirada MUST NOT bloquear el
manejo de respuestas a recordatorio.

#### Scenario: Sesión activa impide la transición de recordatorio

- GIVEN una conversación con una sesión de flow engine activa y no expirada
- AND una cita elegible con recordatorio reciente para ese teléfono
- WHEN el paciente envía "1"
- THEN el sistema MUST NOT aplicar la transición de recordatorio
- AND el sistema MUST NOT modificar la cita elegible

#### Scenario: La reserva en curso no se interrumpe

- GIVEN una reserva en curso con una sesión de flow engine activa
- WHEN llega un mensaje que coincide con una confirmación de recordatorio
- THEN el flujo de reserva MUST continuar
- AND el sistema MUST NOT confirmar ninguna cita existente por esa respuesta

#### Scenario: Sesión expirada no bloquea el manejo

- GIVEN una conversación cuya sesión de flow engine está completa o expirada
- AND una cita elegible con recordatorio reciente
- WHEN el paciente responde "1"
- THEN el sistema MAY aplicar el manejo de respuesta a recordatorio
