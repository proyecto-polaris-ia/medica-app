# Appointment Reminders Specification

## Purpose

Recordar de forma proactiva, por WhatsApp, las citas próximas del consultorio
dental para reducir las inasistencias, sin depender de que el paciente inicie la
conversación. La capacidad envía recordatorios deterministas e idempotentes en
dos cadencias (24 a 36 horas antes y la mañana del día de la cita), respeta el
opt-out del contacto, puede deshabilitarse por configuración y puede operar en
modo simulación sin enviar mensajes reales.

## ADDED Requirements

### Requirement: Recordatorio 24 a 36 horas antes

El sistema MUST enviar un recordatorio por WhatsApp a cada cita sin confirmar
cuyo inicio esté dentro de la ventana de 24 a 36 horas antes de la cita. El
sistema MUST NOT enviar recordatorios a citas en estado cancelado, reprogramado,
atendido o inasistido, ni a citas sin paciente relacionado o sin teléfono de
contacto.

#### Scenario: Cita sin confirmar dentro de la ventana de 24 a 36 horas

- GIVEN una cita sin confirmar cuyo inicio está dentro de la ventana de 24 a 36 horas
- WHEN corre la cadencia de recordatorio de 24 a 36 horas antes
- THEN el sistema MUST enviar un recordatorio por WhatsApp a esa cita

#### Scenario: Cita fuera de la ventana no recibe recordatorio

- GIVEN una cita sin confirmar cuyo inicio está fuera de la ventana de 24 a 36 horas
- WHEN corre la cadencia de recordatorio de 24 a 36 horas antes
- THEN el sistema MUST NOT enviar recordatorio a esa cita

#### Scenario: Estados de cita excluidos no reciben recordatorio

- GIVEN una cita cancelada, reprogramada, atendida o inasistida
- WHEN corre cualquier cadencia de recordatorio
- THEN el sistema MUST NOT enviar recordatorio a esa cita

#### Scenario: Cita sin paciente o sin teléfono no recibe recordatorio

- GIVEN una cita sin paciente relacionado o sin teléfono de contacto
- WHEN corre cualquier cadencia de recordatorio
- THEN el sistema MUST NOT enviar recordatorio

### Requirement: Recordatorio la mañana del día de la cita

El sistema MUST enviar un segundo recordatorio la mañana del día de la cita
únicamente si la cita sigue sin confirmar. Una cita MUST recibir como máximo un
recordatorio por cadencia.

#### Scenario: Cita aún sin confirmar el día de la cita

- GIVEN una cita sin confirmar cuya fecha corresponde al día clínico actual
- WHEN corre la cadencia matutina del día de la cita
- THEN el sistema MUST enviar un recordatorio por WhatsApp

#### Scenario: Cita ya confirmada no recibe el recordatorio del día mismo

- GIVEN una cita ya confirmada cuya fecha corresponde al día clínico actual
- WHEN corre la cadencia matutina del día de la cita
- THEN el sistema MUST NOT enviar el recordatorio del día mismo

#### Scenario: El paciente no recibe ambos recordatorios más de una vez por cadencia

- GIVEN una cita que ya recibió el recordatorio de 24 a 36 horas antes y sigue sin confirmar
- WHEN corre la cadencia matutina del día de la cita
- THEN el sistema MAY enviar un único recordatorio del día mismo
- AND MUST NOT enviar más de un recordatorio por esa cadencia

### Requirement: Idempotencia por cadencia

Si el proceso corre dos veces en la misma ventana, el sistema MUST NOT enviar
recordatorios duplicados. Cada cadencia MUST usar su propia llave de
deduplicación única por cita, de modo que los recordatorios de 24 a 36 horas
antes y del día mismo son independientes entre sí.

#### Scenario: Segunda corrida en la misma ventana no duplica

- GIVEN una cita que ya recibió el recordatorio de 24 a 36 horas antes
- WHEN el proceso vuelve a correr en la misma ventana
- THEN el sistema MUST NOT enviar otro recordatorio de 24 a 36 horas antes a esa cita

#### Scenario: Las cadencias se deduplican de forma independiente

- GIVEN una cita que ya recibió el recordatorio de 24 a 36 horas antes
- WHEN corre la cadencia matutina del día de la cita
- THEN el sistema MAY enviar el recordatorio del día mismo
- AND la llave de deduplicación de esa cadencia MUST ser distinta de la de 24 a 36 horas antes

### Requirement: Control de encendido y modo simulación

El sistema MAY estar deshabilitado por configuración. Cuando está deshabilitado
MUST NOT enviar ningún mensaje. Cuando corre en modo simulación MUST NOT enviar
mensajes reales, pero MUST registrar qué habría enviado. El modo simulación
SHALL ser fail-closed: ante configuración ausente o ambigua, el sistema MUST
asumir simulación.

#### Scenario: Recordatorios deshabilitados no envían nada

- GIVEN la función de recordatorios deshabilitada por configuración
- WHEN corre cualquier cadencia de recordatorio
- THEN el sistema MUST NOT enviar ningún mensaje

#### Scenario: Modo simulación registra sin enviar

