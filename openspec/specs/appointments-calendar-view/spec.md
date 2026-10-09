# Appointments Calendar View Specification

## Purpose

Provide a calendar visualization of appointments reachable from `/appointments`,
with month/year navigation, provider-color-coded time blocks, and a list/calendar
toggle that preserves existing list behavior. It also offers an agenda view that
groups the visible month's appointments by day.

## Requirements

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

### Requirement: Calendar month and year navigation
The calendar MUST support previous/next month navigation and a year selector that
jumps to any year. Navigation MUST NOT reload the page or drop the session.

#### Scenario: Next and previous month
- GIVEN the calendar shows March 2026
- WHEN the user clicks next then previous
- THEN it MUST show April 2026 then return to March 2026

#### Scenario: Year jump
- GIVEN the calendar shows 2026
- WHEN the user selects 2027 in the year selector
- THEN all month views MUST resolve within 2027

### Requirement: Range-scoped appointment loading
The calendar MUST load only appointments whose `start` falls within the visible
month window via a range query (`start`/`end`), and MUST NOT load the full
appointment table.

#### Scenario: Loads visible month only
- GIVEN the calendar shows June 2026
- WHEN it queries the data layer
- THEN it MUST request appointments within June 1–30 2026 and MUST NOT fetch rows outside the window

### Requirement: Provider-colored appointment time blocks
Each appointment in the visible range MUST render as a time block in its day
column, positioned by its start/end time, and colored by its provider's `color`.

#### Scenario: Block reflects provider color
- GIVEN a provider with color `#1f77b4` has an appointment June 10 09:00–10:00
- WHEN the calendar renders June 2026
- THEN the June 10 block MUST appear in the 09:00–10:00 slot using `#1f77b4`

### Requirement: Provider color legend
El calendario MUST renderizar una leyenda que mapee cada proveedor del mes
visible a su color, y los colores de la leyenda MUST coincidir con los bloques
renderizados. La leyenda MUST listar **todos** los proveedores con citas en el
mes visible, incluidos los que estén deseleccionados, de modo que un proveedor
inactivo siga visible como control y pueda volver a seleccionarse. Cada entrada
MUST ser un control de alternancia accesible: un botón con `aria-pressed` que
refleje su estado de selección y que MUST ser operable por teclado. La entrada de
un proveedor deseleccionado SHOULD mostrarse visualmente atenuada pero MUST
permanecer legible. Cuando no haya filtrado de proveedores activo (sin selección
o equivalente a "todos"), la leyenda MUST comunicar que se muestran todos los
proveedores, preservando el comportamiento actual.

#### Scenario: La leyenda conserva el universo del mes
- GIVEN un mes visible con citas de los proveedores A y B
- AND el proveedor B está deseleccionado
- WHEN la leyenda renderiza
- THEN la leyenda MUST listar tanto A como B
- AND la entrada de B MUST permanecer como control para poder volver a seleccionarlo

#### Scenario: Entrada de la leyenda alterna su estado
- GIVEN la leyenda muestra el proveedor A como seleccionado
- WHEN el usuario activa la entrada de A
- THEN A MUST quedar deseleccionado en la leyenda
- AND la cuadrícula del calendario MUST reflejar el filtrado correspondiente

#### Scenario: Entrada deseleccionada atenuada pero legible
- GIVEN un proveedor está deseleccionado
- WHEN la leyenda renderiza su entrada
- THEN la entrada SHOULD mostrarse visualmente atenuada
- AND MUST permanecer legible
- AND MUST exponer `aria-pressed` en estado no presionado

#### Scenario: Sin filtrado la leyenda comunica que se muestran todos
- GIVEN no hay filtrado de proveedores activo en el calendario
- WHEN la leyenda renderiza
- THEN la leyenda MUST comunicar que se muestran todos los proveedores
- AND cada entrada MUST reflejar su estado seleccionado

### Requirement: Missing provider-color fallback
A provider without a `color` MUST fall back to a neutral color in both blocks and
legend; the calendar MUST remain usable.

