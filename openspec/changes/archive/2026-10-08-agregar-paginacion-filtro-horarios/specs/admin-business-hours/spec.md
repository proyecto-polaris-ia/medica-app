# Delta Spec: Lectura paginada y filtro por proveedor en la lista de horarios

**Change**: agregar-paginacion-filtro-horarios
**Capability**: `admin-business-hours` (nueva)
**Baseline**: capacidad nueva; no existe spec previa en `openspec/specs/`. El
requirement "Business hours CRUD" de `openspec/specs/admin-panel/spec.md`
(escritura de `business_hours`) se conserva sin cambios.

Alcance: este spec cubre la lectura (`GET`) del catálogo administrativo de
horarios y el comportamiento visible de la vista `/business-hours`. Las
operaciones de escritura (alta, edición y eliminación) conservan su contrato
vigente y siguen especificadas por `admin-panel`.

## ADDED Requirements

### Requirement: Paginación del listado de horarios del panel

`GET /api/admin/business-hours` MUST responder una colección paginada del lado
del servidor. La respuesta MUST conservar la clave `businessHours` con la misma
forma y los mismos campos por horario que el contrato vigente (identificador,
proveedor, día de la semana, hora de inicio, hora de fin, fecha de creación y
fecha de actualización) y MUST incluir de forma aditiva el objeto
`pagination` con `total`, `page`, `pageSize` y `totalPages`. El parámetro `page`
MUST ser un entero mayor o igual a `1` y MUST tener default `1`; `pageSize`
MUST ser un entero entre `1` y `100` y MUST tener default `20`. El endpoint MUST
solicitar la página con un desplazamiento equivalente a `(page - 1) * pageSize`
y MUST contar el total de forma exacta sobre el conjunto filtrado. `totalPages`
MUST calcularse como `Math.ceil(total / pageSize)`. Cuando la página solicitada
exceda el total de páginas, el endpoint MUST responder `businessHours` como
arreglo vacío conservando los metadatos intactos, sin recortar el valor de
`page`, y MUST NOT responder un error.

#### Scenario: Primera página con los valores por defecto

- GIVEN más de 20 horarios registrados
- WHEN un administrador autenticado consulta `GET /api/admin/business-hours` sin `page` ni `pageSize`
- THEN la respuesta MUST ser exitosa con `pagination.page` = 1 y `pagination.pageSize` = 20
- AND `businessHours` MUST contener como máximo 20 horarios
- AND `pagination.total` MUST ser el total del conjunto filtrado

#### Scenario: La segunda página no repite filas de la primera

- GIVEN un conjunto filtrado de 45 horarios
- WHEN el administrador consulta `page=2` con `pageSize=20`
- THEN `businessHours` MUST contener como máximo 20 horarios
- AND ningún horario devuelto MUST repetir un horario de la primera página
- AND `pagination.total` MUST ser 45 y `pagination.totalPages` MUST ser 3

#### Scenario: Página más allá del total devuelve una página vacía

- GIVEN un conjunto filtrado de 5 horarios con `pageSize=20`
- WHEN el administrador consulta `page=9`
- THEN `businessHours` MUST ser un arreglo vacío
- AND `pagination.total` MUST conservarse en 5 y `pagination.totalPages` en 1
- AND `pagination.page` MUST conservarse en 9
- AND la respuesta MUST ser exitosa

#### Scenario: Listado sin horarios reporta metadatos coherentes

- GIVEN no existe ningún horario registrado
- WHEN el administrador autenticado consulta el listado
- THEN `businessHours` MUST ser un arreglo vacío
- AND `pagination.total` MUST ser 0 y `pagination.totalPages` MUST ser 0

### Requirement: Metadatos de paginación sobre el conjunto filtrado

El valor `total` de los metadatos MUST reflejar el número de horarios que
cumplen **todos** los filtros activos. La paginación MUST aplicarse **después**
de los filtros, de modo que cambiar un filtro MUST alterar `total` y
`totalPages` de forma coherente con las filas devueltas.

#### Scenario: El total respeta el filtro activo

- GIVEN 30 horarios registrados, de los cuales 7 pertenecen a un proveedor dado
- WHEN el administrador consulta el listado con el `providerId` de ese proveedor
- THEN `pagination.total` MUST ser 7
- AND `pagination.totalPages` MUST recalcularse sobre ese total
- AND todos los horarios devueltos MUST pertenecer a ese proveedor

