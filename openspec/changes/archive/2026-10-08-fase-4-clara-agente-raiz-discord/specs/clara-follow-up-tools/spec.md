# Delta para clara-follow-up-tools (issue #161, Fase 4)

Capability nueva: conjunto de tools conversacionales de Clara que envuelven la
lógica determinista ya existente de seguimiento de pacientes. Las tools agregan
una superficie conversacional sobre código probado; NO mueven, NO duplican y NO
reimplementan las reglas, la deduplicación, la prioridad ni el orden. Las tools
de envío quedan explícitamente fuera del set.

## Contexto de decisiones resueltas (no normativo)

- Set de tools de lectura: `list-follow-up-cases`, `get-follow-up-rules` y
  `get-follow-up-draft`; el conocimiento de reglas se expone como tool de solo
  lectura para que la explicación salga del código y no del prompt.
- Set de tools de escritura: `draft-follow-up-message`,
  `transition-follow-up-draft` (solo `approved`/`rejected`),
  `mark-contact-attempted` y `dismiss-follow-up`.
- Fuera del set, siempre: reclamo para envío, marcado de enviado, marcado de
  envío fallido y cualquier envío por WhatsApp.
- Fuente del estado de contacto: `follow_up_contacts` vía `markFollowUpContact`.
  Fuente de los borradores: `follow_up_message_drafts`.
- La capability `follow-up` NO recibe delta: el principal de Discord autorizado
  queda contenido aquí y las reglas permanecen invariantes.

## ADDED Requirements

### Requirement: Reutilización de la lógica determinista del seguimiento

Las tools de Clara MUST consumir la lógica existente de seguimiento como fuente
única de verdad y MUST importarla sin moverla ni duplicarla. Las reglas de
segmentación, los umbrales, la deduplicación por paciente, la prioridad de
motivos y el orden canónico MUST NOT reimplementarse en Clara. Para la misma
fecha de referencia y los mismos datos, la lista obtenida por Clara MUST ser
idéntica a la del panel admin.

#### Scenario: La lista de Clara es idéntica a la del panel

- GIVEN la misma fecha de referencia y los mismos datos de citas, planes, visitas y pacientes
- WHEN la lista del día se obtiene por Clara y por el panel admin
- THEN ambas listas MUST contener los mismos pacientes, con los mismos motivos principales y el mismo orden

#### Scenario: Las reglas no se duplican

- GIVEN una actualización futura de las reglas del módulo de seguimiento
- WHEN se consulta la lista o las reglas a través de Clara
- THEN el resultado MUST reflejar la lógica actualizada
- AND MUST NOT existir una copia paralela de esas reglas en Clara

### Requirement: Tool de lectura de la lista diaria

Clara MUST exponer una tool de solo lectura que devuelva los casos de la lista
del día de la ronda actual. La tool MUST excluir a los pacientes ya contactados o
descartados en la ronda actual y MUST NOT escribir ni modificar ningún dato.

#### Scenario: La lista se devuelve con su motivo principal

- GIVEN casos elegibles en la ronda actual
- WHEN el staff autorizado solicita la lista del día
- THEN la tool MUST devolver los casos con su motivo principal
- AND MUST NOT modificar ningún dato

#### Scenario: Los casos ya atendidos en la ronda se excluyen

- GIVEN un paciente contactado o descartado en la ronda actual
- WHEN el staff autorizado solicita la lista del día
- THEN ese paciente MUST NOT aparecer en la lista de la ronda

#### Scenario: La tool de lista es de solo lectura

- GIVEN cualquier ejecución de la tool de lista
- WHEN la tool termina
- THEN MUST NOT haberse escrito ni modificado ningún registro de pacientes, citas, planes, contactos o borradores

### Requirement: Tool de reglas de segmentación

Clara MUST exponer una tool de solo lectura que devuelva los umbrales, la
prioridad de motivos y la definición de la ronda tal como están definidos en el
código. Cuando Clara explique por qué un paciente está en la lista, la
explicación MUST basarse en la salida de esta tool; Clara MUST NOT enunciar
umbrales, prioridades ni definiciones distintos.

#### Scenario: La explicación se basa en la tool de reglas

- GIVEN una pregunta del staff sobre por qué un paciente está en la lista
- WHEN Clara responde
- THEN la explicación MUST basarse en la salida de la tool de reglas
- AND MUST NOT inventar criterios de segmentación

#### Scenario: Los valores de la tool coinciden con las constantes

- GIVEN la tool de reglas
- WHEN se comparan sus valores con las constantes vigentes del módulo de seguimiento
- THEN los valores MUST coincidir

#### Scenario: No se enuncian umbrales fuera de la tool

- GIVEN una pregunta del staff sobre umbrales o prioridad de motivos
- WHEN Clara responde
- THEN los valores enunciados MUST provenir de la tool de reglas
- AND MUST NOT enunciarse ningún valor fuera de esa salida

### Requirement: Tool de lectura del borrador existente

Clara MUST exponer una tool de solo lectura que devuelva el borrador existente de
un paciente en la ronda actual, cuando exista, para evitar duplicados. La tool
MUST NOT crear ni modificar borradores.

