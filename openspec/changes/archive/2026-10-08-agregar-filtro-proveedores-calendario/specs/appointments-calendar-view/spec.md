# Delta for Appointments Calendar View

**Change**: agregar-filtro-proveedores-calendario
**Baseline**: `openspec/specs/appointments-calendar-view/spec.md`

## MODIFIED Requirements

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

## ADDED Requirements

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
las vistas Lista y Calendario. La acción "Limpiar filtros" del calendario MUST
reiniciar la selección a "todos" y MUST eliminar el parámetro `providerId` de la
URL. Los ids presentes en la URL que no correspondan a ningún proveedor del mes
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

#### Scenario: "Limpiar filtros" reinicia la selección del calendario
- GIVEN el calendario tiene uno o varios proveedores seleccionados
- WHEN el usuario activa "Limpiar filtros" del calendario
- THEN la selección MUST reiniciarse a "todos"
- AND el parámetro `providerId` MUST eliminarse de la URL
- AND la cuadrícula MUST mostrar las citas de todos los proveedores

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
