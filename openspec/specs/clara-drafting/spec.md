# Clara Drafting Specification

## Purpose

Permitir que un usuario admin autorizado redacte, bajo demanda por paciente, el
texto del borrador de seguimiento de la lista diaria, apoyándose opcionalmente en
un LLM y conservando siempre la plantilla determinista como fallback obligatorio.
La capacidad consume la lista del día en solo lectura: no altera sus reglas, su
deduplicación ni su orden, no tiene canal de WhatsApp propio, no envía nada por sí
misma y exige aprobación humana explícita antes de cualquier envío. Originada en la
change `clara-follow-up-draft-agent` (issue #148).

## Requirements

### Requirement: Redacción de borrador bajo demanda por paciente

El sistema MUST exponer una capacidad interna/admin de redacción que genera el
borrador de seguimiento de un paciente cuando un usuario autorizado lo solicita
explícitamente para ese caso. La capacidad MUST NOT generar borradores de forma
automática, programada ni en lote para toda la lista del día. Sin una solicitud
explícita no MUST existir ninguna llamada al LLM ni ningún borrador nuevo
persistido.

#### Scenario: La generación ocurre cuando el usuario la solicita para un paciente

- GIVEN un paciente con un caso en la lista del día
- WHEN el usuario autorizado solicita el borrador de ese paciente
- THEN el sistema MUST generar y persistir el borrador de ese paciente
- AND la solicitud MUST referirse a un solo paciente

#### Scenario: No existe generación en lote de toda la lista

- GIVEN una lista del día con varios pacientes
- WHEN la lista se genera o se abre en el panel
- THEN el sistema MUST NOT generar borradores para todos los pacientes de la lista

#### Scenario: Sin solicitud no hay redacción

- GIVEN una lista del día ya calculada
- WHEN transcurre el día sin que ningún usuario solicite borradores
- THEN el sistema MUST NOT llamar al LLM ni persistir borradores nuevos

### Requirement: Fallback determinista garantizado

Toda solicitud de borrador MUST terminar con un texto persistido en estado
`draft`. Ante ausencia de llaves del LLM, falla, exceso de tiempo de espera o
salida que no cumpla los guardrails, la capacidad MUST generar el borrador con la
plantilla determinista. Ninguna ejecución MUST dejar al paciente sin borrador por
causa del LLM.

#### Scenario: Sin llaves del LLM el borrador sale por plantilla

- GIVEN un paciente en la lista del día
- AND no hay llaves del LLM de redacción configuradas
- WHEN el usuario solicita el borrador
- THEN el sistema MUST persistir un borrador en `draft` por plantilla determinista
- AND MUST NOT fallar la solicitud del usuario

#### Scenario: Una falla del LLM no bloquea el borrador

- GIVEN un paciente en la lista del día
- WHEN la llamada al LLM falla
- THEN el sistema MUST persistir un borrador en `draft` por plantilla determinista

#### Scenario: Un exceso de tiempo de espera no bloquea el borrador

- GIVEN un paciente en la lista del día
- WHEN la llamada al LLM excede el tiempo de espera
- THEN el sistema MUST persistir un borrador en `draft` por plantilla determinista

#### Scenario: Una salida inválida del LLM degrada a plantilla

- GIVEN un paciente en la lista del día
- WHEN la salida del LLM no cumple los guardrails
- THEN la salida del LLM MUST descartarse y MUST NOT persistirse
- AND el sistema MUST persistir un borrador en `draft` por plantilla determinista

### Requirement: Aislamiento de las reglas de la lista

La capacidad de redacción MUST consumir la salida de `src/lib/admin/follow-up/`
en modo solo lectura. La composición de la lista, los umbrales, la deduplicación
por paciente, la prioridad de motivos y el orden canónico MUST NOT verse
afectados por la redacción ni por la salida del LLM. La lista del día MUST ser
idéntica con o sin la capacidad de redacción activa.

#### Scenario: La lista del día no cambia al generar borradores

- GIVEN la lista del día con su orden determinista
- WHEN se generan borradores para sus pacientes
- THEN la lista MUST conservar los mismos pacientes, motivos y orden
- AND la salida del LLM MUST NOT alterar la composición de la lista

#### Scenario: La redacción no escribe en las reglas ni en el estado de contacto

- GIVEN un paciente en la lista del día
- WHEN el usuario solicita y edita su borrador
- THEN el sistema MUST NOT modificar citas, planes de tratamiento ni el estado de
  contacto del caso
- AND el borrador MUST limitarse a `follow_up_message_drafts`

### Requirement: Texto asesor sin alterar el orden

Cualquier explicación o priorización que la capacidad agregue MUST ser texto
complementario de despliegue. Ese texto asesor MUST NOT reordenar la lista, MUST
NOT cambiar el motivo principal del caso ni MUST NOT modificar las prioridades
deterministas.

#### Scenario: El texto asesor no reordena la lista

- GIVEN la lista del día con su orden canónico
- WHEN la capacidad muestra texto asesor sobre el orden sugerido
- THEN el orden mostrado MUST ser idéntico al orden determinista
- AND el texto asesor MUST NOT provocar ningún reordenamiento

#### Scenario: El texto asesor no cambia el motivo principal

- GIVEN un caso con motivo principal determinista
- WHEN la capacidad agrega texto asesor sobre ese caso
- THEN el motivo principal MUST permanecer sin cambios

### Requirement: Edición humana con auditoría

Un usuario admin autorizado MAY editar el texto de un borrador mientras esté en
estado `draft`. La edición MUST persistir las columnas de auditoría `edited_by` y
`edited_at` en `follow_up_message_drafts` mediante una migración nueva, aditiva y
nullable. La edición MUST respetar los guardrails y MUST NOT habilitar
transiciones de estado distintas de las existentes.

#### Scenario: La edición en draft persiste el texto y la auditoría

- GIVEN un borrador en estado `draft`
- WHEN el usuario autorizado guarda un texto editado
- THEN el sistema MUST persistir el texto editado, `edited_by` y `edited_at`
- AND el borrador MUST permanecer en `draft`

#### Scenario: La edición fuera de draft se rechaza

- GIVEN un borrador en estado `approved`, `sent` o `sent_failed`
- WHEN el usuario autorizado intenta editar el texto
- THEN el sistema MUST rechazar la edición
- AND el texto del borrador MUST permanecer sin cambios

#### Scenario: El texto editado que viola un guardrail se rechaza

- GIVEN un borrador en estado `draft`
- WHEN el usuario autorizado guarda un texto con precio, término clínico, presión
  comercial o longitud excedida
- THEN el sistema MUST rechazar la edición
- AND MUST NOT persistir el texto inválido

#### Scenario: La migración de auditoría es aditiva y nullable

- GIVEN los borradores existentes antes de la migración
- WHEN el sistema aplica la migración de auditoría
- THEN `edited_by` y `edited_at` MUST existir y ser nullable
- AND los borradores existentes MUST conservar su texto y su estado sin cambios

### Requirement: Degradación por kill switch

El sistema MUST exponer una variable de entorno de kill switch que desactive el
camino LLM y fuerce la redacción por plantilla determinista. Con el kill switch
activo, el comportamiento MUST equivaler al flujo previo a esta capacidad y MUST
NOT modificar ningún dato existente.

#### Scenario: El kill switch activo fuerza la plantilla

- GIVEN el kill switch de redacción por LLM activo
- WHEN el usuario solicita el borrador de un paciente
- THEN el sistema MUST generar el texto por plantilla determinista
- AND MUST NOT llamar al LLM

#### Scenario: El kill switch activo no altera datos existentes

- GIVEN el kill switch de redacción por LLM activo
- WHEN se solicitan y editan borradores
- THEN el sistema MUST NOT modificar la lista del día, los borradores existentes
  ni el estado de contacto
- AND el comportamiento MUST ser idéntico al flujo previo a esta capacidad

#### Scenario: Con el kill switch apagado el LLM sigue con fallback

- GIVEN el kill switch de redacción por LLM apagado
- WHEN el usuario solicita el borrador de un paciente
- THEN el sistema MAY redactar con apoyo del LLM
- AND MUST conservar la plantilla determinista como fallback

### Requirement: Sin canal propio ni capacidad de envío

La capacidad de redacción de Clara MUST NOT tener binding de canal de WhatsApp ni
capacidad de envío. MUST NOT enviar ningún mensaje por sí misma. El envío de un
borrador MUST ocurrir únicamente por el transporte de WhatsApp existente y solo
tras aprobación humana explícita.

#### Scenario: La redacción no envía ningún WhatsApp

- GIVEN un borrador generado o editado por la capacidad
- WHEN el usuario no ha aprobado ni confirmado el envío
- THEN el sistema MUST NOT emitir ningún mensaje saliente al paciente
- AND MUST NOT registrar un envío `outbound` en `whatsapp_messages`

#### Scenario: La capacidad no expone un canal propio

- GIVEN la capacidad de redacción de Clara
- WHEN se inspecciona su configuración
- THEN MUST NOT exponer un canal de WhatsApp propio ni un binding de agente de
  mensajería
- AND MUST NOT aceptar mensajes entrantes de pacientes

#### Scenario: El envío sigue el flujo aprobado existente

- GIVEN un borrador en estado `approved`
- WHEN el usuario autorizado confirma el envío
- THEN el sistema MUST enviar por el transporte de WhatsApp existente
- AND la capacidad de redacción MUST NOT intervenir en el envío