#### Scenario: El total cambia al limpiar el filtro

- GIVEN una consulta previa con filtro de proveedor que reporta `pagination.total` = 7
- WHEN el administrador repite la consulta sin `providerId`
- THEN `pagination.total` MUST pasar a 30
- AND `pagination.totalPages` MUST recalcularse con el nuevo total

### Requirement: Filtro server-side por proveedor

`GET /api/admin/business-hours` MUST aceptar el parámetro `providerId`. Cuando
`providerId` esté informado con contenido, el endpoint MUST validar que sea un
UUID válido y el resultado MUST contener únicamente los horarios de ese
proveedor, aplicando el filtro en el servidor antes de calcular `total` y antes
de recortar la página. Cuando `providerId` esté ausente o sea una cadena vacía,
el endpoint MUST comportarse como una consulta sin filtro. Cuando `providerId`
tenga contenido y no sea un UUID válido, el endpoint MUST responder `400`.

#### Scenario: El filtro acota la lista en el servidor

- GIVEN horarios de dos proveedores distintos
- WHEN el administrador consulta con el `providerId` del proveedor A
- THEN `businessHours` MUST contener únicamente horarios del proveedor A
- AND los horarios del proveedor B MUST NOT aparecer
- AND `pagination.total` MUST contar solo los horarios del proveedor A

#### Scenario: Filtro vacío equivale a listado completo

- GIVEN horarios registrados de varios proveedores
- WHEN el administrador consulta con `providerId` vacío o ausente
- THEN la respuesta MUST contener el listado completo paginado desde la página 1

#### Scenario: Identificador de proveedor malformado responde 400

- GIVEN un administrador autenticado
- WHEN consulta el listado con `providerId=no-es-un-uuid`
- THEN la respuesta MUST ser `400`
- AND el cuerpo MUST NOT contener `businessHours` ni `pagination`

### Requirement: Orden estable del listado de horarios

El listado MUST ordenarse por `created_at` descendente y, como desempate, por
`id` descendente. El orden MUST aplicarse en el servidor sobre el conjunto
filtrado y antes de paginar, de modo que el orden sea estable entre páginas y
dos páginas consecutivas MUST NOT repetir ni omitir horarios.

#### Scenario: Orden descendente por fecha de creación

- GIVEN varios horarios registrados en fechas distintas
- WHEN el administrador consulta la primera página
- THEN el horario creado más recientemente MUST aparecer antes que los anteriores

#### Scenario: Orden estable con fechas de creación iguales

- GIVEN varios horarios con la misma fecha de creación
- WHEN el administrador recorre dos páginas consecutivas
- THEN el orden entre esos horarios MUST ser determinista y estable
- AND ningún horario MUST repetirse entre las dos páginas

### Requirement: Validación de los parámetros de paginación

El endpoint MUST validar `page` y `pageSize` y MUST responder `400` cuando alguno
sea inválido: `page` no entero, con signo, con decimales o menor que `1`, o
`pageSize` no entero o fuera del rango `1..100`. Una petición inválida MUST NOT
devolver `businessHours` ni `pagination`. Una petición sin sesión administrativa
válida MUST responder `401`.

#### Scenario: page inválido

- GIVEN un administrador autenticado
- WHEN consulta el listado con `page=0`
- THEN la respuesta MUST ser `400`
- AND el cuerpo MUST NOT contener `businessHours`

#### Scenario: pageSize fuera de rango

- GIVEN un administrador autenticado
- WHEN consulta el listado con `pageSize=101`
- THEN la respuesta MUST ser `400`

#### Scenario: pageSize no numérico

- GIVEN un administrador autenticado
- WHEN consulta el listado con `pageSize=abc`
- THEN la respuesta MUST ser `400`

#### Scenario: Petición sin sesión

- GIVEN una petición sin sesión administrativa válida
- WHEN consulta el listado de horarios
- THEN la respuesta MUST ser `401`

### Requirement: Control de paginación en la vista de horarios