#### Scenario: Provider without color
- GIVEN a provider has no `color` set
- WHEN the calendar renders that provider's appointments
- THEN the blocks and legend entry MUST use a defined neutral color

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

### Requirement: Block opens existing edit flow
Clicking a time block MUST open the existing appointment edit flow; the calendar
SHALL NOT edit appointment data inline.

#### Scenario: Click opens edit
- GIVEN a rendered appointment block
- WHEN the user clicks it
- THEN the existing appointment edit UI MUST open for that record

### Requirement: Calendar patient record access
The calendar view MUST allow authenticated staff to open a read-only patient record modal by activating the patient name within a calendar appointment block.

#### Scenario: Calendar patient name opens record modal
- GIVEN an authenticated admin is viewing the appointments calendar
- AND a calendar block is linked to patient `P1`
- WHEN they activate the patient name inside that block
- THEN the app MUST open a modal showing patient `P1` record information

#### Scenario: Calendar block still opens appointment edit
- GIVEN an authenticated admin is viewing the appointments calendar
- WHEN they activate the appointment block outside the patient-name action
- THEN the existing appointment edit flow MUST still open

### Requirement: Filtrado multi-selección de proveedores en el calendario
La vista de calendario MUST permitir seleccionar cero, uno o varios proveedores y
MUST mostrar en la cuadrícula del mes únicamente las citas de los proveedores
seleccionados. El filtrado MUST aplicarse antes del agrupamiento por día, de modo
que los bloques resultantes se posicionen en su franja horaria correcta aun cuando
el día contenga citas de varios proveedores. Una selección vacía o equivalente a
"todos" MUST mostrar las citas de todos los proveedores, preservando el
comportamiento actual. La selección activa MUST reflejarse en la URL como el
parámetro `providerId` con los ids seleccionados unidos por coma, MUST ser
compartible por enlace directo (deep link) y SHOULD conservarse al alternar entre
las vistas Lista y Calendario. El botón "Limpiar filtros" del calendario MUST
reiniciar a "todos" las selecciones de proveedores **y** de servicios del
calendario, MUST eliminar los parámetros `providerId` y `serviceId` de la URL, y
MUST renderizarse cuando cualquiera de los dos filtros del calendario esté activo.
Los ids presentes en la URL que no correspondan a ningún proveedor del mes
MUST tratarse como sin coincidencia y MUST NOT impedir el render del calendario.
El filtrado del calendario MUST ser independiente del filtro de proveedor de un
solo valor de la vista de Lista y MUST NOT alterar la semántica ni el valor de su
`<select>`.

#### Scenario: Seleccionar un proveedor muestra solo sus citas
- GIVEN el calendario muestra un mes con citas de los proveedores A y B
- WHEN el usuario selecciona únicamente el proveedor A
- THEN la cuadrícula MUST mostrar solo las citas de A
- AND MUST NOT mostrar las citas de B

#### Scenario: Seleccionar varios proveedores muestra solo los elegidos
- GIVEN el calendario muestra un mes con citas de los proveedores A, B y C
- WHEN el usuario selecciona los proveedores A y C
- THEN la cuadrícula MUST mostrar las citas de A y C
- AND MUST NOT mostrar las citas de B

#### Scenario: Sin selección se muestran todos los proveedores
- GIVEN el calendario tiene una selección previa de proveedores
- WHEN el usuario deselecciona todos los proveedores o selecciona "todos"
- THEN la cuadrícula MUST mostrar las citas de todos los proveedores

#### Scenario: El filtrado precede al agrupamiento por día
- GIVEN un día con una cita del proveedor A a las 09:00 y una cita del proveedor B a las 11:00
- WHEN el usuario selecciona únicamente el proveedor A
- THEN ese día MUST mostrar solo el bloque de A en la franja de 09:00
- AND MUST NOT mostrar el bloque de B en la franja de 11:00

