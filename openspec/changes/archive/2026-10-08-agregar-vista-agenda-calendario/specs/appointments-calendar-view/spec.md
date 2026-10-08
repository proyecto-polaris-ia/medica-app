# Delta para Appointments Calendar View

**Change**: agregar-vista-agenda-calendario
**Baseline**: `openspec/specs/appointments-calendar-view/spec.md`

## MODIFIED Requirements

### Requirement: View toggle from appointments page
La página `/appointments` MUST ofrecer un toggle que alterne entre la vista de
lista existente (`DataTable`), la vista de calendario en cuadrícula mensual y la
vista de **agenda** (citas del mes agrupadas por día). El toggle MUST exponer las
tres opciones de forma distinguible y MUST conservar el estado de los filtros
activos al alternar entre vistas. Las tres vistas MUST compartir los estados de
carga y de error existentes. La vista por defecto SHALL ser la lista.

#### Scenario: Toggle to calendar preserves filters
- GIVEN an authenticated admin on `/appointments` with a filter applied
- WHEN they activate the calendar toggle
- THEN the calendar MUST render and the applied filter MUST remain active

#### Scenario: Toggle back to list keeps session
- GIVEN the calendar is shown
- WHEN they switch back to the list
- THEN the `DataTable` MUST render with the same filters and no session loss

#### Scenario: Se ofrecen las tres vistas
- GIVEN un administrador autenticado en `/appointments`
- WHEN el toggle renderiza
- THEN MUST mostrar las opciones Lista, Calendario y Agenda
- AND cada opción MUST ser un control operable por teclado
- AND la opción activa MUST distinguirse de las demás

#### Scenario: Alternar a la agenda conserva los filtros del calendario
- GIVEN el calendario tiene una selección activa de proveedores o servicios
- WHEN el usuario activa la opción Agenda
- THEN la agenda MUST renderizar con esa selección todavía aplicada
- AND al volver a Calendario la selección MUST conservarse

## ADDED Requirements

### Requirement: Vista de agenda agrupada por día del mes visible
La vista de agenda MUST mostrar las citas del mes visible agrupadas por día, en
orden cronológico ascendente de día. Cada sección de día MUST encabezarse con el
día de la semana y la fecha legible del día. La agenda MUST NOT mostrar días
fuera del mes visible. Las citas dentro de cada día MUST ordenarse por hora de
inicio ascendente.

#### Scenario: Agrupa las citas por día del mes visible
- GIVEN el mes visible tiene citas el día 3 y el día 10
- WHEN la agenda renderiza
- THEN MUST mostrar una sección para el día 3 y una sección para el día 10
- AND cada cita MUST aparecer bajo el día que le corresponde
- AND MUST NOT mostrar días fuera del mes visible

#### Scenario: Ordena días y citas cronológicamente
- GIVEN un día con citas a las 10:00 y a las 09:00, y otro día posterior
- WHEN la agenda renderiza
- THEN las secciones de día MUST aparecer en orden ascendente de fecha
- AND dentro del día las citas MUST aparecer a las 09:00 antes que a las 10:00

#### Scenario: El encabezado identifica el día
- GIVEN la agenda muestra una sección de día
- WHEN el encabezado renderiza
- THEN MUST mostrar el día de la semana y la fecha legible del día
- AND la fecha mostrada MUST corresponder al día de la sección

### Requirement: Campos completos por cita en la agenda
Cada cita de la agenda MUST ser legible de forma completa sin abrir otro
componente, mostrando: hora de inicio y hora de fin, paciente, servicio,
proveedor y estado. El estado MUST usar la misma etiqueta en español que la vista
de Lista. Las notas de la cita MUST mostrarse cuando existan y MUST NOT mostrarse
un valor inventado cuando no existan.

#### Scenario: Muestra hora inicio–fin y datos de la cita
- GIVEN una cita de 09:00 a 10:00 con paciente, servicio, proveedor y estado
- WHEN la agenda renderiza esa cita
- THEN la cita MUST mostrar la hora de inicio y la hora de fin
- AND MUST mostrar el paciente, el servicio, el proveedor y el estado
- AND el estado MUST renderizarse con su etiqueta en español

#### Scenario: Muestra las notas cuando existen
- GIVEN una cita con notas capturadas
- WHEN la agenda renderiza esa cita
- THEN las notas MUST mostrarse en la fila de la cita

#### Scenario: No inventa notas ausentes
- GIVEN una cita sin notas
- WHEN la agenda renderiza esa cita
- THEN la fila MUST NOT mostrar un valor de notas inventado

