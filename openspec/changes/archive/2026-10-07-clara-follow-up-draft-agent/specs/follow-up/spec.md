# Delta for follow-up

Este delta introduce la redacción asistida por LLM bajo demanda por paciente,
conservando la plantilla determinista como fallback obligatorio y sin tocar los
invariantes de la lista: los cuatro segmentos, la deduplicación por paciente con
motivo principal, el determinismo y umbrales configurables, la exclusión por
ronda y el envío solo tras aprobación por el transporte existente.

## Purpose (actualización al fusionar)

El párrafo de Purpose de `openspec/specs/follow-up/spec.md` MUST reemplazarse por
el texto siguiente, porque la redacción deja de ser exclusivamente determinista y
la redacción vigente ("El LLM no participa") contradice la redacción asistida por
LLM de esta capacidad:

> Convertir los datos ya existentes del consultorio dental (citas en estado
> `no_show`, planes de tratamiento, visitas clínicas y pacientes) en una lista
> diaria determinista de pacientes a contactar, con acciones manuales y
> borradores de mensaje que solo se envían tras aprobación humana explícita. Las
> reglas de segmentación, la deduplicación, la prioridad de motivos y el orden de
> la lista siguen siendo 100% deterministas y sin LLM: las reglas son puras, sin
> I/O ni relojes implícitos, el estado de contacto se persiste por ronda y ningún
> proceso automático envía mensajes. La redacción del texto del borrador MAY
> apoyarse en un LLM bajo demanda por paciente, con la plantilla determinista como
> fallback obligatorio y los mismos guardrails.

## MODIFIED Requirements

### Requirement: Generación de borrador determinista

El sistema MUST generar un borrador de mensaje de seguimiento por paciente a
partir del caso ya calculado de la lista del día. La redacción del texto MAY
apoyarse en un LLM bajo demanda por paciente y MUST conservar la plantilla
determinista como fallback obligatorio: si el LLM no está configurado, falla,
excede el tiempo de espera o su salida no cumple los guardrails, el borrador MUST
producirse por plantilla. La generación MUST realizarse bajo demanda por paciente
y MUST NOT ejecutarse en lote diario, de forma programada ni automática. El
borrador MUST corresponder al motivo principal del caso, con tono amable y en
español de México, y MUST NOT contener diagnósticos, consejos clínicos, presión
comercial ni precios. Todo borrador MUST persistirse en `follow_up_message_drafts`
con estatus `draft` y MUST conservar sin cambios la clave de deduplicación
`follow-up-draft:<patientId>:<roundDate>`.

#### Scenario: El borrador se redacta bajo demanda y corresponde al motivo

- GIVEN un paciente con un motivo principal en la lista del día
- AND el LLM de redacción está configurado y disponible
- WHEN el usuario solicita el borrador de ese paciente
- THEN el sistema MUST generar un borrador con apoyo del LLM
- AND el texto MUST corresponder al motivo del caso
- AND el borrador MUST persistirse con estatus `draft`

#### Scenario: Fallback determinista por plantilla sin LLM configurado

- GIVEN un paciente con un motivo principal en la lista del día
- AND no hay llaves del LLM de redacción configuradas
- WHEN el usuario solicita el borrador de ese paciente
- THEN el sistema MUST producir el texto por plantilla determinista
- AND el texto MUST corresponder al motivo del caso
- AND el borrador MUST persistirse con estatus `draft`

#### Scenario: Fallback determinista cuando el LLM falla o excede el tiempo de espera

- GIVEN un paciente con un motivo principal en la lista del día
- WHEN la llamada al LLM falla o excede el tiempo de espera
- THEN el sistema MUST producir el borrador por plantilla determinista
- AND el usuario MUST recibir un borrador en `draft` sin error bloqueante

#### Scenario: El borrador no incluye diagnósticos ni consejos clínicos

- GIVEN un borrador de seguimiento generado
- WHEN el sistema construye su texto
- THEN el texto MUST NOT contener diagnósticos ni consejos clínicos

#### Scenario: El borrador no incluye precios ni presión comercial

- GIVEN un borrador de seguimiento generado
- WHEN el sistema construye su texto
- THEN el texto MUST NOT contener precios ni presión comercial

#### Scenario: Un solo borrador por paciente y ronda

- GIVEN un paciente con un borrador ya generado en la ronda actual
- WHEN el usuario vuelve a solicitar el borrador del mismo paciente
- THEN el sistema MUST NOT crear un segundo borrador
- AND la clave de deduplicación MUST seguir siendo `follow-up-draft:<patientId>:<roundDate>`

### Requirement: Tono y guardrails de los textos

Los textos de seguimiento MUST tener tono de recordatorio amable y MUST estar en
español de México. MUST NOT contener diagnósticos, prescripciones, precios,
disponibilidad inventada ni presión comercial, y MUST respetar la longitud máxima
definida para el borrador. Los guardrails MUST aplicar por igual al texto
producido por plantilla y al redactado con apoyo de LLM. El sistema MUST
revalidar los guardrails antes de persistir el borrador y MUST revalidarlos de
nuevo antes de enviarlo. Una salida del LLM que no cumpla los guardrails MUST
descartarse: MUST NOT persistirse y MUST degradar al texto por plantilla
determinista.