#### Scenario: La selección se refleja en la URL y es deep-linkable
- GIVEN el usuario selecciona los proveedores A y B en el calendario
- WHEN la selección se aplica
- THEN la URL MUST incluir `providerId` con los ids de A y B unidos por coma
- AND al recargar la página con esa URL la selección MUST restaurarse
- AND la cuadrícula MUST mostrar solo las citas de A y B

#### Scenario: La selección sobrevive el cambio Lista ↔ Calendario
- GIVEN el calendario tiene seleccionados los proveedores A y B
- WHEN el usuario cambia a la vista de Lista y luego regresa al calendario
- THEN la selección de proveedores del calendario MUST conservarse
- AND la vista de Lista MUST seguir operando con su propio filtro de proveedor

#### Scenario: "Limpiar filtros" reinicia ambos filtros del calendario
- GIVEN el calendario tiene seleccionados uno o varios proveedores y uno o varios servicios
- WHEN el usuario activa "Limpiar filtros" del calendario
- THEN la selección de proveedores MUST reiniciarse a "todos"
- AND la selección de servicios MUST reiniciarse a "todos"
- AND los parámetros `providerId` y `serviceId` MUST eliminarse de la URL
- AND la cuadrícula MUST mostrar las citas de todos los proveedores y servicios

#### Scenario: El botón "Limpiar filtros" se muestra cuando cualquiera de los filtros está activo
- GIVEN el calendario no tiene ninguna selección activa de proveedores ni de servicios
- WHEN la fila de filtros del calendario renderiza
- THEN el botón "Limpiar filtros" MUST NOT renderizarse
- AND con solo una selección de proveedores activa el botón MUST renderizarse
- AND con solo una selección de servicios activa el botón MUST renderizarse

#### Scenario: La lista conserva su filtro de proveedor de un solo valor
- GIVEN la vista de Lista con su `<select>` de proveedor de un solo valor
- WHEN el usuario filtra por un proveedor en la lista
- THEN la lista MUST mostrar únicamente las citas de ese proveedor
- AND el filtrado del calendario MUST NOT alterar el valor ni el comportamiento de ese `<select>`

#### Scenario: Ids desconocidos en la URL no rompen el calendario
- GIVEN una URL con `providerId` que incluye un id sin proveedor correspondiente en el mes visible
- WHEN el calendario renderiza con esa URL
- THEN el id desconocido MUST tratarse como sin coincidencia
- AND el calendario MUST seguir renderizando de forma usable

#### Scenario: La fila de filtros es usable en móvil
- GIVEN un viewport estrecho
- WHEN se renderiza la fila de navegación y leyenda del calendario
- THEN la fila MUST apilarse en columna y MUST pasar a fila (`sm:flex-row`) en viewports anchos
- AND los controles de filtrado MUST permanecer visibles y operables

#### Scenario: Los controles de filtrado son operables por teclado
- GIVEN el calendario muestra la leyenda de proveedores
- WHEN el usuario navega con el teclado hasta una entrada y la activa
- THEN el control MUST ser operable por teclado
- AND MUST anunciar su estado presionado mediante `aria-pressed`
- AND el estado anunciado MUST reflejar el cambio aplicado al filtrado

