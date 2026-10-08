# Admin Patients UI Specification

## Purpose

Comportamiento visible de la vista administrativa de pacientes: listado base,
búsqueda con autocomplete y debounce, controles de paginación, sincronización
del estado con la URL, estado vacío diferenciado por búsqueda y estados de carga
y error. El contrato HTTP del listado se especifica en la capacidad
`admin-patients-api`. Originada en la change `patient-list-search-pagination`
(issue #167).

## Requirements

### Requirement: Listado base de pacientes

La vista administrativa de pacientes MUST seguir presentando la tabla con las
columnas y acciones vigentes (acceso al expediente, nombre, teléfono, correo,
notas, edición y eliminación) cuando no hay búsqueda activa. La tabla MUST
mostrar únicamente los pacientes de la página solicitada al servidor y MUST NOT
exceder el tamaño de página informado por el servidor.

#### Scenario: Sin búsqueda se conservan columnas y acciones
- GIVEN un administrador con pacientes registrados
- WHEN abre la vista de pacientes sin búsqueda activa
- THEN la tabla MUST mostrar las columnas Expediente, Nombre, Teléfono, Correo y Notas
- AND cada fila MUST conservar el acceso al expediente y las acciones de edición y eliminación

#### Scenario: La tabla muestra solo la página solicitada
- GIVEN existen más pacientes que el tamaño de página del servidor
- WHEN la vista carga la primera página
- THEN la tabla MUST mostrar como máximo la cantidad de pacientes de esa página
- AND la vista MUST indicar que existe más de una página

### Requirement: Búsqueda con autocomplete y debounce

La vista MUST ofrecer un campo de búsqueda ubicado antes de la tabla. Mientras el
texto tenga menos de 2 caracteres la vista MUST NOT consultar sugerencias al
servidor y MUST mostrar el listado completo en la página 1. Con 2 o más
caracteres la vista MUST consultar al servidor y MUST presentar sugerencias
derivadas de la base de datos que incluyan al menos el nombre y el teléfono del
paciente. La consulta de sugerencias MUST aplicarse con un retardo (debounce) de
aproximadamente 300 ms desde la última edición del campo, de modo que la
escritura continua produzca una sola consulta por pausa. Al seleccionar una
sugerencia la tabla MUST mostrar únicamente a ese paciente y la vista MUST volver
a la página 1. Al limpiar el campo la vista MUST restaurar el listado completo
paginado.

#### Scenario: Por debajo del mínimo no se consultan sugerencias
- GIVEN la vista de pacientes está abierta
- WHEN el administrador escribe un solo carácter en el campo de búsqueda
- THEN la vista MUST NOT consultar sugerencias al servidor
- AND la tabla MUST seguir mostrando el listado completo desde la página 1

#### Scenario: Se muestran sugerencias con nombre y teléfono
- GIVEN existen pacientes que coinciden con el texto capturado
- WHEN el administrador escribe 2 o más caracteres y transcurre la pausa del debounce
- THEN la vista MUST mostrar sugerencias provenientes de la base de datos
- AND cada sugerencia MUST mostrar al menos el nombre y el teléfono del paciente
- AND la vista MUST realizar una sola consulta de sugerencias por pausa de escritura

#### Scenario: Sin coincidencias no hay sugerencias
- GIVEN ningún paciente coincide con el texto capturado
- WHEN el administrador escribe 2 o más caracteres y transcurre la pausa del debounce
- THEN la vista MUST NOT mostrar sugerencias

#### Scenario: Seleccionar una sugerencia filtra la tabla
- GIVEN la vista muestra sugerencias para la búsqueda capturada
- WHEN el administrador selecciona una sugerencia
- THEN la tabla MUST mostrar únicamente al paciente seleccionado
- AND la vista MUST volver a la página 1

#### Scenario: Limpiar el campo restaura el listado completo
- GIVEN hay una búsqueda activa o un paciente seleccionado
- WHEN el administrador limpia el campo de búsqueda
- THEN la vista MUST restaurar el listado completo paginado en la página 1

### Requirement: Controles de paginación

La vista MUST presentar controles de paginación con las acciones de página
anterior y página siguiente, más un indicador de página actual sobre total
("Página X de Y") que MUST usar el total informado por el servidor. El control de
página anterior MUST estar deshabilitado en la primera página y el de página
siguiente MUST estar deshabilitado en la última. Al cambiar de página la vista
MUST solicitar esa página al servidor y MUST actualizar las filas sin recargar la
aplicación ni perder la búsqueda activa. Los controles MUST reflejar los metadatos
de la última respuesta paginada recibida.

#### Scenario: Avanzar a la página siguiente
- GIVEN la vista muestra la página 1 de un listado con más de una página
- WHEN el administrador activa la acción de página siguiente
- THEN la vista MUST solicitar la página 2 y MUST mostrar sus pacientes
- AND el indicador MUST mostrar la página 2 sobre el total informado por el servidor

#### Scenario: Controles deshabilitados en los extremos
- GIVEN un listado con más de una página
- WHEN la vista muestra la primera página
- THEN la acción de página anterior MUST estar deshabilitada
- WHEN la vista muestra la última página
- THEN la acción de página siguiente MUST estar deshabilitada

#### Scenario: Cambiar de página conserva la búsqueda activa
- GIVEN una búsqueda activa con más resultados que una página
- WHEN el administrador avanza de página
- THEN la página mostrada MUST corresponder a los resultados filtrados por esa búsqueda

### Requirement: Sincronización del estado con la URL

La vista MUST reflejar la búsqueda y la página en la URL mediante los parámetros
`q` y `page`, y MUST restaurar ese estado al cargar o recargar con dichos
parámetros (enlace compartido o deep-link), incluyendo el texto del campo de
búsqueda y la página solicitada, sin recargar la aplicación al interactuar. La
página indicada en la URL MUST normalizarse contra el total de páginas
disponible; una página fuera de rango MUST resolverse a la última página
existente sin mostrar error. Limpiar la búsqueda MUST eliminar `q` y reiniciar
`page` a 1.

#### Scenario: La interacción actualiza la URL
- GIVEN el administrador busca o navega entre páginas
- WHEN cambia la búsqueda o la página
- THEN la URL MUST reflejar los valores vigentes de `q` y `page`
- AND la actualización MUST ocurrir mediante navegación del cliente, sin recarga completa de la aplicación

#### Scenario: Un enlace con búsqueda y página restaura el estado
- GIVEN un enlace con `q` y `page` de una búsqueda existente
- WHEN el administrador abre o recarga ese enlace
- THEN el campo de búsqueda MUST mostrar el texto de `q`
- AND la tabla MUST mostrar esa página de los resultados filtrados

#### Scenario: Página fuera de rango se normaliza
- GIVEN un enlace cuyo parámetro `page` excede el total de páginas disponible
- WHEN la vista carga ese enlace
- THEN la vista MUST mostrar la última página existente
- AND MUST NOT mostrar un estado de error

#### Scenario: Limpiar la búsqueda limpia la URL
- GIVEN hay una búsqueda activa con `q` y `page` en la URL
- WHEN el administrador limpia el campo de búsqueda
- THEN la URL MUST dejar de incluir `q`
- AND `page` MUST volver a 1

### Requirement: Estado vacío diferenciado por búsqueda

La vista MUST distinguir el caso "no hay pacientes registrados" del caso "la
búsqueda no arrojó resultados". Cuando una búsqueda activa no arroja resultados,
la vista MUST mostrar un mensaje que indique que no hubo coincidencias para esa
búsqueda y MUST ofrecer la acción de limpiar la búsqueda. Cuando no existe ningún
paciente registrado y no hay búsqueda activa, la vista MUST conservar el mensaje
de lista vacía vigente y MUST NOT mostrarlo como resultado de una búsqueda.

#### Scenario: Búsqueda sin resultados muestra un mensaje propio
- GIVEN el administrador busca un texto que no coincide con ningún paciente
- WHEN la respuesta del servidor llega sin resultados
- THEN la vista MUST mostrar un mensaje de que no hubo coincidencias para la búsqueda
- AND MUST ofrecer la acción de limpiar la búsqueda
- AND MUST NOT mostrar el mensaje de que no hay pacientes registrados

#### Scenario: Sin pacientes registrados se conserva el mensaje vigente
- GIVEN no existe ningún paciente registrado y no hay búsqueda activa
- WHEN la vista carga
- THEN la vista MUST mostrar el mensaje de que no hay pacientes registrados

#### Scenario: Limpiar desde el estado sin resultados restaura la lista
- GIVEN la vista muestra el estado de búsqueda sin coincidencias
- WHEN el administrador limpia la búsqueda
- THEN la vista MUST restaurar el listado completo paginado en la página 1

### Requirement: Estados de carga y error

La vista MUST mostrar un estado de carga mientras hay una consulta de listado en
vuelo y MUST NOT mostrar el estado vacío antes de recibir la respuesta. Ante un
error de consulta la vista MUST mostrar el estado de error con una acción de
reintento, y al reintentar MUST repetir la consulta vigente (misma búsqueda y
misma página).

#### Scenario: La carga en curso no muestra el estado vacío
- GIVEN la vista solicita pacientes al servidor
- WHEN la respuesta todavía no llega
- THEN la vista MUST mostrar el estado de carga
- AND MUST NOT mostrar el estado vacío

#### Scenario: El reintento repite la consulta vigente
- GIVEN una consulta con una búsqueda y una página determinadas falla
- WHEN la vista muestra el estado de error y el administrador activa reintentar
- THEN la vista MUST repetir la misma búsqueda en la misma página
