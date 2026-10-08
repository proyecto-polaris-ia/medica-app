# Delta Spec: Presentación de citas en la zona horaria del observador

**Change**: user-timezone-preferences
**Baseline**: `openspec/specs/appointments-calendar-view/spec.md`

## RENAMED Requirements

- FROM: `Clinic timezone rendering`
- TO: `Viewer timezone rendering`

## MODIFIED Requirements

### Requirement: Viewer timezone rendering

Las horas de las citas MUST presentarse en la zona horaria del usuario que ve la
página `/appointments`, en **todas** las vistas: la lista, el calendario, el
modal de edición y el expediente de paciente accesible desde esta página. La
captura `datetime-local` del modal MUST interpretarse como hora de la zona del
observador al convertirla al instante UTC almacenado, y MUST prellenarse desde el
instante UTC en la zona del observador. Cuando el observador no tenga preferencia
válida, su zona horaria MUST ser la zona de la clínica `America/Mexico_City`. La
UI de captura MUST mostrar explícitamente a qué zona horaria corresponde la hora
capturada. Esta presentación MUST NOT depender de la zona del dispositivo ni del
navegador.

#### Scenario: Misma cita, misma hora en lista y calendario
- GIVEN una cita almacenada como `timestamptz` para las 17:00 en `America/Mexico_City`
- AND un observador con preferencia `America/Los_Angeles`
- WHEN la lista y el calendario renderizan la cita
- THEN ambas vistas MUST mostrar la misma hora de pared en la zona del observador
- AND MUST NOT mostrar la hora del dispositivo ni una hora distinta entre vistas

#### Scenario: Editar sin cambiar la hora no mueve el instante
- GIVEN una cita almacenada para las 17:00 en `America/Mexico_City`
- AND un observador en otra zona horaria abre el modal de edición
- WHEN guarda el formulario sin tocar los campos de hora
- THEN los instantes UTC almacenados MUST permanecer sin cambios

#### Scenario: La hora capturada se interpreta como hora del observador
- GIVEN un observador con preferencia una hora adelantada respecto de la clínica
- WHEN captura "17:00" en el modal de edición
- THEN el sistema MUST almacenar el instante UTC correspondiente a las 17:00 en la zona del observador

#### Scenario: Observador sin preferencia usa la zona de la clínica
- GIVEN un observador sin preferencia válida
- WHEN la lista, el calendario y el modal presentan o capturan una hora
- THEN el sistema MUST usar `America/Mexico_City`

#### Scenario: La captura indica la zona horaria
- GIVEN un observador abre el modal de edición de una cita
- WHEN el formulario renderiza los campos de hora
- THEN la UI MUST indicar la zona horaria con la que se interpretará la hora capturada

#### Scenario: Frontera de horario de verano
- GIVEN una cita almacenada como `timestamptz` cerca de un cambio de horario de verano
- WHEN el calendario la renderiza
- THEN la hora de pared mostrada MUST ser correcta para la zona horaria del observador

#### Scenario: El expediente de paciente muestra la zona del observador
- GIVEN un expediente de paciente con visitas o citas renderizadas en el panel administrativo
- AND un observador en zona horaria distinta a `America/Mexico_City`
- WHEN las columnas de fecha y hora se renderizan
- THEN el sistema MUST mostrar el instante en la zona horaria del observador
