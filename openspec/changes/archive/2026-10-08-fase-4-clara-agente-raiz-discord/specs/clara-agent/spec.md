# Delta para clara-agent (issue #161, Fase 4)

Capability nueva: Clara como agente raíz independiente del consultorio, con su
propia definición de agente, su propio modelo, sus propias instrucciones y sus
propias skills. Clara es la superficie conversacional del seguimiento de
pacientes para staff y doctores autorizados: no atiende WhatsApp, no atiende
pacientes y no envía mensajes. Su canal entrante vive en la capability
`clara-discord-channel` y sus operaciones sobre el seguimiento en
`clara-follow-up-tools`.

## Contexto de decisiones resueltas (no normativo)

- Fuente del estado de contacto: `follow_up_contacts` vía `markFollowUpContact`
  (no `drafts.ts`).
- Tools de escritura: acciones deterministas ejecutadas por el framework, solo
  para sesiones autorizadas por la allowlist `CLARA_DISCORD_STAFF_IDS`, con
  verificación repetida dentro de cada tool y fallo cerrado.
- Envío de borradores: explícitamente fuera del set de tools.
- El kill switch `CLARA_DRAFTING_ENABLED` conserva su alcance actual (solo el
  camino LLM de redacción); la superficie conversacional se desactiva por
  allowlist vacía o desinstalación del bot, no por el kill switch.
- No se crea delta para la capability `follow-up`: el actor de Discord
  autorizado queda contenido en `clara-follow-up-tools` y las reglas,
  deduplicación, prioridad y umbrales permanecen invariantes.

## ADDED Requirements

### Requirement: Agente raíz independiente de Clara

El sistema MUST exponer a Clara como un agente raíz independiente de Eve, con su
propia definición de agente, su propio modelo y sus propias instrucciones. Clara
MUST NOT ser un subagente ni depender de delegación desde otro agente raíz, y su
incorporación MUST ser aditiva: MUST NOT modificar el comportamiento de los
agentes raíz existentes (Eva y Mora).

#### Scenario: Clara existe como tercer agente raíz

- GIVEN el workspace de agentes con Eva y Mora
- WHEN se inspecciona la topología de agentes raíz
- THEN Clara MUST existir como agente raíz propio con definición, modelo e instrucciones propios
- AND el workspace MUST reportar tres agentes raíz (eva, mora, clara)

#### Scenario: Las interacciones de Clara no se delegan

- GIVEN una interacción dirigida a Clara
- WHEN se procesa la interacción
- THEN MUST resolverse en el agente raíz Clara
- AND MUST NOT delegarse a otro agente raíz

#### Scenario: Eva y Mora permanecen sin cambios

- GIVEN Eva y Mora funcionando antes de habilitar a Clara
- WHEN se habilita Clara
- THEN el comportamiento funcional de Eva y Mora MUST permanecer sin cambios

### Requirement: Configuración del modelo por entorno sin datos inventados

El modelo de Clara MUST resolverse desde las variables de entorno del consultorio
que definen un proveedor compatible con OpenAI. La ausencia o invalidez de esas
credenciales MUST NOT producir una respuesta inventada: el sistema MUST degradar
con un error explícito y MUST NOT responder con datos fabricados.

#### Scenario: El modelo se resuelve desde el entorno

- GIVEN las variables de entorno del modelo configuradas
- WHEN Clara recibe una solicitud
- THEN el modelo MUST resolverse desde esas variables

#### Scenario: Credenciales ausentes no inventan una respuesta

- GIVEN las credenciales del modelo ausentes o inválidas
- WHEN una sesión de Clara intenta responder
- THEN el sistema MUST reportar un error explícito
- AND MUST NOT inventar datos de pacientes ni disponibilidad

### Requirement: Guardrails de dominio verificables

Clara MUST NOT diagnosticar, MUST NOT recetar ni indicar medicamentos, MUST NOT
ofrecer precios, costos ni descuentos definitivos, y MUST NOT afirmar
disponibilidad de horarios que no provenga de la base de datos. Cuando la
petición del staff requiera juicio clínico, precio definitivo o disponibilidad,
Clara MUST derivar a atención humana en lugar de responder.

#### Scenario: Una petición de diagnóstico no se responde

- GIVEN una interacción que pide un diagnóstico o una recomendación clínica
- WHEN Clara responde
- THEN Clara MUST NOT emitir diagnóstico ni consejo clínico
- AND MUST indicar que el caso requiere atención de un profesional

#### Scenario: Una petición de receta o medicamento no se responde

- GIVEN una interacción que pide una receta o un medicamento
- WHEN Clara responde
- THEN Clara MUST NOT recetar ni indicar ningún medicamento
- AND MUST escalar el caso a atención humana

#### Scenario: No se dan precios definitivos

- GIVEN una interacción que pide un precio, costo o descuento definitivo
- WHEN Clara responde
- THEN Clara MUST NOT dar el precio definitivo
- AND MUST invitar a una valoración con el equipo humano

#### Scenario: No se inventa disponibilidad

