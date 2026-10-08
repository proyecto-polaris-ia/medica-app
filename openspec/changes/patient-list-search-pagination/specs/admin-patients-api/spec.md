# Delta Spec: Lectura del listado administrativo de pacientes con búsqueda y paginación

**Change**: patient-list-search-pagination
**Capability**: `admin-patients-api` (nueva)
**Baseline**: capacidad nueva; no existe spec previa en `openspec/specs/`

Alcance: este spec cubre únicamente la lectura (`GET`) del recurso de pacientes.
Las operaciones de escritura (alta, edición y eliminación) conservan su contrato
vigente sin cambios.

## ADDED Requirements

### Requirement: Listado paginado con respuesta aditiva

La lectura del listado administrativo de pacientes MUST responder una colección
paginada del lado del servidor. La respuesta MUST conservar la clave `patients`
con la misma forma y los mismos campos por paciente que el contrato vigente
(identificador, nombre completo, teléfono E.164, correo electrónico, notas,
fecha de creación y fecha de actualización) y, de forma aditiva, MUST incluir
`page` (base 1), `pageSize`, `total` y `totalPages`. `total` MUST ser el número
de pacientes que satisfacen la consulta y `totalPages` MUST ser el número de
páginas que los cubren, con un mínimo de 1, de modo que una lista sin resultados
reporte `total` = 0 y `totalPages` = 1. El orden de los pacientes MUST ser
estable entre páginas.

#### Scenario: Lectura sin parámetros usa los valores por defecto
- GIVEN un administrador autenticado
- WHEN consulta el listado sin `q`, `page` ni `pageSize`
- THEN la respuesta MUST ser exitosa con `page` = 1 y `pageSize` = 20
- AND `patients` MUST contener como máximo `pageSize` pacientes

#### Scenario: La respuesta sigue siendo compatible con los consumidores actuales
- GIVEN un consumidor que solo lee la clave `patients`
- WHEN consulta el listado con o sin parámetros
- THEN la respuesta MUST seguir exponiendo `patients` como un arreglo de pacientes con los mismos campos que antes del cambio

#### Scenario: Listado sin resultados reporta metadatos coherentes
- GIVEN no existe ningún paciente
- WHEN el administrador autenticado consulta el listado
- THEN `patients` MUST ser un arreglo vacío
- AND `total` MUST ser 0 y `totalPages` MUST ser 1

#### Scenario: La paginación es estable entre páginas
- GIVEN existen más pacientes que el tamaño de página
- WHEN se solicitan dos páginas consecutivas
- THEN los pacientes de la segunda página MUST ser los siguientes en el orden estable del listado
- AND MUST NOT repetir los pacientes ya devueltos en la primera página, salvo por cambios concurrentes en los datos

### Requirement: Búsqueda textual sobre nombre, teléfono y correo

El listado MUST aceptar un parámetro de búsqueda textual `q`. Cuando `q` esté
ausente, sea vacío o contenga solo espacios, el servicio MUST comportarse como
una consulta sin filtro. Cuando `q` tenga contenido, el servicio MUST devolver
únicamente los pacientes cuyo nombre completo, teléfono E.164 o correo
electrónico coincidan con el texto buscado, y esa búsqueda MUST combinarse con
la paginación. `total` y `totalPages` MUST calcularse sobre los resultados ya
filtrados y el filtro MUST aplicarse antes de recortar la página, de modo que
una misma búsqueda pueda recorrerse por páginas sin perder coincidencias.

#### Scenario: Coincidencia por nombre completo
- GIVEN un paciente cuyo nombre completo contiene el texto buscado
- WHEN el administrador autenticado consulta el listado con ese `q`
- THEN ese paciente MUST aparecer en `patients`

#### Scenario: Coincidencia por teléfono o correo
- GIVEN un paciente cuyo teléfono o correo coincide con el texto buscado
- WHEN el administrador autenticado consulta el listado con ese `q`
- THEN ese paciente MUST aparecer en `patients`
- AND los pacientes que no coinciden por nombre, teléfono ni correo MUST NOT aparecer

#### Scenario: Búsqueda vacía equivale a listado sin filtro
- GIVEN existen pacientes registrados
- WHEN el administrador consulta el listado con `q` vacío o solo espacios
- THEN la respuesta MUST contener el listado completo paginado desde la página 1

#### Scenario: Búsqueda y paginación se combinan
- GIVEN 3 pacientes coinciden con `q` y el tamaño de página solicitado es 2
- WHEN se solicita la página 1 de esa búsqueda
- THEN `patients` MUST contener 2 coincidencias, `total` MUST ser 3 y `totalPages` MUST ser 2
- WHEN se solicita la página 2 de la misma búsqueda
- THEN `patients` MUST contener la coincidencia restante

#### Scenario: Búsqueda sin coincidencias
- GIVEN ningún paciente coincide con el texto buscado
- WHEN el administrador consulta el listado con ese `q`
- THEN `patients` MUST ser un arreglo vacío y `total` MUST ser 0
- AND la respuesta MUST ser exitosa para que la vista pueda distinguir "sin coincidencias"

### Requirement: Manejo defensivo de los parámetros de paginación

Los parámetros `page` y `pageSize` MUST interpretarse de forma defensiva. Los
valores no numéricos, cero, negativos o no enteros MUST resolverse a los valores
por defecto (`page` = 1, `pageSize` = 20) en lugar de producir un error.
`pageSize` MUST estar acotado por un máximo de 100 y los valores mayores MUST
saturarse a ese máximo. Ninguna combinación de `q`, `page` o `pageSize` MUST
producir una respuesta de error interno.

#### Scenario: Valores inválidos caen a los defaults
- GIVEN un administrador autenticado
- WHEN consulta el listado con `page` o `pageSize` no numéricos, cero o negativos
- THEN la respuesta MUST ser exitosa y MUST resolver los valores inválidos a `page` = 1 y `pageSize` = 20
- AND el servicio MUST NOT responder con un error interno

#### Scenario: Tamaño de página por encima del tope se satura
- GIVEN un administrador autenticado
- WHEN consulta el listado con `pageSize` mayor a 100
- THEN la respuesta MUST usar 100 como tamaño de página efectivo
- AND `patients` MUST NOT exceder 100 elementos

#### Scenario: Página fuera de rango no es un error
- GIVEN un listado con menos páginas que la página solicitada
- WHEN el administrador consulta esa página fuera de rango
- THEN la respuesta MUST ser exitosa con `patients` vacío
- AND los metadatos `total` y `totalPages` MUST seguir describiendo el listado real

### Requirement: Acceso autenticado al listado

La lectura del listado administrativo MUST seguir requiriendo una sesión válida.
Una solicitud sin sesión MUST rechazarse con `401` y cuerpo
`{ "error": "unauthorized" }`, y MUST NOT exponer datos de pacientes. Este
cambio MUST NOT alterar la verificación de sesión vigente.

#### Scenario: Solicitud sin sesión es rechazada
- GIVEN una solicitud al listado sin sesión válida
- WHEN el servicio procesa la solicitud
- THEN la respuesta MUST ser `401` con `{ "error": "unauthorized" }`
- AND MUST NOT incluir datos de pacientes

#### Scenario: Solicitud con sesión válida es atendida
- GIVEN un administrador con sesión válida
- WHEN consulta el listado con cualquier combinación válida de `q`, `page` y `pageSize`
- THEN la respuesta MUST ser exitosa y MUST incluir los metadatos de paginación
