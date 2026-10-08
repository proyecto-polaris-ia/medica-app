# Delta para clara-drafting (issue #161, Fase 4)

Cambio de superficie, no de invariantes. La capacidad de redacción de Clara deja
de ser una capacidad interna sin superficie conversacional y pasa a ser operada
por el agente raíz Clara a través de su canal Discord de staff y doctores
autorizados. Se conservan todos los invariantes: redacción bajo demanda por
paciente, fallback determinista obligatorio, guardrails, ciclo
`draft → approved/rejected → sent/sent_failed`, aprobación humana explícita, kill
switch `CLARA_DRAFTING_ENABLED` y prohibición de envío.

Único delta: la prohibición del requirement `Sin canal propio ni capacidad de
envío` es de **canal de WhatsApp y capacidad de envío**, no de superficie
conversacional. El canal Discord de staff es una superficie de consulta y
preparación, no un canal paciente-facing.

> Nota de decisión: el kill switch `CLARA_DRAFTING_ENABLED` conserva su alcance
> actual (solo el camino LLM de redacción). La superficie conversacional se
> desactiva vaciando la allowlist `CLARA_DISCORD_STAFF_IDS` (fallo cerrado) o
> desinstalando el bot, no con el kill switch. Por eso los requirements
> `Redacción de borrador bajo demanda`, `Fallback determinista`,
> `Aislamiento de las reglas`, `Texto asesor sin alterar el orden`,
> `Edición humana con auditoría` y `Degradación por kill switch` permanecen sin
> cambios.

## RENAMED Requirements

- FROM: `### Requirement: Sin canal propio ni capacidad de envío`
- TO: `### Requirement: Sin canal de WhatsApp ni capacidad de envío`
- Reason: el cambio Fase 4 da a Clara una superficie conversacional de staff
  (canal Discord) que no es un canal de WhatsApp ni habilita el envío; el nombre
  anterior se volvía ambiguo. El comportamiento se actualiza en el bloque
  MODIFIED siguiente.

## MODIFIED Requirements

### Requirement: Sin canal de WhatsApp ni capacidad de envío

La capacidad de redacción de Clara MUST NOT tener binding de canal de WhatsApp ni
capacidad de envío. MUST NOT enviar ningún mensaje a pacientes por sí misma. La
capacidad MAY ser operada conversacionalmente desde la superficie de staff del
agente raíz Clara (canal Discord de staff y doctores autorizados), entendida como
superficie de consulta y preparación. Esa superficie MUST NOT ser un canal
paciente-facing y MUST NOT aceptar mensajes entrantes de pacientes. El envío de
un borrador MUST ocurrir únicamente por el transporte de WhatsApp existente y
solo tras aprobación humana explícita.

#### Scenario: La redacción no envía ningún WhatsApp

- GIVEN un borrador generado o editado por la capacidad
- WHEN el usuario no ha aprobado ni confirmado el envío
- THEN el sistema MUST NOT emitir ningún mensaje saliente al paciente
- AND MUST NOT registrar un envío `outbound` en `whatsapp_messages`

#### Scenario: La capacidad no expone un canal de WhatsApp propio

- GIVEN la capacidad de redacción de Clara
- WHEN se inspecciona su configuración de canales
- THEN MUST NOT exponer un canal de WhatsApp propio
- AND MUST NOT aceptar mensajes entrantes de pacientes

#### Scenario: El canal de staff es una superficie de consulta y preparación

- GIVEN la superficie conversacional de Clara para staff y doctores autorizados
- WHEN el staff autorizado consulta un caso o solicita un borrador
- THEN la superficie MUST permitir la consulta y la preparación del borrador
- AND MUST NOT habilitar ningún envío hacia el paciente
- AND MUST NOT tratar la superficie como un canal paciente-facing

#### Scenario: La superficie de staff no acepta mensajes de pacientes

- GIVEN un usuario no autorizado que intenta hablar con Clara como paciente
- WHEN se procesa la interacción
- THEN MUST NOT iniciarse ninguna sesión
- AND MUST NOT procesarse como una conversación de atención al paciente

#### Scenario: El envío sigue el flujo aprobado existente

- GIVEN un borrador en estado `approved`
- WHEN el usuario autorizado confirma el envío
- THEN el sistema MUST enviar por el transporte de WhatsApp existente
- AND la capacidad de redacción MUST NOT intervenir en el envío