- GIVEN el modo simulación activo
- WHEN corre cualquier cadencia de recordatorio
- THEN el sistema MUST NOT enviar mensajes reales
- AND MUST registrar los recordatorios que habría enviado

#### Scenario: Configuración ausente falla cerrado

- GIVEN configuración de modo simulación ausente o ambigua
- WHEN corre cualquier cadencia de recordatorio
- THEN el sistema MUST asumir modo simulación
- AND MUST NOT enviar mensajes reales

#### Scenario: Modo real envía solo con habilitación explícita

- GIVEN la función de recordatorios habilitada y el modo simulación apagado explícitamente
- WHEN corre una cadencia con citas elegibles
- THEN el sistema MUST enviar los recordatorios reales correspondientes

### Requirement: Seguridad del disparador programado

Las peticiones sin credencial válida del programador MUST ser rechazadas. Si la
credencial del programador no está configurada, el sistema MUST fallar cerrado:
MUST rechazar toda petición y MUST NOT realizar trabajo.

#### Scenario: Petición sin credencial válida es rechazada

- GIVEN una petición al disparador programado sin credencial válida
- WHEN llega la petición
- THEN el sistema MUST rechazarla
- AND MUST NOT enviar recordatorios ni registrar envíos

#### Scenario: Credencial no configurada falla cerrado

- GIVEN que la credencial del programador no está configurada
- WHEN llega cualquier petición al disparador programado
- THEN el sistema MUST rechazarla
- AND MUST NOT realizar ningún trabajo

### Requirement: Respeto al opt-out del contacto

Los contactos con opt-out MUST ser excluidos del envío de recordatorios. El
sistema MUST evaluar el opt-out del contacto por teléfono en cada corrida.

#### Scenario: Contacto con opt-out no recibe recordatorio

- GIVEN un contacto de WhatsApp con opt-out
- WHEN corre una cadencia con una cita elegible para ese contacto
- THEN el sistema MUST NOT enviar el recordatorio

#### Scenario: Opt-out registrado antes de la corrida excluye el envío

- GIVEN una cita elegible cuyo contacto registra opt-out antes de la corrida
- WHEN corre la cadencia correspondiente
- THEN el sistema MUST NOT enviar el recordatorio

### Requirement: Zona horaria de la clínica

Todo cálculo de ventana, día clínico y formateo de fecha y hora MUST regirse por
la zona horaria `America/Mexico_City`, no por UTC. Los instantes de auditoría
MUST persistirse con zona horaria.

#### Scenario: Día clínico del recordatorio matutino

- GIVEN una cita cuya fecha local es el día `D`
- WHEN se evalúa la cadencia matutina mientras en UTC ya es el día siguiente
- THEN el sistema MUST usar el día clínico `D` en `America/Mexico_City`

#### Scenario: Ventana de 24 a 36 horas con hora de la clínica

- GIVEN una cita con hora de inicio en `America/Mexico_City`
- WHEN se calcula si cae dentro de la ventana de 24 a 36 horas
- THEN el sistema MUST calcular la ventana en `America/Mexico_City`

### Requirement: Auditoría de envíos

Cada intento de envío MUST quedar registrado con su resultado —enviado, fallido
o simulado— y su momento como instante con zona horaria.

#### Scenario: Intento enviado se registra

- GIVEN un recordatorio enviado con éxito
- WHEN termina el intento
- THEN el sistema MUST registrarlo como enviado con su momento

#### Scenario: Intento fallido se registra

- GIVEN un recordatorio que no pudo enviarse
- WHEN termina el intento
- THEN el sistema MUST registrarlo como fallido con su momento

#### Scenario: Intento simulado se registra

- GIVEN un recordatorio procesado en modo simulación
- WHEN termina el intento
- THEN el sistema MUST registrarlo como simulado con su momento

### Requirement: Degradación ante fallos del proveedor

Si el proveedor de WhatsApp no tiene la plantilla disponible o falla, el sistema
MUST registrar el fallo sin interrumpir el resto de los envíos de la corrida.

#### Scenario: Fallo de un envío no detiene la corrida

- GIVEN una corrida con varias citas elegibles
- WHEN el envío de una cita falla por indisponibilidad de plantilla o error del proveedor
- THEN el sistema MUST registrar el fallo de esa cita
- AND MUST continuar procesando las demás citas de la corrida

#### Scenario: Plantilla no disponible se trata como fallo registrado

- GIVEN que el proveedor no tiene disponible la plantilla de recordatorio
- WHEN corre una cadencia con citas elegibles
- THEN el sistema MUST registrar el fallo del intento
- AND MUST NOT interrumpir el resto de los envíos

### Requirement: Plantilla aprobada para mensajes proactivos

Los recordatorios proactivos MUST enviarse mediante una plantilla aprobada por el
proveedor (mensaje de plantilla), nunca como texto libre.

#### Scenario: Recordatorio proactivo usa plantilla aprobada

- GIVEN una cita elegible para recordatorio
- WHEN el sistema envía el recordatorio
- THEN el mensaje MUST enviarse mediante una plantilla aprobada
- AND MUST NOT enviarse como texto libre