### Requirement: Filtrado multi-selección de servicios en el calendario
La vista de calendario MUST permitir seleccionar cero, uno o varios servicios y
MUST mostrar en la cuadrícula del mes únicamente las citas de los servicios
seleccionados. El filtrado MUST aplicarse antes del agrupamiento por día, de modo
que los bloques resultantes se posicionen en su franja horaria correcta aun cuando
el día contenga citas de varios servicios. La selección de servicios MUST
componerse con AND respecto de la selección de proveedores del calendario, de modo
que con ambos filtros activos la cuadrícula MUST mostrar únicamente las citas que
cumplan ambos criterios. Una selección vacía o equivalente a "todos" MUST mostrar
las citas de todos los servicios, preservando el comportamiento actual. La
selección activa MUST reflejarse en la URL como el parámetro `serviceId` con los
ids seleccionados unidos por coma, MUST poder componerse en la misma URL con el
parámetro `providerId`, MUST ser compartible por enlace directo (deep link) y
SHOULD conservarse al alternar entre las vistas Lista y Calendario. La acción
"Limpiar filtros" del calendario, definida de forma única en el requirement de
proveedores, MUST reiniciar también esta selección a "todos" y MUST eliminar el
parámetro `serviceId` de la URL. Los ids presentes en la URL que no correspondan a
ningún servicio del mes MUST tratarse como sin coincidencia y MUST NOT impedir el
render del calendario. El control de servicios MUST listar **todos** los servicios
con citas en el mes visible, incluidos los que estén deseleccionados, de modo que
un servicio inactivo siga visible como control y pueda volver a seleccionarse,
aunque otros filtros del calendario estén activos. Cada entrada MUST ser un control
de alternancia accesible: un botón con `aria-pressed` que refleje su estado de
selección y que MUST ser operable por teclado. Cada entrada MUST mostrar únicamente
el nombre del servicio, MUST NOT renderizar un swatch de color y MUST NOT depender
del color para distinguir su estado, permaneciendo legible cuando está
deseleccionada. Cuando no haya filtrado de servicios activo (sin selección o
equivalente a "todos"), el control MUST comunicar que se muestran todos los
servicios, preservando la semántica ya establecida para los proveedores. El
filtrado de servicios del calendario MUST ser independiente del filtro de servicio
de un solo valor de la vista de Lista y MUST NOT alterar la semántica ni el valor
de su `<select>`.

#### Scenario: Seleccionar un servicio muestra solo sus citas
- GIVEN el calendario muestra un mes con citas de los servicios X y Y
- WHEN el usuario selecciona únicamente el servicio X
- THEN la cuadrícula MUST mostrar solo las citas de X
- AND MUST NOT mostrar las citas de Y

#### Scenario: Seleccionar varios servicios muestra solo los elegidos
- GIVEN el calendario muestra un mes con citas de los servicios X, Y y Z
- WHEN el usuario selecciona los servicios X y Z
- THEN la cuadrícula MUST mostrar las citas de X y Z
- AND MUST NOT mostrar las citas de Y

#### Scenario: Sin selección se muestran todos los servicios
- GIVEN el calendario tiene una selección previa de servicios
- WHEN el usuario deselecciona todos los servicios o selecciona "todos"
- THEN la cuadrícula MUST mostrar las citas de todos los servicios

#### Scenario: El filtro de servicios se compone con AND con el de proveedores
- GIVEN un mes con una cita del servicio X del proveedor A, una cita del servicio X del proveedor B y una cita del servicio Y del proveedor A
- WHEN el usuario selecciona el servicio X y el proveedor A
- THEN la cuadrícula MUST mostrar únicamente la cita del servicio X con el proveedor A
- AND MUST NOT mostrar la cita del servicio X con el proveedor B
- AND MUST NOT mostrar la cita del servicio Y con el proveedor A

#### Scenario: El filtrado de servicios precede al agrupamiento por día
- GIVEN un día con una cita del servicio X del proveedor A a las 09:00 y una cita del servicio Y del proveedor B a las 11:00
- WHEN el usuario selecciona únicamente el servicio X y únicamente el proveedor A
- THEN ese día MUST mostrar solo el bloque de X con A en la franja de 09:00
- AND MUST NOT mostrar el bloque de Y con B en la franja de 11:00

#### Scenario: La selección de servicios se refleja en la URL y es deep-linkable
- GIVEN el usuario selecciona los servicios X y Y en el calendario
- WHEN la selección se aplica
- THEN la URL MUST incluir `serviceId` con los ids de X y Y unidos por coma
- AND al recargar la página con esa URL la selección MUST restaurarse
- AND la cuadrícula MUST mostrar solo las citas de X y Y

