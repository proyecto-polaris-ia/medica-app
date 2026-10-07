# Nora Agent Specification

## Purpose

Capacidad interna determinista "agenda productiva" (Nora, Fase 3 del épico #140):
resume los indicadores de ocupación, no-show y huecos improductivos de la agenda,
y propone reacomodos de citas como sugerencias que SIEMPRE requieren confirmación
humana en el panel. Toda disponibilidad sale de la base de datos; Nora no
diagnostica, no cotiza, no comunica por WhatsApp y jamás reprograma una cita por
sí sola: la única ruta de aplicación es `rescheduleAppointment` tras una
aceptación explícita. Originada en la change `nora-agenda-productiva` (issue #149).

## Requirements

### Requirement: Indicadores de agenda productiva

El sistema MUST exponer en el panel administrativo indicadores de agenda
productiva para el rango seleccionado: por cada proveedor y cada día clínico,
los huecos improductivos detectados con su duración en minutos y el conteo de
huecos, además de los indicadores de ocupación y no-show ya existentes. El
sistema MUST reutilizar el motor de métricas de `dashboard-metrics`
(`computeMetrics`, `computeOccupancy`, `computeNoShow`) sin duplicar la
aritmética de ocupación ni la de no-show. Los indicadores MUST regirse por el
mismo rango (`preset` / `from` / `to`) que la sección de métricas. Cuando el
rango no tenga datos, la sección MUST mostrar un estado vacío en lugar de valores
inválidos.

#### Scenario: Huecos improductivos visibles por proveedor y día

- GIVEN un rango con `business_hours` cargados y un hueco detectado para un proveedor en un día
- WHEN el administrador abre la sección Nora con ese rango
- THEN el sistema MUST mostrar el hueco del proveedor y día con su duración en minutos y su conteo
- AND MUST mostrar los indicadores de ocupación y no-show del rango

#### Scenario: Reuso del motor de métricas

- GIVEN un rango con citas y `business_hours`
- WHEN el sistema calcula los indicadores de Nora
- THEN la ocupación y la tasa de no-show MUST ser las mismas que produce el motor de métricas de `dashboard-metrics`
- AND MUST NOT existir una segunda implementación de esos cálculos

#### Scenario: Estado vacío sin datos en el rango

- GIVEN un rango sin citas ni `business_hours`
- WHEN el administrador abre la sección Nora
- THEN el sistema MUST mostrar un estado vacío
- AND MUST NOT mostrar valores negativos, nulos ni huecos inventados

#### Scenario: Sin huecos cuando la agenda está llena

- GIVEN un rango cuyo `business_hours` está cubierto por citas activas
- WHEN el sistema calcula los indicadores de Nora
- THEN el sistema MUST reportar cero huecos improductivos
- AND MUST NOT reportar minutos improductivos negativos

#### Scenario: Cambio de rango recalcula los indicadores

- GIVEN un administrador viendo los indicadores de un rango
- WHEN selecciona otro rango en el selector
- THEN el sistema MUST recalcular los huecos y los indicadores para el nuevo rango

### Requirement: Detección determinista de huecos

El sistema MUST detectar los huecos como las ventanas de `business_hours` de un
proveedor menos las citas activas que las solapan, con la misma semántica de
"libre" que `booking_free_slots` (`0004_agenda_functions.sql`): una cita ocupa
salvo cuando su `status` es `cancelled` o `rescheduled`. Los huecos MUST calcularse
por proveedor y día clínico en `America/Mexico_City`. Cuando varias ventanas de
`business_hours` del mismo proveedor y día se solapen o toquen, el sistema MUST
unirlas antes de restar las citas, de modo que nunca se reporte un hueco
duplicado. Un hueco MUST considerarse improductivo solo cuando su duración alcance
el mínimo configurado; los tramos por debajo del mínimo MUST NOT contarse. El
cálculo MUST ser determinista y MUST NOT depender del reloj implícito.

#### Scenario: Hueco entre dos citas

- GIVEN un proveedor con una ventana de `business_hours` y dos citas activas separadas por un espacio libre
- WHEN el sistema detecta los huecos del día
- THEN el sistema MUST reportar un hueco entre ambas citas con la duración exacta del espacio libre

#### Scenario: Día completamente ocupado no tiene huecos

- GIVEN un proveedor cuya ventana de `business_hours` está cubierta de principio a fin por citas activas contiguas
- WHEN el sistema detecta los huecos del día
- THEN el sistema MUST reportar cero huecos

#### Scenario: Cita cancelada no ocupa

- GIVEN un proveedor con una cita en `status` `cancelled` dentro de su ventana de `business_hours`
- WHEN el sistema detecta los huecos del día
- THEN el tramo de esa cita MUST contar como hueco libre
- AND MUST NOT ocuparse

#### Scenario: Ventanas solapadas del mismo día se unen

- GIVEN un proveedor con dos ventanas de `business_hours` que se solapan en el mismo día
- WHEN el sistema detecta los huecos
- THEN el sistema MUST unir ambas ventanas antes de restar las citas
- AND MUST NOT reportar el traslape como dos huecos duplicados

#### Scenario: Tramo por debajo del mínimo no es improductivo

- GIVEN un espacio libre entre dos citas cuya duración es menor que el mínimo configurado
- WHEN el sistema clasifica los huecos
- THEN ese tramo MUST NOT contarse como hueco improductivo

#### Scenario: Cita que cruza el borde de la ventana

- GIVEN una cita activa que se solapa parcialmente con la ventana de `business_hours`
- WHEN el sistema detecta los huecos
- THEN el sistema MUST restar únicamente la porción que cae dentro de la ventana
- AND MUST NOT reportar como libre el tiempo ocupado

### Requirement: Generación de sugerencias de reacomodo

El sistema MUST generar sugerencias de reacomodo para las citas movibles, es
decir, las citas cuyo `status` sea `requested`, `pending` o `confirmed`. Cada
sugerencia MUST proponer mover una cita movible a un hueco libre **real** del
mismo proveedor cuya duración sea mayor o igual a la duración del servicio de la
cita. El sistema MUST NOT proponer huecos que no existan en la base de datos ni
inventar disponibilidad. Cada sugerencia MUST llevar un código de razón
determinista: `gap_before` cuando el hueco destino es anterior al inicio actual
de la cita, `gap_after` cuando es posterior, y `gap_between` cuando el hueco
destino queda entre dos citas activas del mismo día. La lista de sugerencias MUST
estar acotada y ordenada de forma determinista, y MUST NOT aplicarse
automáticamente.

#### Scenario: Sugerencia hacia un hueco real

- GIVEN una cita movible y un hueco libre del mismo proveedor con duración mayor o igual a la del servicio
- WHEN el sistema genera las sugerencias
- THEN el sistema MUST proponer mover la cita a ese hueco
- AND la hora propuesta MUST corresponder al inicio del hueco detectado en la base de datos

#### Scenario: Sin hueco suficiente no hay sugerencia

- GIVEN una cita movible para la cual ningún hueco del proveedor alcanza la duración del servicio
- WHEN el sistema genera las sugerencias
- THEN el sistema MUST NOT generar una sugerencia para esa cita

#### Scenario: No se propone huecos inventados

- GIVEN una agenda cargada desde la base de datos
- WHEN el sistema genera las sugerencias
- THEN toda hora sugerida MUST derivarse de un hueco calculado a partir de `business_hours` y citas reales
- AND MUST NOT proponerse una hora que no exista en la disponibilidad de la base de datos

#### Scenario: Códigos de razón deterministas

- GIVEN un hueco destino anterior al inicio actual de una cita movible
- WHEN el sistema genera la sugerencia
- THEN el código de razón MUST ser `gap_before`
- AND un hueco destino posterior MUST producir `gap_after` y un hueco entre dos citas activas MUST producir `gap_between`

#### Scenario: Lista acotada y orden determinista

- GIVEN una agenda con múltiples citas movibles y múltiples huecos candidatos
- WHEN el sistema genera las sugerencias
- THEN la lista MUST quedar acotada a un máximo configurado
- AND MUST presentarse en un orden determinista e independiente del orden de lectura de la base de datos

#### Scenario: Cita en estado terminal no es movible

- GIVEN una cita en `status` `cancelled`, `rescheduled`, `no_show` o `attended`
- WHEN el sistema genera las sugerencias
- THEN el sistema MUST NOT proponer una sugerencia para esa cita

### Requirement: Confirmación humana obligatoria

El flujo de sugerencias MUST requerir confirmación humana explícita en el panel.
El sistema MUST permitir únicamente **aceptar** o **rechazar** una sugerencia en
estado `proposed`, y MUST exigir un administrador autenticado. El sistema MUST NOT
modificar ninguna cita sin una confirmación humana explícita. Rechazar una
sugerencia MUST registrar la decisión sin mover la cita. Ninguna sugerencia MUST
aplicarse de forma automática ni diferida.

#### Scenario: Aceptar registra la decisión

- GIVEN una sugerencia en estado `proposed` y un administrador autenticado
- WHEN el administrador acepta la sugerencia
- THEN el sistema MUST registrar la decisión de aceptación
- AND MUST registrar quién decidió y cuándo

#### Scenario: Rechazar no mueve la cita

- GIVEN una sugerencia en estado `proposed` y un administrador autenticado
- WHEN el administrador rechaza la sugerencia
- THEN el sistema MUST marcar la sugerencia como rechazada
- AND MUST NOT modificar el horario ni el estado de la cita

#### Scenario: Se requiere administrador autenticado

- GIVEN una solicitud de aceptar o rechazar una sugerencia sin usuario autenticado
- WHEN el sistema procesa la solicitud
- THEN el sistema MUST rechazarla
- AND MUST NOT modificar la sugerencia ni la cita

#### Scenario: Sugerencia ya decidida no se re-decide

- GIVEN una sugerencia que ya no está en estado `proposed`
- WHEN el sistema procesa una nueva decisión sobre ella
- THEN el sistema MUST NOT volver a decidirla
- AND MUST NOT mover la cita asociada

#### Scenario: Nada se aplica sin confirmación

- GIVEN sugerencias generadas y no decididas por un humano
- WHEN el sistema termina de generarlas o de mostrarlas
- THEN el sistema MUST NOT modificar ninguna cita
- AND MUST NOT aplicar ninguna reprogramación

### Requirement: Aplicación vía rescheduleAppointment y ciclo de vida

Al aceptar una sugerencia, el sistema MUST aplicar la reprogramación
exclusivamente mediante `rescheduleAppointment` (`src/lib/booking/reschedule.ts`),
la única ruta de mutación de agenda, que es de uso administrativo y valida el
estado de la cita con guarda optimista. El sistema MUST aplicar la reunión de
forma que un horario ya ocupado produzca un conflicto en lugar de sobrescribir la
agenda. El sistema MUST marcar la sugerencia como `applied` únicamente después de
que la reprogramación tenga éxito; si la cita cambió de horario desde que se
generó la propuesta, el sistema MUST marcar la sugerencia como `expired` y MUST
NOT aplicarla. Al aplicar una sugerencia, el sistema MUST anexar a
`appointments.notes` una entrada de auditoría con marca de tiempo en
`America/Mexico_City`. El ciclo de vida de una sugerencia MUST ser
`proposed → accepted → applied`, o bien `proposed → rejected`, o bien
`proposed → expired`. El sistema MUST NOT modificar el enum `appointment_status`.

#### Scenario: Aceptar aplica y marca la sugerencia

- GIVEN una sugerencia aceptada cuya cita sigue en el horario original y cuyo hueco destino sigue libre
- WHEN el sistema aplica la sugerencia
- THEN el sistema MUST reprogramar la cita mediante `rescheduleAppointment`
- AND MUST marcar la sugerencia como `applied`

#### Scenario: Conflicto de horario no aplica

- GIVEN una sugerencia aceptada cuyo hueco destino ya fue ocupado por otra cita
- WHEN el sistema intenta aplicar la sugerencia
- THEN la reprogramación MUST fallar con conflicto
- AND el sistema MUST NOT sobrescribir la cita que ya ocupa el horario
- AND MUST NOT marcar la sugerencia como `applied`

#### Scenario: Cita movida desde la propuesta expira

- GIVEN una sugerencia aceptada cuya cita cambió de `start_at` o `end_at` después de generarse la propuesta
- WHEN el sistema intenta aplicar la sugerencia
- THEN el sistema MUST marcar la sugerencia como `expired`
- AND MUST NOT aplicar una reprogramación sobre el nuevo horario

#### Scenario: Rastro auditable con hora de la clínica

- GIVEN una sugerencia aplicada con éxito
- WHEN el sistema registra la aplicación
- THEN el sistema MUST anexar a `appointments.notes` una entrada con la marca de tiempo en `America/Mexico_City`
- AND MUST NOT sobrescribir el contenido previo de `notes`

#### Scenario: Estado de la cita intacto tras el reacomodo

- GIVEN una cita movible reprogramada por una sugerencia aplicada
- WHEN el sistema completa la aplicación
- THEN el `status` de la cita MUST conservar su valor dentro del conjunto
  `requested | pending | confirmed`
- AND el enum `appointment_status` MUST permanecer sin cambios

#### Scenario: Sugerencia expirada no se aplica

- GIVEN una sugerencia en estado `expired`
- WHEN el sistema procesa una decisión de aplicación
- THEN el sistema MUST NOT reprogramar la cita
- AND MUST NOT marcar la sugerencia como `applied`

### Requirement: Contrato de degradación y estados vacíos

El cargador de Nora MUST degradar de forma controlada y MUST NOT lanzar
excepciones hacia el server component. Cuando Supabase no esté configurado, el
sistema MUST reportar los indicadores y las sugerencias como no disponibles. Cuando
Supabase esté configurado pero la lectura falle, el sistema MUST reportar la
sección como no disponible sin romper la página. Cuando no haya datos o
sugerencias en el rango, el sistema MUST mostrar un estado vacío. El sistema MUST
NOT mostrar valores `null`, `undefined`, negativos ni porcentajes crudos.

#### Scenario: Supabase no configurado

- GIVEN un entorno sin configuración de Supabase
- WHEN el administrador abre el panel
- THEN el sistema MUST reportar los indicadores de Nora como no disponibles
- AND MUST NOT lanzar una excepción

#### Scenario: Supabase configurado pero no disponible

- GIVEN un entorno con Supabase configurado cuya lectura falla
- WHEN el administrador abre el panel
- THEN el sistema MUST mostrar el aviso de degradación de Nora
- AND MUST seguir mostrando el resto del panel sin romperse

#### Scenario: Rango sin datos

- GIVEN un rango sin citas ni `business_hours`
- WHEN el sistema resuelve los indicadores de Nora
- THEN el sistema MUST mostrar un estado vacío
- AND MUST NOT mostrar huecos inventados

#### Scenario: Sin sugerencias

- GIVEN un rango sin huecos candidatos o sin citas movibles
- WHEN el sistema resuelve las sugerencias
- THEN el sistema MUST mostrar un estado vacío de sugerencias
- AND MUST NOT mostrar una lista con valores inválidos

#### Scenario: Nunca lanza hacia el server component

- GIVEN cualquier fallo de lectura de Supabase
- WHEN el cargador de Nora resuelve la vista
- THEN el cargador MUST devolver una vista degradada
- AND MUST NOT propagar la excepción

### Requirement: Zona horaria America/Mexico_City

Todo cálculo de días clínicos, ventanas de `business_hours` y huecos MUST regirse
por la zona horaria `America/Mexico_City`, nunca por UTC del servidor. Las
sugerencias y el rastro de auditoría MUST expresarse con la hora de la clínica.

#### Scenario: Día clínico correcto cerca de medianoche

- GIVEN un instante cercano a la medianoche en el que en UTC ya es el día siguiente
- WHEN el sistema asigna el hueco a un día clínico
- THEN el sistema MUST usar el día en `America/Mexico_City`
- AND MUST NOT desplazar el hueco al día UTC del servidor

#### Scenario: Rastro con hora de la clínica

- GIVEN la aplicación de una sugerencia
- WHEN el sistema anexa la entrada de auditoría
- THEN la marca de tiempo MUST expresarse en `America/Mexico_City`

#### Scenario: Límites de ventana de `business_hours` en la zona de la clínica

- GIVEN una ventana de `business_hours` definida con horas locales
- WHEN el sistema calcula los huecos del día
- THEN el sistema MUST convertir los límites de la ventana con la zona `America/Mexico_City`
- AND MUST NOT interpretarlos como UTC del servidor

### Requirement: Invariantes de Nora

Nora MUST ser una capacidad determinista: toda la disponibilidad y los huecos MUST
salir de la base de datos, y el sistema MUST NOT decidir disponibilidad ni
escribirla por inferencia. El enum `appointment_status` MUST permanecer sin
cambios y la disponibilidad publicada (`business_hours`) MUST permanecer intacta.
El sistema MUST NOT modificar ninguna cita sin confirmación humana explícita. El
sistema MUST NOT comunicar sugerencias por WhatsApp, MUST NOT cotizar precios ni
diagnosticar.

#### Scenario: La disponibilidad sale de la base de datos

- GIVEN una agenda con `business_hours` y citas en la base de datos
- WHEN el sistema detecta huecos y genera sugerencias
- THEN toda disponibilidad y todo hueco MUST derivarse de la base de datos
- AND MUST NOT generarse por inferencia ni por azar

#### Scenario: El enum de estados no cambia

- GIVEN la migración de Nora aplicada
- WHEN se inspecciona el tipo `appointment_status`
- THEN el conjunto de valores del enum MUST permanecer sin cambios

#### Scenario: Sin mutación sin confirmación humana

- GIVEN una sugerencia generada pero no decidida
- WHEN el sistema completa su ciclo de generación y presentación
- THEN el sistema MUST NOT modificar ninguna cita
- AND MUST NOT aplicar ninguna reprogramación automática

#### Scenario: Disponibilidad publicada intacta

- GIVEN una sugerencia aceptada y aplicada
- WHEN el sistema termina la aplicación
- THEN las filas de `business_hours` MUST permanecer sin cambios
- AND el sistema MUST NOT crear, mover ni borrar disponibilidad publicada

#### Scenario: Sin comunicación por WhatsApp ni consejo clínico

- GIVEN una sugerencia generada para un paciente
- WHEN el sistema la presenta
- THEN la sugerencia MUST mostrarse solo en el panel administrativo
- AND el sistema MUST NOT enviarla por WhatsApp, cotizar precios ni emitir diagnóstico
