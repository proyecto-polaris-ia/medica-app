# Delta Spec: Lectura paginada de las citas del expediente del paciente

**Change**: agregar-paginacion-citas-expediente
**Capability**: `patient-record-appointments` (nueva)
**Baseline**: capacidad nueva; no existe spec previa en `openspec/specs/`

Alcance: los endpoints paginados de citas futuras y citas asistidas del
expediente y el comportamiento de ambas secciones en la UI. El resto del
expediente (datos del paciente, historia, consultas, planes, pagos, archivos)
sigue en la capacidad `patient-record-summary`.

## ADDED Requirements

### Requirement: Endpoint paginado de citas futuras del expediente

El sistema MUST exponer `GET /api/admin/patients/[id]/appointments/upcoming`
para usuarios administrativos autenticados. La respuesta MUST contener
`appointments` (máximo `pageSize` elementos) y `pagination` con `total`, `page`,
`pageSize` y `totalPages`. Las citas futuras MUST ser las del paciente con
`start_at` mayor o igual al momento de la consulta y con estado activo
(excluyendo `attended`, `cancelled`, `rescheduled` y `no_show`), ordenadas por
`start_at` ascendente. `total` MUST contar todas las citas futuras del paciente,
independientemente de la página solicitada.

#### Scenario: Primera página con valores por defecto

- GIVEN un administrador autenticado y un paciente con más de 10 citas futuras
- WHEN consulta el endpoint sin `page` ni `pageSize`
- THEN la respuesta MUST ser exitosa con `page` = 1, `pageSize` = 10
- AND `appointments` MUST contener las 10 citas futuras más próximas

#### Scenario: El total no depende de la página

- GIVEN un paciente con 47 citas futuras
- WHEN el administrador consulta la página 2 con `pageSize` = 10
- THEN `pagination.total` MUST ser 47
- AND `appointments` MUST contener como máximo 10 citas distintas de las de la página 1

### Requirement: Endpoint paginado de citas asistidas del expediente

El sistema MUST exponer `GET /api/admin/patients/[id]/appointments/attended`
para usuarios administrativos autenticados con la misma forma de respuesta
(`appointments` + `pagination`). Las citas asistidas MUST ser las del paciente
con estado `attended`, ordenadas por `start_at` descendente (la más reciente
primero).

#### Scenario: Historial ordenado del más reciente al más antiguo

- GIVEN un paciente con citas asistidas en fechas distintas
- WHEN el administrador consulta la primera página
- THEN la cita asistida más reciente MUST aparecer primero

#### Scenario: Paciente sin citas asistidas

- GIVEN un paciente sin citas con estado `attended`
- WHEN el administrador consulta el endpoint
- THEN `appointments` MUST ser un arreglo vacío
- AND `pagination.total` MUST ser 0

### Requirement: Validación de parámetros de paginación del expediente

Ambos endpoints del expediente MUST aceptar `page` (entero ≥ 1, default 1) y
`pageSize` (entero entre 1 y 50, default 10). Un parámetro fuera de rango o no
numérico MUST responder `400` sin exponer datos. Un `id` de paciente que no sea
UUID válido o no exista MUST responder `404`. Una petición sin sesión
administrativa válida MUST responder `401`.

#### Scenario: PageSize excedido responde 400

- GIVEN un administrador autenticado
- WHEN consulta cualquiera de los dos endpoints con `pageSize` = 51
- THEN la respuesta MUST ser `400`
- AND el cuerpo MUST NOT contener `appointments`

#### Scenario: Paciente inexistente responde 404

- GIVEN un administrador autenticado
- WHEN consulta los endpoints con un id de paciente que no existe
- THEN la respuesta MUST ser `404`

### Requirement: Secciones de citas paginadas e independientes en la vista

La pestaña `Citas` del expediente MUST renderizar la sección de citas futuras y
la de citas asistidas consumiendo sus endpoints paginados. Cada sección MUST
gestionar su número de página de forma independiente y MUST mostrar como máximo
`pageSize` filas. Cuando corresponde, cada sección MUST mostrar el control
`Pagination` (primera / anterior / indicador de página y total / siguiente /
última). El cambio de página en una sección MUST NOT alterar la página de la
otra.

#### Scenario: La paginación de una sección no afecta a la otra

- GIVEN un administrador en la pestaña `Citas` de un paciente con suficientes
  citas futuras y asistidas
- WHEN avanza a la página 3 de citas asistidas
- THEN la sección de citas futuras MUST permanecer en la página 1
- AND la sección de citas asistidas MUST mostrar las filas de su página 3

#### Scenario: El DOM queda acotado

- GIVEN un paciente con un historial largo de citas asistidas
- WHEN se renderiza la pestaña `Citas`
- THEN cada sección MUST mostrar como máximo `pageSize` filas de citas

### Requirement: Estados de carga y vacío por sección

Mientras una sección carga su página, la vista MUST mostrar un estado de carga
(skeleton de filas) sin ocultar la otra sección. Si la sección no tiene citas o
la página solicitada quedó fuera de rango, MUST mostrar su mensaje de estado
vacío actual ("No hay citas futuras para este paciente." /
"No hay citas asistidas registradas para este paciente.") y el control de
paginación MUST permanecer disponible para regresar a una página con resultados.

#### Scenario: Carga de una sección no bloquea la otra

- GIVEN el administrador cambia de página en citas futuras
- WHEN la sección está cargando
- THEN la sección MUST mostrar su skeleton
- AND la sección de citas asistidas MUST seguir mostrando sus filas

#### Scenario: Página fuera de rango muestra estado vacío

- GIVEN un administrador en la página 5 de citas asistidas cuando el total
  baja a menos de 4 páginas
- WHEN la sección recibe la respuesta de su página 5
- THEN la sección MUST mostrar el estado vacío
- AND el control de paginación MUST permitir regresar a una página con filas

### Requirement: Sincronía de la paginación con la URL en el expediente

En `/patients/[id]`, la pestaña `Citas` MUST reflejar las páginas activas como
`?upcomingPage=n&attendedPage=m`, omitiendo cada parámetro cuando vale `1`, con
estado local como fuente de verdad y `router.replace` (sin entradas nuevas de
historial). La URL MUST ser deep-linkeable: al recargar, cada sección MUST
inicializar su página desde su parámetro. La página activa MUST preservarse al
alternar de pestaña y volver. En `PatientRecordModal` la vista MUST usar estado
local y MUST NOT escribir parámetros de paginación en la URL.

#### Scenario: La página queda reflejada en la URL

- GIVEN un administrador en la pestaña `Citas` de `/patients/[id]`
- WHEN avanza a la página 2 de citas futuras
- THEN la URL MUST contener `upcomingPage=2`

#### Scenario: Deep link a páginas concretas

- GIVEN la URL `/patients/[id]?upcomingPage=2&attendedPage=3`
- WHEN un administrador autenticado abre el expediente
- THEN la sección de citas futuras MUST cargar su página 2
- AND la sección de citas asistidas MUST cargar su página 3

#### Scenario: El modal no escribe la URL

- GIVEN el expediente abierto como modal desde la lista de citas
- WHEN el administrador cambia de página en cualquiera de las secciones
- THEN la URL de `/appointments` MUST NOT ganar parámetros `upcomingPage` ni `attendedPage`