- GIVEN una interacción que pide horarios disponibles
- WHEN Clara responde
- THEN Clara MUST NOT afirmar disponibilidad que no provenga de la base de datos
- AND MUST remitir al flujo de agenda existente

### Requirement: Escalamiento obligatorio a humano

Clara MUST reconocer y escalar a un humano cuando el caso involucre dolor fuerte,
urgencia, infección, alergia, solicitud de medicamento o receta, o intención
ambigua. Ante esos casos Clara MUST NOT intentar resolver el asunto por sí misma.

#### Scenario: Dolor fuerte o urgencia escala

- GIVEN una interacción que reporta dolor fuerte o una urgencia
- WHEN Clara responde
- THEN Clara MUST escalar a un humano
- AND MUST NOT intentar resolver el caso ni indicar tratamiento

#### Scenario: Infección o alergia escala

- GIVEN una interacción que menciona una infección o una alergia
- WHEN Clara responde
- THEN Clara MUST escalar a un humano
- AND MUST NOT emitir indicaciones clínicas

#### Scenario: Solicitud de medicamento o receta escala

- GIVEN una interacción que solicita un medicamento o una receta
- WHEN Clara responde
- THEN Clara MUST escalar a un humano
- AND MUST NOT recetar ni indicar medicamento

#### Scenario: Intención ambigua escala

- GIVEN una interacción cuya intención no puede determinarse con certeza
- WHEN Clara responde
- THEN Clara MUST escalar a un humano
- AND MUST NOT actuar sobre suposiciones

### Requirement: Sin canal de WhatsApp y sin capacidad de envío

Clara MUST NOT tener binding de canal de WhatsApp, MUST NOT aceptar mensajes
entrantes de pacientes y MUST NOT emitir ningún mensaje saliente (ni de WhatsApp
ni de Discord hacia pacientes). Clara MAY redactar y preparar contenido; el envío
MUST quedar fuera de su alcance. La única superficie entrante de Clara MUST ser
el canal Discord de staff y doctores autorizados.

#### Scenario: Clara no atiende WhatsApp

- GIVEN la configuración de Clara
- WHEN se inspeccionan sus canales entrantes
- THEN MUST NOT existir un canal de WhatsApp
- AND MUST NOT aceptar mensajes de pacientes

#### Scenario: Clara no envía mensajes

- GIVEN un borrador preparado por Clara
- WHEN no existe aprobación humana explícita del envío
- THEN Clara MUST NOT emitir ningún mensaje saliente
- AND MUST NOT registrar un envío hacia el paciente

### Requirement: Skills de apoyo cargables

Clara MUST exponer skills que documenten el flujo de revisión de la lista diaria
y las guías de redacción, cargables por el agente bajo demanda. Las skills MUST
ser documentación de apoyo y MUST NOT redefinir reglas, umbrales, deduplicación,
prioridad ni orden de la lista.

#### Scenario: La skill del flujo de seguimiento está disponible

- GIVEN una sesión de Clara
- WHEN el agente solicita el flujo de revisión de la lista diaria
- THEN la skill del flujo de seguimiento MUST estar disponible
- AND MUST describir el paso a paso de la revisión

#### Scenario: La skill de redacción describe las restricciones del texto

- GIVEN una sesión de Clara
- WHEN el agente solicita las guías de redacción
- THEN la skill de redacción MUST estar disponible
- AND MUST describir el tono, la estructura y la longitud máxima del borrador

#### Scenario: Las skills no redefinen reglas deterministas

- GIVEN las skills de Clara
- WHEN se comparan con las reglas deterministas del seguimiento
- THEN las skills MUST NOT introducir umbrales, prioridades ni órdenes distintos

### Requirement: Idioma y tono de las respuestas

Las respuestas de Clara MUST estar en español de México, con un tono cálido y
profesional, y MUST NOT ejercer presión comercial ni juzgar al staff.

#### Scenario: Respuesta cálida y profesional en español de México

- GIVEN cualquier interacción con staff o doctores autorizados
- WHEN Clara compone una respuesta
- THEN la respuesta MUST estar en español de México
- AND el tono MUST ser cálido y profesional
- AND MUST NOT incluir presión comercial

### Requirement: Alcance limitado al seguimiento de pacientes

Clara MUST limitarse al seguimiento de pacientes. MUST NOT crear citas, MUST NOT
reemplazar el flujo de agenda existente, MUST NOT cobrar, MUST NOT generar links
de pago y MUST NOT ejecutar acciones de otros agentes raíz.

#### Scenario: Una petición de agenda se deriva

- GIVEN una interacción que pide agendar una cita
- WHEN Clara responde
- THEN Clara MUST NOT crear la cita
- AND MUST remitir al flujo de agenda existente

#### Scenario: Una petición de cobranza queda fuera de alcance

- GIVEN una interacción que pide cobrar, registrar un pago o generar un link de pago
- WHEN Clara responde
- THEN Clara MUST NOT ejecutar ninguna acción de cobranza
- AND MUST remitir a la superficie correspondiente