#### Scenario: La URL compone la selección de servicios con la de proveedores
- GIVEN el usuario selecciona los servicios X y Y y el proveedor A en el calendario
- WHEN la selección se aplica
- THEN la URL MUST incluir `serviceId` con los ids de X y Y y `providerId` con el id de A
- AND la cuadrícula MUST mostrar solo las citas que cumplan ambos filtros
- AND al recargar la página con esa URL ambas selecciones MUST restaurarse

#### Scenario: La selección de servicios sobrevive el cambio Lista ↔ Calendario
- GIVEN el calendario tiene seleccionados los servicios X y Y y el proveedor A
- WHEN el usuario cambia a la vista de Lista y luego regresa al calendario
- THEN la selección de servicios y la de proveedores del calendario MUST conservarse
- AND la vista de Lista MUST seguir operando con su propio filtro de servicio

#### Scenario: El control de servicios conserva el universo del mes
- GIVEN un mes visible con citas de los servicios X y Y
- AND el servicio Y está deseleccionado
- WHEN el control de servicios renderiza
- THEN el control MUST listar tanto X como Y
- AND la entrada de Y MUST permanecer como control para poder volver a seleccionarlo
- AND MUST seguir listando ambos aun con un filtro de proveedores activo

#### Scenario: Las entradas del control de servicios son solo nombre
- GIVEN el control de servicios renderiza una entrada de servicio
- WHEN la entrada se muestra en estado seleccionado o deseleccionado
- THEN la entrada MUST mostrar únicamente el nombre del servicio
- AND MUST NOT renderizar un swatch de color
- AND MUST NOT depender del color para distinguir su estado
- AND MUST permanecer legible

#### Scenario: Los controles de servicios son operables por teclado
- GIVEN el calendario muestra el control de servicios
- WHEN el usuario navega con el teclado hasta una entrada y la activa
- THEN el control MUST ser operable por teclado
- AND MUST anunciar su estado presionado mediante `aria-pressed`
- AND el estado anunciado MUST reflejar el cambio aplicado al filtrado

#### Scenario: Sin filtrado de servicios el control comunica que se muestran todos
- GIVEN no hay filtrado de servicios activo en el calendario
- WHEN el control de servicios renderiza
- THEN el control MUST comunicar que se muestran todos los servicios
- AND cada entrada MUST exponer `aria-pressed` en estado presionado

#### Scenario: Ids desconocidos en la URL no rompen el calendario
- GIVEN una URL con `serviceId` que incluye un id sin servicio correspondiente en el mes visible
- WHEN el calendario renderiza con esa URL
- THEN el id desconocido MUST tratarse como sin coincidencia
- AND el calendario MUST seguir renderizando de forma usable

#### Scenario: La fila de filtros con el control de servicios es usable en móvil
- GIVEN un viewport estrecho
- WHEN se renderiza la fila de navegación con la leyenda de proveedores y el control de servicios
- THEN la fila MUST apilarse en columna y MUST pasar a fila (`sm:flex-row`) en viewports anchos
- AND ambos controles de filtrado MUST permanecer visibles y operables

#### Scenario: La misma acción "Limpiar filtros" deja el filtro de servicios en "todos"
- GIVEN el calendario tiene seleccionados uno o varios servicios y uno o varios proveedores
- WHEN el usuario activa "Limpiar filtros" del calendario
- THEN la selección de servicios MUST reiniciarse a "todos"
- AND el parámetro `serviceId` MUST eliminarse de la URL junto con `providerId`
- AND la cuadrícula MUST mostrar las citas de todos los servicios

#### Scenario: La lista conserva su filtro de servicio de un solo valor
- GIVEN la vista de Lista con su `<select>` de servicio de un solo valor
- WHEN el usuario filtra por un servicio en la lista y el calendario tiene una selección de servicios distinta
- THEN la lista MUST mostrar únicamente las citas de ese servicio
- AND el filtrado de servicios del calendario MUST NOT alterar el valor ni el comportamiento de ese `<select>`

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
