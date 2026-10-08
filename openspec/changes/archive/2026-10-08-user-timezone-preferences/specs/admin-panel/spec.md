# Delta Spec: Preferencia de zona horaria y presentación por observador

**Change**: user-timezone-preferences
**Baseline**: `openspec/specs/admin-panel/spec.md`

## ADDED Requirements

### Requirement: User timezone preference

El sistema MUST guardar una preferencia de zona horaria por usuario
autenticado. La preferencia MUST ser un identificador IANA válido (por ejemplo
`America/Mexico_City`, `America/Los_Angeles`, `Europe/Madrid`). Cuando el
usuario no tenga preferencia guardada, o el valor guardado no sea un
identificador IANA válido, el sistema MUST resolver su zona horaria como
`America/Mexico_City`. La preferencia MUST ser privada de cada usuario: un
usuario MUST NOT poder leer ni modificar la preferencia de otro usuario.

#### Scenario: Usuario sin preferencia usa el default de la clínica
- GIVEN un usuario autenticado que nunca guardó una zona horaria
- WHEN el sistema resuelve su zona horaria
- THEN el sistema MUST usar `America/Mexico_City`

#### Scenario: Preferencia inválida cae al default
- GIVEN un usuario con un valor guardado que no es un identificador IANA válido
- WHEN el sistema resuelve su zona horaria
- THEN el sistema MUST usar `America/Mexico_City`

#### Scenario: Cada usuario conserva su propia preferencia
- GIVEN dos usuarios autenticados con zonas horarias distintas
- WHEN cada uno abre el panel administrativo
- THEN cada uno MUST ver sus horarios en su propia zona horaria
- AND la preferencia de un usuario MUST NOT cambiar la del otro

#### Scenario: Preferencia privada
- GIVEN un usuario autenticado
- WHEN solicita o intenta modificar la preferencia de otro usuario
- THEN el sistema MUST NOT exponer ni modificar la preferencia ajena

### Requirement: Timezone preference settings UI

El panel administrativo MUST ofrecer a cada usuario autenticado una superficie
de configuración para ver y actualizar su propia zona horaria. La superficie
MUST presentar la zona horaria vigente (explícita o el default) y MUST permitir
seleccionar o capturar un identificador IANA. Al guardar un valor válido el
sistema MUST persistirlo y las vistas posteriores MUST usarlo. Ante un valor
inválido el sistema MUST rechazar el guardado con un mensaje claro y MUST NOT
sobrescribir la preferencia vigente.

#### Scenario: Cambiar la zona horaria propia
- GIVEN un usuario autenticado en la superficie de configuración
- WHEN selecciona una zona horaria válida y guarda
- THEN el sistema MUST persistir la preferencia
- AND las vistas posteriores del usuario MUST presentar los horarios en esa zona

#### Scenario: Valor inválido rechazado
- GIVEN un usuario captura un valor que no es una zona horaria IANA válida
- WHEN intenta guardarlo
- THEN el sistema MUST mostrar un mensaje de error
- AND MUST NOT modificar la preferencia previamente guardada

#### Scenario: La configuración muestra el default cuando no hay preferencia
- GIVEN un usuario autenticado sin preferencia guardada
- WHEN abre la superficie de configuración
- THEN el sistema MUST mostrar `America/Mexico_City` como valor vigente

### Requirement: Viewer timezone for admin date presentation

Los surfaces administrativos que muestran la hora de reloj o la fecha de una
cita u otro instante MUST presentarlos en la zona horaria del usuario que los
ve, usando `America/Mexico_City` cuando el usuario no tenga preferencia válida.
Esto MUST aplicar, como mínimo, al snapshot de proveedor del dashboard, al
WhatsApp command center y a las superficies de expediente de paciente. Las
fechas sin componente de hora (por ejemplo, una fecha de calendario) MAY
presentarse como fecha de calendario. El sistema MUST NOT alterar el instante
persistido al presentarlo en otra zona.

#### Scenario: Snapshot de proveedor en la zona del observador
- GIVEN un usuario con preferencia `America/Los_Angeles`
- AND una cita almacenada para las 17:00 `America/Mexico_City`
- WHEN el snapshot del proveedor la muestra
- THEN el sistema MUST mostrar el mismo instante en la hora correspondiente a `America/Los_Angeles`

#### Scenario: Command center en la zona del observador
- GIVEN un usuario con preferencia distinta a la zona de la clínica
- WHEN el WhatsApp command center muestra la hora de una cita
- THEN el sistema MUST mostrarla en la zona horaria del usuario

#### Scenario: Expediente de paciente en la zona del observador
- GIVEN un usuario con preferencia distinta a la zona de la clínica
- WHEN una columna de fecha y hora del expediente de paciente se renderiza
- THEN el sistema MUST mostrar el instante en la zona horaria del usuario

#### Scenario: Observador en la zona de la clínica no ve cambios
- GIVEN un usuario sin preferencia o con preferencia `America/Mexico_City`
- WHEN cualquier surface administrativo muestra un instante
- THEN el sistema MUST mostrar la misma hora de pared que la convención de zona clínica vigente