La vista `/business-hours` MUST mostrar el control de paginación reutilizable
(`src/components/admin/Pagination.tsx`) debajo de la tabla de horarios, con las
acciones de primera página, página anterior, indicador de la página actual
respecto del total ("Página X de Y (N resultados)"), página siguiente y última
página. El indicador MUST usar los metadatos informados por el servidor. Cuando
el total quepa en una sola página, el control MUST NOT mostrar acciones de
navegación. La tabla MUST mostrar como máximo `pageSize` filas y MUST NOT
ofrecer selector de `pageSize`. Al cambiar de página la vista MUST solicitar esa
página al servidor y MUST actualizar las filas sin recargar la aplicación,
preservando el filtro activo.

#### Scenario: La lista muestra el control debajo de la tabla

- GIVEN un listado con más de 20 horarios y sin filtro activo
- WHEN la vista renderiza los resultados
- THEN MUST mostrar el control de paginación debajo de la tabla
- AND el indicador MUST mostrar "Página 1 de Y (N resultados)" con el total del servidor

#### Scenario: Avanzar de página conserva el filtro activo

- GIVEN un filtro de proveedor activo con resultados en más de una página
- WHEN el administrador avanza a la página siguiente
- THEN la vista MUST solicitar esa página con el `providerId` vigente
- AND las filas mostradas MUST pertenecer al conjunto filtrado por ese proveedor

#### Scenario: El DOM queda acotado al tamaño de página

- GIVEN un conjunto filtrado con muchos horarios
- WHEN la vista renderiza una página
- THEN la tabla MUST mostrar como máximo `pageSize` filas
- AND la vista MUST NOT mostrar un selector para cambiar `pageSize`

### Requirement: Sincronización de la lista con la URL

La vista MUST reflejar la página activa y el filtro de proveedor en la URL
mediante los parámetros `page` y `providerId`, y MUST restaurar ese estado al
cargar o recargar con dichos parámetros (deep link), sin recargar la aplicación
al interactuar. La URL MUST omitir `page` cuando la página activa sea `1` y MUST
escribir `providerId` únicamente cuando exista un filtro activo. La navegación
entre páginas MUST usar `router.replace`, de modo que MUST NOT agregar entradas
innecesarias al historial, y MUST NOT reescribir la URL ni disparar una nueva
carga cuando la página destino sea la página activa. Ningún otro parámetro de la
URL existente en la ruta MUST perderse al paginar o filtrar.

#### Scenario: La página queda reflejada en la URL

- GIVEN la lista está en la primera página
- WHEN el administrador avanza a la página 2
- THEN la URL MUST incluir `page=2`
- AND al recargar esa URL la lista MUST restaurar la página 2

#### Scenario: La primera página y el filtro vacío no se escriben

- GIVEN la lista está en la página 2 con un filtro de proveedor activo
- WHEN el administrador regresa a la primera página
- THEN la URL MUST dejar de incluir `page`
- AND la URL MUST seguir incluyendo `providerId` del filtro activo
- WHEN el administrador limpia el filtro
- THEN la URL MUST dejar de incluir `providerId`

#### Scenario: Un enlace con página y filtro restaura el estado

- GIVEN un enlace `?page=2&providerId=<uuid>` de un filtro con resultados
- WHEN el administrador autenticado abre o recarga ese enlace
- THEN el `select` de proveedores MUST mostrar el proveedor de `providerId`
- AND la tabla MUST mostrar la página 2 de los resultados filtrados

#### Scenario: No se reescribe la URL sin cambio

- GIVEN la lista está en la página 2
- WHEN el administrador activa la acción de la página ya activa
- THEN la URL MUST permanecer sin cambios
- AND MUST NOT dispararse una nueva carga del listado

### Requirement: Reinicio a la primera página al cambiar el filtro

Cuando el administrador cambie el filtro de proveedor —seleccionando un
proveedor o limpiando el filtro— la vista MUST volver a la página `1` antes de
solicitar los nuevos resultados, de modo que la página activa nunca quede fuera
del rango del conjunto filtrado y la URL MUST dejar de arrastrar la página
anterior.

#### Scenario: Cambiar el proveedor reinicia la página

- GIVEN la lista está en la página 4 con el filtro en "Todos"
- WHEN el administrador selecciona un proveedor
- THEN la nueva solicitud MUST corresponder a la página 1
- AND la URL MUST dejar de incluir `page=4`

#### Scenario: Limpiar el filtro reinicia la página

