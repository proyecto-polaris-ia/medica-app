# WhatsApp Onboarding Specification

## Purpose

Flujo conversacional determinista de onboarding pre-cita por WhatsApp (Eva): recolecta la historia clínica básica del paciente nuevo y completa sus datos generales antes de la primera cita. El LLM interpreta y redacta, pero el orden de las preguntas, el resumen y la escritura (única, atómica y con provenance de autoreporte) los decide el backend; una señal de urgencia escala a humano y pausa el onboarding.

## Requirements

### Requirement: Disparador determinista del onboarding

El sistema MUST iniciar el onboarding pre-cita únicamente cuando el paciente es
nuevo o no tiene fila en `patient_medical_history` **y** además tiene una cita
futura en estado `confirmed` o `pending`. El sistema MUST NOT iniciar el
onboarding cuando el paciente ya tiene fila en `patient_medical_history`, ni
cuando no tiene una cita futura en estado `confirmed` o `pending`.

#### Scenario: Paciente nuevo con cita futura

- GIVEN un paciente sin fila en `patient_medical_history`
- AND una cita futura del paciente en estado `confirmed` o `pending`
- WHEN el sistema evalúa si corresponde iniciar el onboarding
- THEN el onboarding MUST iniciarse

#### Scenario: Paciente con historia clínica existente

- GIVEN un paciente que ya tiene fila en `patient_medical_history`
- AND una cita futura del paciente en estado `confirmed` o `pending`
- WHEN el sistema evalúa si corresponde iniciar el onboarding
- THEN el onboarding MUST NOT iniciarse

#### Scenario: Paciente sin cita futura

- GIVEN un paciente sin fila en `patient_medical_history`
- AND el paciente no tiene ninguna cita futura en estado `confirmed` o `pending`
- WHEN el sistema evalúa si corresponde iniciar el onboarding
- THEN el onboarding MUST NOT iniciarse

### Requirement: Preguntas cerradas literales en orden determinista

El onboarding MUST formular la información clínica básica mediante preguntas
cerradas y literales, una por turno, en un orden fijo y determinista: alergias
(sí/no y, si aplica, cuáles), medicamentos actuales (sí/no y, si aplica, cuáles),
condiciones médicas relevantes (sí/no y, si aplica, cuál), embarazo solo cuando
aplique, y hábitos con opciones cerradas. El LLM MUST limitarse a redactar; el
orden de las preguntas y las transiciones de estado MUST ser deterministas y MUST
NOT depender de una decisión del LLM.

#### Scenario: El LLM no puede saltar ni reordenar pasos

- GIVEN un onboarding en curso en el paso de alergias
- WHEN el LLM produce una respuesta que intenta avanzar al paso de embarazo
- THEN el sistema MUST NOT saltar pasos
- AND el sistema MUST continuar en el siguiente paso definido por el orden determinista

#### Scenario: Respuesta "no" omite la pregunta de detalle

- GIVEN el onboarding en el paso de alergias
- WHEN el paciente responde que no tiene alergias
- THEN el sistema MUST omitir la pregunta de cuáles alergias
- AND el sistema MUST avanzar al siguiente paso del orden determinista

### Requirement: Resumen fiel y confirmación explícita antes de guardar

Al terminar la recolección, el sistema MUST mostrar un resumen fiel de lo
capturado tal como lo expresó el paciente y MUST solicitar una confirmación
explícita. La persistencia de la historia clínica MUST ocurrir únicamente
después de esa confirmación. Ante un rechazo o una corrección, el sistema MUST
volver a preguntar el dato corregido o reiniciar el flujo conforme a sus reglas,
y MUST NOT guardar. Si el paciente abandona el flujo a medio onboarding, el
sistema MUST NOT escribir nada.

#### Scenario: La confirmación habilita el guardado

- GIVEN un onboarding que llegó al resumen final
- WHEN el paciente confirma explícitamente el resumen
- THEN el sistema MUST proceder a guardar la historia clínica

#### Scenario: Rechazo o corrección del resumen

- GIVEN un onboarding que llegó al resumen final
- WHEN el paciente rechaza el resumen o corrige algún dato
- THEN el sistema MUST volver a preguntar el dato corregido o reiniciar el flujo según sus reglas
- AND el sistema MUST NOT guardar la historia clínica todavía

#### Scenario: Abandono a medio flujo

- GIVEN un onboarding en curso sin confirmación del resumen
- WHEN el paciente abandona la conversación
- THEN el sistema MUST NOT escribir datos de historia clínica

### Requirement: Escritura única, atómica y con provenance de autoreporte

La historia clínica capturada por WhatsApp MUST guardarse una sola vez y
all-or-nothing, después de la confirmación del resumen. El sistema MUST NOT
escribir parcialmente durante la conversación. Toda historia capturada por
WhatsApp MUST persistirse marcada como autoreporte del paciente mediante la
columna aditiva de procedencia (`source`), cuyos valores distinguen el
autoreporte del paciente de la captura por staff.