### Requirement: Días sin citas en la agenda
Los días del mes visible sin citas MUST permanecer visibles en la agenda con una
indicación explícita de que no hay citas ("Sin citas"), en lugar de desaparecer
en silencio. La agenda MUST NOT mostrar un estado vacío global mientras existan
días del mes con citas.

#### Scenario: Día sin citas indica "Sin citas"
- GIVEN el mes visible tiene citas solo el día 5
- WHEN la agenda renderiza el día 6
- THEN el día 6 MUST ser visible en la agenda
- AND MUST mostrar la indicación "Sin citas"
- AND la agenda MUST seguir mostrando las citas del día 5

### Requirement: Reutilización de edición y expediente desde la agenda
La agenda MUST reutilizar los flujos existentes: activar una cita MUST abrir el
formulario de edición de esa cita mediante el callback existente de selección de
bloque, y activar el nombre del paciente MUST abrir el expediente del paciente
mediante el callback existente de selección de paciente. La agenda MUST NOT
editar datos de citas en línea.

#### Scenario: Clic en la cita abre el formulario de edición
- GIVEN la agenda muestra una cita
- WHEN el usuario activa la cita
- THEN el formulario de edición existente MUST abrirse para ese registro

#### Scenario: Clic en el paciente abre el expediente
- GIVEN la agenda muestra una cita de un paciente con expediente
- WHEN el usuario activa el nombre del paciente
- THEN la app MUST abrir el expediente de ese paciente
- AND el formulario de edición de la cita MUST NOT abrirse

### Requirement: La agenda respeta los filtros y comparte los datos del calendario
La agenda MUST aplicar los mismos filtros multi-selección de proveedores y
servicios de la vista de calendario (#174/#177), de modo que solo muestre las
citas que cumplen ambos filtros cuando estén activos. La agenda y la cuadrícula
MUST consumir exactamente los mismos datos ya cargados para el mes visible, sin
disparar peticiones adicionales al backend. La navegación de mes con
`CalendarNav` en la agenda MUST compartir el mismo estado de mes visible y MUST
NOT provocar más de la petición de rango del mes correspondiente.

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
- WHEN alterna a la vista de Calendario y de regreso a la Agenda
- THEN ambas vistas MUST mostrar las citas del mismo mes visible
- AND MUST NOT dispararse una petición de rango adicional por el solo cambio de vista

### Requirement: Navegación de mes y botón "Hoy" en la agenda
La agenda MUST usar el mismo control de navegación de mes y año que la cuadrícula,
actualizando el mes visible compartido. La agenda SHOULD ofrecer un botón "Hoy"
que desplace la vista al día actual de la clínica cuando ese día pertenezca al mes
visible. Cuando el día actual no pertenezca al mes visible, el botón MUST NOT
romper el render ni el desplazamiento.

#### Scenario: CalendarNav cambia el mes en la agenda
- GIVEN la agenda muestra el mes de marzo de 2026
- WHEN el usuario pulsa "Siguiente" en el control de navegación
- THEN la agenda MUST mostrar el mes de abril de 2026
- AND MUST seguir agrupando por día del nuevo mes visible

#### Scenario: El botón Hoy desplaza al día actual
- GIVEN la agenda muestra el mes visible que contiene el día actual de la clínica
- WHEN el usuario activa el botón "Hoy"
- THEN la vista MUST desplazarse hasta la sección del día actual

#### Scenario: Hoy fuera del mes visible no rompe
- GIVEN el día actual de la clínica no pertenece al mes visible de la agenda
- WHEN el usuario activa el botón "Hoy"
- THEN la agenda MUST permanecer usable
- AND MUST NOT lanzar un error de render ni desplazarse a un día inexistente

### Requirement: Presentación con scroll vertical y responsiva de la agenda
La agenda MUST presentarse en un contenedor con scroll vertical para recorrer
todos los días del mes sin desbordar la página. En viewports estrechos, la fila
de una cita MUST apilarse en columna y MUST pasar a fila en viewports anchos,
manteniendo visibles y operables sus acciones.

#### Scenario: La agenda tiene scroll vertical
- GIVEN un mes con suficientes días con citas para exceder el alto disponible
- WHEN la agenda renderiza
- THEN el listado MUST permitir desplazamiento vertical
- AND todos los días del mes MUST poder alcanzarse

#### Scenario: La fila de cita es usable en móvil
- GIVEN un viewport estrecho
- WHEN se renderiza una fila de cita de la agenda
- THEN la fila MUST apilarse en columna
- AND en viewports anchos MUST pasar a fila (`sm:flex-row`)
- AND la cita y el nombre del paciente MUST seguir siendo operables
