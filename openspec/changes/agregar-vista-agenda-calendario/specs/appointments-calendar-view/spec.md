# Delta para Appointments Calendar View

**Change**: agregar-vista-agenda-calendario (issue #176)
**Baseline**: `openspec/specs/appointments-calendar-view/spec.md`

> Este delta reemplaza el requirement del toggle de vistas y el requirement de
> filtros/peticiones de la agenda, y agrega el sub-toggle y la persistencia en
> URL. Los requirements de "Vista de agenda agrupada por día del mes visible",
> "Campos completos por cita en la agenda", "Días sin citas en la agenda",
> "Reutilización de edición y expediente desde la agenda", "Navegación de mes y
> botón 'Hoy' en la agenda" y "Presentación con scroll vertical y responsiva de
> la agenda" permanecen vigentes sin cambios en el baseline.

## MODIFIED Requirements

### Requirement: View toggle from appointments page
La página `/appointments` MUST ofrecer un toggle principal de dos opciones que
alterne entre la vista de lista existente (`DataTable`) y la vista de calendario.
La vista de calendario MUST ofrecer, a su vez, un sub-toggle para elegir entre la
cuadrícula mensual y la agenda (citas del mes agrupadas por día). El toggle
principal MUST NOT ofrecer "Agenda" como opción de primer nivel. Cada opción y
sub-opción MUST ser un control operable por teclado y MUST distinguirse cuando
está activa. El sub-toggle de modo MUST renderizarse únicamente cuando la vista
resuelta sea el calendario. La vista por defecto SHALL ser la lista y el modo por
defecto de la cuadrícula SHALL ser la grilla. Al alternar entre vistas y modos,
los filtros activos del calendario MUST conservarse y las vistas MUST compartir
los estados de carga y de error existentes.

#### Scenario: El toggle principal ofrece Lista y Calendario
- GIVEN un administrador autenticado en `/appointments`
- WHEN el toggle principal renderiza
- THEN MUST mostrar las opciones Lista y Calendario
- AND MUST NOT mostrar Agenda como opción de primer nivel
- AND cada opción MUST ser operable por teclado
- AND la opción activa MUST distinguirse de las demás

#### Scenario: El sub-toggle solo aparece en la vista de Calendario
- GIVEN un administrador en `/appointments` con la vista de Lista activa
- WHEN la página renderiza
- THEN el sub-toggle Grilla/Agenda MUST NOT renderizarse
- AND al activar Calendario el sub-toggle MUST renderizarse

#### Scenario: Toggle to calendar preserves filters
- GIVEN an authenticated admin on `/appointments` with a filter applied
- WHEN they activate the calendar toggle
- THEN the calendar MUST render and the applied filter MUST remain active

#### Scenario: Toggle back to list keeps session
- GIVEN the calendar is shown
- WHEN they switch back to the list
- THEN the `DataTable` MUST render with the same filters and no session loss

#### Scenario: Alternar a la agenda conserva los filtros del calendario
- GIVEN el calendario tiene una selección activa de proveedores o servicios
- WHEN el usuario activa la sub-opción Agenda
- THEN la agenda MUST renderizar con esa selección todavía aplicada
- AND al volver a Grilla la selección MUST conservarse

### Requirement: La agenda respeta los filtros y comparte los datos del calendario
La agenda MUST aplicar los mismos filtros multi-selección de proveedores y
servicios de la vista de calendario (#174/#177), de modo que solo muestre las
citas que cumplen ambos filtros cuando estén activos. La agenda y la cuadrícula
MUST consumir exactamente los mismos datos ya cargados para el mes visible, sin
disparar peticiones adicionales al backend. La navegación de mes con
`CalendarNav` en la agenda MUST compartir el mismo estado de mes visible y MUST
NOT provocar más de la petición de rango del mes correspondiente. Alternar entre
la sub-vista de grilla y la de agenda MUST NOT disparar una petición adicional
al backend ni alterar el mes visible ni los filtros activos.

#### Scenario: La agenda filtra por proveedor
- GIVEN el mes visible tiene citas de los proveedores A y B
- WHEN el usuario selecciona únicamente el proveedor A en el calendario
- THEN la agenda MUST mostrar solo las citas de A
- AND MUST NOT mostrar las citas de B

#### Scenario: La agenda compone los filtros de proveedor y servicio
- GIVEN un mes con una cita del servicio X del proveedor A y una cita del servicio Y del proveedor B
- WHEN el usuario selecciona el servicio X y el proveedor A
- THEN la agenda MUST mostrar únicamente la cita del servicio X con el proveedor A

#### Scenario: Cambiar de mes en la agenda no duplica peticiones
- GIVEN el usuario está en la vista de agenda de un mes ya cargado
- WHEN alterna a la vista de grilla y de regreso a la Agenda
- THEN ambas vistas MUST mostrar las citas del mismo mes visible
- AND MUST NOT dispararse una petición de rango adicional por el solo cambio de sub-vista

#### Scenario: Alternar Grilla ↔ Agenda no duplica la petición ni pierde el mes
- GIVEN el usuario está en la vista de Calendario con el mes de junio de 2026 cargado y filtros activos
- WHEN alterna de Grilla a Agenda y de regreso a Grilla
- THEN el mes visible MUST seguir siendo junio de 2026
- AND los filtros activos MUST conservarse
- AND MUST NOT dispararse una petición de rango adicional del mes por el solo cambio de sub-vista

## ADDED Requirements

### Requirement: Sub-toggle Grilla/Agenda dentro de la vista de Calendario
La vista de Calendario MUST exponer un sub-toggle con exactamente dos opciones,
**Grilla** y **Agenda**, para elegir la presentación del mes visible. `Grilla`
MUST ser el modo por defecto cuando no se especifique otro. La opción activa MUST
distinguirse visualmente y cada opción MUST exponer su estado mediante
`aria-pressed` y ser operable por teclado. El sub-toggle MUST renderizarse dentro
de la fila de navegación del calendario, compartiendo fila con el control de
mes/año, y MUST NOT renderizarse fuera de la vista de Calendario. Seleccionar
`Agenda` MUST renderizar la vista de agenda agrupada por día del mes visible;
seleccionar `Grilla` MUST renderizar la cuadrícula mensual.

#### Scenario: Existen exactamente dos modos y Grilla es el default
- GIVEN un administrador activa la vista de Calendario sin modo especificado
- WHEN la fila del calendario renderiza
- THEN el sub-toggle MUST ofrecer exactamente las opciones Grilla y Agenda
- AND Grilla MUST estar en estado activo (`aria-pressed="true"`)
- AND Agenda MUST estar en estado inactivo (`aria-pressed="false"`)

#### Scenario: Agenda es una sub-vista del Calendario, no del nivel superior
- GIVEN un administrador en la vista de Calendario con Grilla activa
- WHEN activa la opción Agenda del sub-toggle
- THEN la vista de agenda del mes visible MUST renderizarse
- AND la vista de Calendario MUST seguir siendo la vista principal activa

#### Scenario: El sub-toggle es operable por teclado y anuncia su estado
- GIVEN el sub-toggle Grilla/Agenda renderiza en la vista de Calendario
- WHEN el usuario navega con el teclado hasta una opción y la activa
- THEN la opción MUST ser operable por teclado
- AND MUST anunciar su estado mediante `aria-pressed`
- AND el estado anunciado MUST reflejar el modo aplicado

#### Scenario: El sub-toggle no se muestra fuera del calendario
- GIVEN un administrador en la vista de Lista
- WHEN la página renderiza
- THEN las opciones Grilla y Agenda MUST NOT estar disponibles
- AND el botón de primer nivel Agenda MUST NOT existir

### Requirement: Persistencia de la vista y el modo del calendario en la URL
La página `/appointments` MUST persistir la vista activa (`list` o `calendar`) en
el parámetro `view` y el modo del calendario (`grid` o `agenda`) en el parámetro
`mode` de la URL, siguiendo el patrón de inicialización única desde la URL y
actualización en el handler (sin efectos de sincronización). Un valor ausente o
inválido de `view` MUST resolverse a `list`, y un valor ausente o inválido de
`mode` MUST resolverse a `grid`. El parámetro `mode` MUST honrarse únicamente
cuando la vista resuelta sea `calendar`. La URL resultante MUST ser compartible
por enlace directo (deep link) y MUST restaurar la vista y el modo al recargar.

La página MUST mantener compatibilidad con el enlace legacy `?view=agenda`
(deep link de #175), interpretándolo como `view=calendar` con `mode=agenda` y
normalizando la URL a `?view=calendar&mode=agenda`. La persistencia de `view` y
`mode` MUST componerse en la misma URL con los filtros `providerId` y `serviceId`
y con `page`, sin eliminarlos ni sobrescribirlos.

#### Scenario: Deep link restaura el modo agenda
- GIVEN una URL `/appointments?view=calendar&mode=agenda`
- WHEN la página carga
- THEN la vista principal MUST ser Calendario
- AND la sub-vista activa MUST ser Agenda
- AND la agenda MUST renderizar las citas agrupadas por día del mes visible

#### Scenario: Un modo inválido cae en el default
- GIVEN una URL `/appointments?view=calendar&mode=otro`
- WHEN la página carga
- THEN la sub-vista activa MUST ser Grilla
- AND la cuadrícula mensual MUST renderizarse

#### Scenario: Una vista inválida cae en la lista
- GIVEN una URL `/appointments?view=desconocido`
- WHEN la página carga
- THEN la vista principal MUST ser la lista
- AND el sub-toggle de modo MUST NOT renderizarse

#### Scenario: El enlace legacy view=agenda se migra
- GIVEN una URL legacy `/appointments?view=agenda`
- WHEN la página carga
- THEN la vista principal MUST ser Calendario
- AND la sub-vista activa MUST ser Agenda
- AND la URL normalizada MUST ser `/appointments?view=calendar&mode=agenda`

#### Scenario: La vista y el modo se componen con los filtros
- GIVEN una URL con `view=calendar`, `mode=agenda` y una selección `providerId`
- WHEN la página carga y el usuario alterna de Agenda a Grilla
- THEN la URL MUST conservar `providerId` y actualizar el modo a `grid` o eliminar `mode`
- AND la cuadrícula MUST seguir mostrando únicamente las citas del proveedor filtrado

#### Scenario: Cambiar de modo no dispara una petición adicional
- GIVEN el usuario está en la vista de Calendario con el mes visible ya cargado
- WHEN alterna entre Grilla y Agenda
- THEN la URL MUST reflejar el modo activo
- AND la petición de rango del mes visible MUST NOT repetirse por el solo cambio de modo