#### Scenario: El borrador existente se reporta

- GIVEN un paciente con un borrador ya generado en la ronda actual
- WHEN el staff autorizado consulta el borrador de ese paciente
- THEN la tool MUST devolver el borrador existente con su estado y su texto
- AND MUST NOT crear un segundo borrador

#### Scenario: Sin borrador se reporta limpiamente

- GIVEN un paciente sin borrador en la ronda actual
- WHEN el staff autorizado consulta el borrador de ese paciente
- THEN la tool MUST reportar que no existe borrador para la ronda
- AND MUST NOT modificar ningún dato

### Requirement: Tool de redacción y persistencia de borrador

Clara MUST exponer una tool que, a solicitud explícita del staff autorizado para
un paciente concreto, genere el texto del borrador y lo persista en estado
`draft`. La tool MUST conservar la plantilla determinista como fallback
obligatorio ante ausencia de llaves del LLM, falla, exceso de tiempo de espera o
salida que no cumpla los guardrails. La tool MUST revalidar los guardrails antes
de persistir y MUST ser idempotente por paciente y ronda: a lo sumo un borrador
por paciente y ronda. La tool MUST NOT generar borradores en lote ni de forma
automática.

#### Scenario: El borrador se genera bajo demanda para un paciente

- GIVEN un paciente con un caso en la lista del día
- WHEN el staff autorizado solicita el borrador de ese paciente
- THEN la tool MUST generar el texto para ese único paciente
- AND MUST persistir el borrador en estado `draft`

#### Scenario: Sin llaves del LLM el borrador sale por plantilla

- GIVEN un paciente en la lista del día
- AND no hay llaves del LLM de redacción configuradas
- WHEN el staff autorizado solicita el borrador
- THEN la tool MUST persistir un borrador en `draft` por plantilla determinista
- AND MUST NOT fallar la solicitud

#### Scenario: Una falla o exceso de tiempo de espera degrada a plantilla

- GIVEN un paciente en la lista del día
- WHEN la llamada al LLM falla o excede el tiempo de espera
- THEN la tool MUST persistir un borrador en `draft` por plantilla determinista

#### Scenario: Una salida inválida del LLM no se persiste

- GIVEN un paciente en la lista del día
- WHEN la salida del LLM viola un guardrail de texto
- THEN la salida del LLM MUST descartarse y MUST NOT persistirse
- AND la tool MUST persistir el borrador por plantilla determinista

#### Scenario: Un solo borrador por paciente y ronda

- GIVEN un paciente con un borrador ya generado en la ronda actual
- WHEN el staff autorizado vuelve a solicitar el borrador del mismo paciente
- THEN la tool MUST NOT crear un segundo borrador
- AND la clave de deduplicación MUST permanecer sin cambios

#### Scenario: No existe generación en lote

- GIVEN una lista del día con varios pacientes
- WHEN el staff autorizado abre la lista o pide el resumen
- THEN la tool MUST NOT generar borradores para todos los pacientes
- AND solo una solicitud explícita por paciente MAY generar su borrador

### Requirement: Tool de transición de borrador limitada a aprobado o rechazado

Clara MUST permitir, a solicitud explícita y humana del staff autorizado, la
transición de un borrador `draft → approved` o `draft → rejected`. La tool MUST
rechazar cualquier transición hacia `sent` o `sent_failed` y MUST NOT disparar
ningún envío. La aprobación MUST seguir siendo una decisión humana explícita y un
borrador ya en `approved`, `sent` o `sent_failed` MUST ser inmutable.

#### Scenario: La aprobación humana lleva a approved sin envío

- GIVEN un borrador en estado `draft`
- WHEN el staff autorizado lo aprueba explícitamente
- THEN el borrador MUST transicionar a `approved`
- AND MUST NOT enviarse ningún mensaje

#### Scenario: El rechazo lleva a rejected

- GIVEN un borrador en estado `draft`
- WHEN el staff autorizado lo rechaza explícitamente
- THEN el borrador MUST transicionar a `rejected`
- AND MUST NOT enviarse ningún mensaje

#### Scenario: Las transiciones de envío se rechazan

- GIVEN una solicitud de transición hacia `sent` o `sent_failed`
- WHEN la tool la recibe
- THEN la tool MUST rechazarla
- AND MUST NOT modificar el estado del borrador

#### Scenario: Un borrador aprobado o enviado es inmutable

- GIVEN un borrador en estado `approved`, `sent` o `sent_failed`
- WHEN el staff autorizado solicita una transición
- THEN la tool MUST rechazarla
- AND el texto y el estado del borrador MUST permanecer sin cambios

### Requirement: Tools de escritura deterministas con autorización fail-closed

Clara MUST exponer las acciones de escritura sobre el seguimiento como acciones
deterministas ejecutadas por el framework, nunca decididas por el texto del
modelo. Cada tool de escritura MUST ejecutarse solo para un principal de Discord
autorizado, MUST re-verificar la autorización desde el principal de la sesión
antes de escribir y MUST registrar quién ejecutó la acción. Una tool de escritura
invocada sin un principal autorizado MUST negarse sin escribir. Las marcas de
contactado y descartado MUST ser idempotentes dentro de la ronda.