- GIVEN la lista está en la página 3 de un proveedor filtrado
- WHEN el administrador activa "Limpiar filtro"
- THEN la solicitud MUST corresponder a la página 1 del listado completo
- AND la URL MUST dejar de incluir `providerId` y `page`

### Requirement: Normalización de una página fuera de rango

Cuando la página solicitada exceda el total de páginas del conjunto filtrado y
exista al menos un horario, la vista MUST resolver a la última página existente
usando `totalPages` de los metadatos devueltos, sin mostrar un estado de error y
sin dejar la URL apuntando a una página inexistente. Mientras llega la respuesta
de la página normalizada, la vista MUST NOT renderizar una tabla vacía y el
control de paginación MUST permanecer visible. Este comportamiento MUST cubrir
tanto un deep link con `page` excedido como el caso de eliminar el último
horario de la última página.

#### Scenario: Deep link con página excedida

- GIVEN un conjunto filtrado que cabe en 1 página
- WHEN el administrador abre `?page=99`
- THEN la vista MUST mostrar la última página existente con sus horarios
- AND MUST NOT mostrar estado de error
- AND la URL MUST reflejar la página normalizada

#### Scenario: Borrar la última fila de la última página

- GIVEN la lista está en la última página, que contiene un solo horario
- WHEN el administrador elimina ese horario
- THEN la vista MUST mostrar la última página existente del conjunto actualizado
- AND MUST NOT quedar en una página vacía por encima del nuevo total

### Requirement: Panel de filtro por proveedor en la vista de horarios

La vista MUST presentar un panel de filtro antes de la tabla con un `select` de
proveedores que incluya una opción vacía "Todos" como valor por defecto, con el
mismo patrón visual del panel de filtros de `/appointments`. Mientras haya un
filtro activo el panel MUST mostrar un botón "Limpiar filtro" que restablezca el
listado completo en la página 1. Las opciones del `select` MUST provenir de los
proveedores registrados (`GET /api/admin/providers`), que la vista ya carga para
el formulario.

#### Scenario: El select ofrece todos los proveedores y la opción Todos

- GIVEN existen proveedores registrados
- WHEN la vista renderiza el panel de filtro
- THEN el `select` MUST incluir la opción "Todos" y una opción por cada proveedor
- AND MUST estar seleccionada la opción "Todos" cuando no hay filtro

#### Scenario: Limpiar filtro solo aparece con filtro activo

- GIVEN la lista sin filtro de proveedor
- WHEN el panel se renderiza
- THEN el botón "Limpiar filtro" MUST NOT mostrarse
- WHEN el administrador selecciona un proveedor
- THEN el botón "Limpiar filtro" MUST mostrarse

### Requirement: Estados vacíos diferenciados en la vista de horarios

La vista MUST distinguir el caso "no hay horarios registrados" del caso "el
filtro activo no tiene coincidencias". Cuando no exista ningún horario
registrado y no haya filtro activo, la vista MUST conservar el mensaje vigente
"No hay horarios registrados.". Cuando haya un filtro activo sin resultados, la
vista MUST mostrar un mensaje propio de filtro sin coincidencias y MUST ofrecer
la acción de limpiar el filtro, sin mostrar el mensaje de catálogo vacío. Cuando
existan resultados en el conjunto filtrado pero la página activa esté vacía, el
control de paginación MUST permanecer visible.

#### Scenario: Filtro sin coincidencias muestra un mensaje propio

- GIVEN el administrador selecciona un proveedor que no tiene horarios
- WHEN la respuesta del servidor llega con `total` = 0 y filtro activo
- THEN la vista MUST mostrar un mensaje de filtro sin coincidencias
- AND MUST ofrecer la acción de limpiar el filtro
- AND MUST NOT mostrar el mensaje "No hay horarios registrados."

#### Scenario: Catálogo vacío conserva el mensaje vigente

- GIVEN no existe ningún horario registrado y no hay filtro activo
- WHEN la vista carga
- THEN la vista MUST mostrar "No hay horarios registrados."

#### Scenario: Una respuesta de página excedida no rompe la vista

- GIVEN un conjunto filtrado con resultados en una sola página
- WHEN la vista recibe una respuesta vacía para una página excedida
- THEN la vista MUST NOT renderizar una tabla vacía
- AND el control de paginación MUST permanecer visible mientras se solicita la página normalizada