#### Scenario: Tono amable en español de México

- GIVEN un texto de seguimiento generado
- WHEN el sistema lo redacta
- THEN el texto MUST usar español de México
- AND MUST mantener un tono de recordatorio amable

#### Scenario: Sin diagnósticos ni prescripciones

- GIVEN un texto de seguimiento generado
- WHEN el sistema lo redacta
- THEN el texto MUST NOT contener diagnósticos ni prescripciones de medicamentos

#### Scenario: Sin precios ni disponibilidad inventada

- GIVEN un texto de seguimiento generado
- WHEN el sistema lo redacta
- THEN el texto MUST NOT contener precios
- AND MUST NOT ofrecer disponibilidad de horarios no leída de la base de datos

#### Scenario: Los guardrails aplican igual al texto del LLM

- GIVEN un texto de seguimiento redactado con apoyo del LLM
- WHEN el sistema lo evalúa
- THEN MUST aplicar los mismos guardrails que al texto por plantilla
- AND MUST NOT persistir ningún texto que viole un guardrail

#### Scenario: Una salida inválida del LLM degrada a plantilla y no se persiste

- GIVEN un texto del LLM que viola un guardrail (precio, término clínico, presión
  comercial o longitud máxima)
- WHEN el sistema evalúa la salida antes de persistir
- THEN la salida del LLM MUST descartarse y MUST NOT persistirse
- AND el sistema MUST usar el texto por plantilla determinista

#### Scenario: Los guardrails se revalidan antes de enviar

- GIVEN un borrador en estado `approved`
- WHEN el usuario confirma el envío
- THEN el sistema MUST revalidar los guardrails sobre el texto antes de enviarlo
- AND un texto que viole un guardrail MUST NOT enviarse

### Requirement: Aprobación humana explícita del borrador

El borrador MUST requerir aprobación humana explícita y MUST seguir el ciclo de
vida `draft → approved/rejected → sent/sent_failed`, persistido en
`follow_up_message_drafts`. Mientras el borrador esté en `draft`, un usuario admin
autorizado MAY editar su texto; la edición MUST registrar quién y cuándo en las
columnas de auditoría `edited_by` y `edited_at` (migración aditiva nullable en
`follow_up_message_drafts`). La edición MUST NOT omitir la aprobación humana, MUST
NOT disparar ningún envío automático y MUST NOT reabrir borradores en `approved`,
`sent` o `sent_failed`, que MUST ser inmutables. El sistema MUST NOT enviar ningún
borrador de forma automática ni mediante cron mientras esté en `draft`.

#### Scenario: Un borrador nuevo queda en draft sin envío

- GIVEN un borrador de seguimiento recién generado
- WHEN el sistema lo persiste
- THEN el borrador MUST quedar en estado `draft`
- AND el sistema MUST NOT enviarlo

#### Scenario: La aprobación humana lleva a approved

- GIVEN un borrador en estado `draft`
- WHEN el usuario autenticado lo aprueba explícitamente
- THEN el borrador MUST transicionar a `approved`

#### Scenario: El rechazo humano lleva a rejected

- GIVEN un borrador en estado `draft`
- WHEN el usuario autenticado lo rechaza explícitamente
- THEN el borrador MUST transicionar a `rejected`
- AND el sistema MUST NOT enviarlo

#### Scenario: Ningún cron ni envío automático

- GIVEN un borrador en estado `draft`
- WHEN transcurre el tiempo o se ejecuta cualquier proceso programado
- THEN el sistema MUST NOT enviar el borrador
- AND el borrador MUST permanecer en `draft` hasta una decisión humana

#### Scenario: Edición del texto mientras el borrador está en draft

- GIVEN un borrador en estado `draft`
- WHEN el usuario autenticado guarda un texto editado
- THEN el sistema MUST persistir el texto editado
- AND el borrador MUST permanecer en estado `draft`

#### Scenario: La edición registra quién y cuándo

- GIVEN un borrador en estado `draft`
- WHEN el usuario autenticado guarda un texto editado
- THEN el sistema MUST persistir `edited_by` y `edited_at`
- AND la auditoría MUST corresponder al usuario y al instante de la edición

#### Scenario: La edición no omite la aprobación ni dispara envío

- GIVEN un borrador en estado `draft` con texto editado
- WHEN el usuario guarda la edición
- THEN el sistema MUST NOT enviar el borrador
- AND el borrador MUST seguir requiriendo una aprobación humana explícita

#### Scenario: Un borrador aprobado o enviado es inmutable

- GIVEN un borrador en estado `approved`, `sent` o `sent_failed`
- WHEN el usuario intenta editar su texto
- THEN el sistema MUST rechazar la edición
- AND el texto y la auditoría del borrador MUST permanecer sin cambios