#### Scenario: Resumen confirmado produce una única escritura completa

- GIVEN un onboarding confirmado con todos los datos capturados
- WHEN el sistema guarda la historia clínica
- THEN la historia clínica MUST escribirse una sola vez
- AND la escritura MUST ser completa y atómica

#### Scenario: No hay escrituras parciales durante la conversación

- GIVEN un onboarding en curso en un paso intermedio
- WHEN el sistema procesa cada respuesta del paciente antes de la confirmación
- THEN el sistema MUST NOT escribir la historia clínica

#### Scenario: La historia capturada por WhatsApp queda marcada como autoreporte

- GIVEN una historia clínica capturada y confirmada por WhatsApp
- WHEN el sistema la persiste
- THEN el registro almacenado MUST llevar la procedencia de autoreporte del paciente

### Requirement: Escalación inmediata ante señal de urgencia con pausa del onboarding

Cuando una respuesta sugiera urgencia (dolor fuerte, inflamación severa, alergia
a anestesia u otra señal de urgencia), el sistema MUST escalar de inmediato a un
humano y MUST pausar o abortar el onboarding. Después de una señal de urgencia,
el sistema MUST NOT continuar recolectando ni escribir historia clínica alguna.

#### Scenario: Respuesta urgente a medio flujo

- GIVEN un onboarding en curso
- WHEN el paciente reporta una señal de urgencia como dolor fuerte, inflamación severa o alergia a anestesia
- THEN el sistema MUST escalar de inmediato a un humano
- AND el sistema MUST pausar o abortar el onboarding
- AND el sistema MUST NOT escribir historia clínica

### Requirement: Escritura clínica limitada al teléfono confiable del paciente

La escritura de historia clínica MUST ocurrir únicamente cuando el canal cuenta
con el teléfono confiable del propio paciente. El sistema MUST NOT escribir
historia clínica sobre la identidad de un tercero. Sin teléfono confiable del
paciente, el sistema MUST NOT escribir y MUST escalar a humano o aplicar la
política de fallback existente.

#### Scenario: Teléfono confiable presente

- GIVEN un canal con el teléfono confiable del propio paciente
- AND un onboarding confirmado
- WHEN el sistema guarda la historia clínica
- THEN la escritura MUST permitirse

#### Scenario: Sin teléfono confiable no hay escritura

- GIVEN un canal sin el teléfono confiable del propio paciente
- WHEN un onboarding confirma un resumen
- THEN el sistema MUST NOT escribir historia clínica
- AND el sistema MUST escalar a humano o aplicar la política de fallback existente

### Requirement: Activación por feature flag de onboarding

El onboarding MUST ejecutarse únicamente cuando el feature flag de onboarding
está habilitado. Con el flag deshabilitado, el comportamiento MUST ser idéntico
al actual: sin mensajes ni preguntas de onboarding.

#### Scenario: Flag apagado conserva el comportamiento actual

- GIVEN el feature flag de onboarding deshabilitado
- WHEN un paciente envía un mensaje al consultorio
- THEN el sistema MUST seguir el path actual de clasificación y reserva
- AND el sistema MUST NOT enviar mensajes ni preguntas de onboarding

#### Scenario: Flag encendido habilita el onboarding

- GIVEN el feature flag de onboarding habilitado
- AND un paciente que cumple el disparador del onboarding
- WHEN el paciente envía un mensaje al consultorio
- THEN el sistema MUST poder iniciar el onboarding

### Requirement: Continuidad y expiración del estado del flujo

El estado de la conversación de onboarding MUST persistirse para que un
onboarding en curso continúe en el siguiente mensaje dentro del tiempo de espera
(timeout) vigente. Cuando el tiempo de espera expira, el sistema MUST limpiar el
estado y MUST reclasificar al paciente de forma normal, sin retomar el onboarding
incompleto.

#### Scenario: Continuación dentro del tiempo de espera

- GIVEN un onboarding en curso con estado persistido
- WHEN el paciente responde dentro del tiempo de espera vigente
- THEN el sistema MUST continuar el onboarding desde el paso guardado

#### Scenario: Expiración tras el tiempo de espera

- GIVEN un onboarding en curso cuyo estado supera el tiempo de espera vigente
- WHEN el sistema procesa un nuevo mensaje del paciente
- THEN el sistema MUST limpiar el estado del flujo
- AND el sistema MUST reclasificar al paciente de forma normal

## Notes

- El orden determinista de los pasos y las listas capturadas viven en el estado del
  flujo (metadata), no en decisiones del LLM.
- La procedencia de la historia clínica se agrega como columna aditiva `source`
  (ver la capability `clinical-record`); aquí solo se declara su comportamiento
  observable.
- Anclas de implementación (solo referencia): `src/lib/flows/definitions/onboarding.flow.ts`,
  `src/lib/whatsapp/orchestrator.ts`, `src/lib/whatsapp/inbound-service.ts`.