#### Scenario: Marcar contactado persiste el estado y el actor

- GIVEN un principal de Discord autorizado y un paciente en la lista del día
- WHEN el staff marca el caso como contactado
- THEN la tool MUST persistir el estado contactado con su instante y el actor que la ejecutó
- AND el paciente MUST NOT reaparecer en la lista de esa ronda

#### Scenario: Descartar persiste el estado y el actor

- GIVEN un principal de Discord autorizado y un paciente en la lista del día
- WHEN el staff descarta el caso
- THEN la tool MUST persistir el estado descartado con el actor que la ejecutó
- AND el paciente MUST NOT reaparecer en la lista de esa ronda

#### Scenario: Sin autorización no hay escritura

- GIVEN una invocación sin un principal de Discord autorizado
- WHEN se ejecuta una tool de escritura
- THEN la tool MUST negarse
- AND MUST NOT escribir ni modificar ningún dato de seguimiento

#### Scenario: La marca repetida no duplica el registro

- GIVEN un caso ya marcado en la ronda actual
- WHEN se repite la misma marca en la misma ronda
- THEN la tool MUST NOT duplicar el registro del estado de contacto

#### Scenario: El texto del modelo no decide la escritura

- GIVEN una conversación que pide marcar un caso sin que el staff lo confirme explícitamente
- WHEN el modelo sugiere ejecutar la marca
- THEN la acción de escritura MUST ejecutarse solo si el staff autorizado la solicita
- AND la autorización MUST provenir del principal de la sesión, no del texto del modelo

### Requirement: Fuente única del estado de contacto y de los borradores

El estado de contacto (contactado o descartado) MUST persistirse en
`follow_up_contacts` a través del camino determinista existente. Los borradores
MUST persistirse en `follow_up_message_drafts`. Las tools MUST NOT escribir el
estado de contacto en `follow_up_message_drafts` ni inferir el estado de
contacto a partir de los borradores.

#### Scenario: La marca se escribe en follow_up_contacts

- GIVEN una marca de contactado o descartado
- WHEN la tool la persiste
- THEN el estado MUST escribirse en `follow_up_contacts`
- AND MUST NOT escribirse como estado de contacto en `follow_up_message_drafts`

#### Scenario: La exclusión de la ronda deriva del estado de contacto

- GIVEN la lista de la ronda actual
- WHEN se excluye a un paciente ya contactado o descartado
- THEN la exclusión MUST derivarse del estado persistido en `follow_up_contacts`

#### Scenario: Un borrador no altera el estado de contacto

- GIVEN un borrador generado o editado para un caso
- WHEN se consulta el estado de contacto de ese caso
- THEN el borrador MUST NOT haber alterado el estado de contacto

### Requirement: El envío queda fuera del set de tools

Ninguna tool de Clara MUST exponer el envío de borradores ni las operaciones de
reclamo para envío, marcado de enviado o marcado de envío fallido. El envío
MUST seguir ocurriendo únicamente por el transporte de WhatsApp existente y solo
tras aprobación humana explícita fuera de Clara.

#### Scenario: El catálogo de tools no incluye el envío

- GIVEN el catálogo de tools expuesto por Clara
- WHEN se inspecciona
- THEN MUST NOT incluir ninguna tool de envío
- AND MUST NOT incluir reclamo para envío, marcado de enviado ni marcado de envío fallido

#### Scenario: Una instrucción de enviar no produce un envío

- GIVEN una instrucción en lenguaje natural que pide enviar el borrador
- WHEN Clara responde
- THEN Clara MUST NOT emitir ningún mensaje saliente
- AND MUST NOT registrar un envío
- AND MUST indicar que el envío se realiza por el flujo humano existente

#### Scenario: La aprobación en Clara no envía

- GIVEN un borrador aprobado desde la superficie de Clara
- WHEN Clara termina su turno
- THEN MUST NOT haberse emitido ningún mensaje hacia el paciente
- AND el borrador MUST permanecer disponible para el envío humano por el transporte existente

### Requirement: Solo datos de la base y sin fuga entre pacientes

Toda tool de Clara MUST devolver datos derivados de la base de datos y MUST NOT
inventar pacientes, motivos, borradores ni estados. Ante una falla de lectura o
escritura, la tool MUST reportar el error de forma explícita. Las tools MUST
limitarse al caso o paciente solicitado y MUST NOT exponer datos de otros
pacientes.

#### Scenario: Una falla de la base se reporta sin inventar datos

- GIVEN una falla de lectura en la base de datos
- WHEN se ejecuta una tool de Clara
- THEN la tool MUST reportar el error de forma explícita
- AND MUST NOT devolver pacientes, motivos ni borradores inventados

#### Scenario: No se filtran datos de otros pacientes

- GIVEN una consulta enfocada en un paciente concreto
- WHEN la tool devuelve el resultado
- THEN MUST limitarse a ese paciente y su caso
- AND MUST NOT exponer información de otros pacientes
