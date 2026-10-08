# Delta for Appointments Calendar View

**Change**: agregar-filtro-servicios-calendario
**Baseline**: `openspec/specs/appointments-calendar-view/spec.md`

## MODIFIED Requirements

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

## ADDED Requirements

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
