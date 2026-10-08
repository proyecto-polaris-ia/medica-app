# Delta for Admin Appointments

**Change**: agregar-paginacion-citas
**Baseline**: ninguno (capability nueva; se crea
`openspec/specs/admin-appointments/spec.md`)

## ADDED Requirements

### Requirement: Paginación del listado de citas del panel
El endpoint `GET /api/admin/appointments` en su **modo lista** MUST devolver como
máximo `pageSize` citas por respuesta y MUST incluir los metadatos de paginación
`pagination: { total, page, pageSize, totalPages }`. El parámetro `page` MUST ser
un entero mayor o igual a `1` y MUST tener default `1`; `pageSize` MUST ser un
entero entre `1` y `100` y MUST tener default `20`. El endpoint MUST solicitar la
página con un desplazamiento equivalente a `(page - 1) * pageSize` y MUST contar
el total de forma exacta sobre el conjunto filtrado. Cuando la página solicitada
exceda el total de páginas, el endpoint MUST responder un arreglo `appointments`
vacío conservando los metadatos intactos, sin recortar el valor de `page`. La
paginación MUST aplicarse únicamente en modo lista y MUST NOT aplicarse en modo
calendario.

#### Scenario: Primera página con el tamaño por defecto
- GIVEN más de 20 citas en el conjunto filtrado
- WHEN un usuario autenticado consulta `GET /api/admin/appointments?page=1&pageSize=20`
- THEN la respuesta MUST incluir como máximo 20 citas
- AND `pagination.page` MUST ser `1`, `pagination.pageSize` MUST ser `20` y
  `pagination.total` MUST ser el total del conjunto filtrado

#### Scenario: Segunda página no repite filas de la primera
- GIVEN un conjunto filtrado de 45 citas
- WHEN el usuario consulta `page=2` con `pageSize=20`
- THEN la respuesta MUST incluir a lo sumo 20 citas
- AND ninguna cita devuelta MUST repetir una cita de la primera página
- AND `pagination.totalPages` MUST ser `3`

#### Scenario: Página más allá del total devuelve una página vacía
- GIVEN un conjunto filtrado de 5 citas con `pageSize=20`
- WHEN el usuario consulta `page=9`
- THEN `appointments` MUST ser un arreglo vacío
- AND `pagination.total` MUST conservarse en `5` y `pagination.totalPages` en `1`
- AND `pagination.page` MUST conservarse en `9`

#### Scenario: Defaults cuando no se envían parámetros de página
- GIVEN una petición `GET /api/admin/appointments` sin parámetros
- WHEN el endpoint la resuelve en modo lista
- THEN MUST usar `page=1` y `pageSize=20`
- AND la respuesta MUST incluir `pagination`

### Requirement: Metadatos de paginación sobre el conjunto filtrado
El valor `total` de los metadatos de paginación MUST reflejar el número de citas
que cumplen **todos** los filtros activos, y `totalPages` MUST calcularse como
`Math.ceil(total / pageSize)` (`0` cuando `total` es `0`). La paginación MUST
aplicarse **después** de los filtros, de modo que cambiar un filtro MUST alterar
`total` y `totalPages` de forma coherente con las filas devueltas.

#### Scenario: El total respeta los filtros activos
- GIVEN 30 citas en total, de las cuales 7 pertenecen a un proveedor dado
- WHEN el usuario consulta el listado con `providerId` de ese proveedor
- THEN `pagination.total` MUST ser `7`
- AND las citas devueltas MUST pertenecer todas a ese proveedor

#### Scenario: El total cambia al cambiar un filtro
- GIVEN una consulta previa con un filtro que devuelve `pagination.total = 30`
- WHEN el usuario agrega un filtro de servicio que reduce el conjunto a 4 citas
- THEN `pagination.total` MUST pasar a `4`
- AND `pagination.totalPages` MUST recalcularse con el nuevo total

### Requirement: Filtros server-side del listado de citas
El endpoint `GET /api/admin/appointments` en modo lista MUST aceptar los filtros
`serviceId`, `patientId` y `providerId`, y SHOULD aceptar el rango de fechas
opcional `start`/`end`. Los filtros MUST aplicarse en el servidor antes de
calcular `total` y antes de paginar, y MUST componerse entre sí con AND. Cuando se
envía `start` y `end`, el endpoint MUST validar que `end` sea posterior a `start`
y que el rango no exceda 62 días. Cuando se envía solo uno de `start`/`end` en
modo lista, el endpoint MUST rechazar la petición con `400`.

#### Scenario: Combinación de filtros con AND
- GIVEN citas de dos proveedores y tres servicios
- WHEN el usuario consulta con `providerId` de A y `serviceId` de X
- THEN únicamente las citas del proveedor A con el servicio X MUST aparecer
- AND `pagination.total` MUST contar solo esa intersección

#### Scenario: Rango de fechas inválido en modo lista
- GIVEN una consulta de lista con `start` posterior a `end`
- WHEN el endpoint valida el rango
- THEN MUST responder `400`
- AND MUST NOT devolver `appointments` ni `pagination`

### Requirement: Ordenamiento server-side con whitelist
El endpoint MUST aceptar el parámetro `sort` limitado al whitelist `start_at` y
`created_at`, con default `start_at`, y el parámetro `sortDir` limitado a `asc` y
`desc`, con default `desc`. El ordenamiento MUST aplicarse en el servidor sobre el
conjunto filtrado y antes de paginar, de modo que el orden sea estable entre
páginas. Un valor de `sort` o `sortDir` fuera del dominio MUST rechazarse con
`400`.

#### Scenario: Orden descendente por fecha de inicio por defecto
- GIVEN varias citas con fechas de inicio distintas
- WHEN el usuario consulta el listado sin enviar `sort` ni `sortDir`
- THEN las citas MUST devolverse ordenadas por `start_at` descendente

#### Scenario: Orden ascendente por fecha de creación
- GIVEN varias citas con fechas de creación distintas
- WHEN el usuario consulta con `sort=created_at` y `sortDir=asc`
- THEN las citas MUST devolverse ordenadas por `created_at` ascendente

#### Scenario: Parámetro de orden fuera del dominio
- GIVEN una petición con `sort=patient_name`
- WHEN el endpoint valida el parámetro
- THEN MUST responder `400`

### Requirement: Validación de los parámetros de consulta
El endpoint MUST validar los parámetros de paginación y de orden y MUST responder
`400` cuando alguno sea inválido: `page` no entero o menor que `1`, `pageSize` no
entero o fuera del rango `1..100`, `sort` fuera del whitelist o `sortDir` fuera de
`asc`/`desc`. Una petición inválida MUST NOT devolver `appointments` ni
`pagination`.

#### Scenario: page inválido
- GIVEN una petición con `page=0`
- WHEN el endpoint la resuelve
- THEN MUST responder `400`

#### Scenario: pageSize fuera de rango
- GIVEN una petición con `pageSize=101`
- WHEN el endpoint la resuelve
- THEN MUST responder `400`

#### Scenario: sortDir inválido
- GIVEN una petición con `sortDir=up`
- WHEN el endpoint la resuelve
- THEN MUST responder `400`

### Requirement: Modo calendario sin paginación
Cuando la petición incluye `start` y `end` y no incluye parámetros de paginación
(`page` ni `pageSize`), el endpoint MUST operar en modo calendario y MUST
conservar el comportamiento actual: devolver `{ appointments }` con todas las
citas del rango, ordenadas por `start_at` ascendente, **sin** el objeto
`pagination` y sin aplicar paginación. El modo calendario MUST seguir validando el
rango y MUST NOT verse afectado por el ordenamiento, los filtros de paginación ni
el estado de la lista.

#### Scenario: La vista de calendario conserva su contrato
- GIVEN la vista de calendario solicita su mes con `start` y `end`
- WHEN el endpoint resuelve la petición
- THEN la respuesta MUST contener `appointments` con todas las citas del rango
- AND la respuesta MUST NOT contener la propiedad `pagination`

#### Scenario: El calendario no se pagina
- GIVEN un mes con más de 20 citas dentro del rango solicitado
- WHEN el calendario solicita el rango sin parámetros de paginación
- THEN MUST devolverse todas las citas del rango
- AND el número de citas MUST NOT limitarse a `pageSize`

### Requirement: Componente de paginación reutilizable en la lista
La vista de lista MUST mostrar un control de paginación reutilizable debajo de la
tabla de citas con acciones de primera página, página anterior, indicador de la
página actual respecto del total, página siguiente y última página. El control
MUST deshabilitar las acciones que no tienen destino y MUST ser operable por
teclado. El control MUST ser genérico (sin depender del dominio de citas) para
poder reutilizarse en otros listados administrativos.

#### Scenario: La lista muestra el control de paginación
- GIVEN un listado filtrado con más de una página
- WHEN la lista renderiza sus resultados
- THEN MUST mostrar las acciones de primera, anterior, siguiente y última página
- AND MUST mostrar el indicador de la página actual y el total de páginas

#### Scenario: Acciones deshabilitadas en los extremos
- GIVEN la lista está en la primera página
- WHEN el control renderiza
- THEN las acciones de primera y anterior MUST estar deshabilitadas
- AND las acciones de siguiente y última MUST estar habilitadas

#### Scenario: Una sola página no muestra controles
- GIVEN un listado cuyo total cabe en una sola página
- WHEN la lista renderiza
- THEN el control MUST NOT mostrar acciones de navegación entre páginas

### Requirement: Sincronización de la página con la URL
La página activa de la lista MUST reflejarse en la URL como el parámetro `page` y
MUST ser compartible por enlace directo (deep link). La URL MUST omitir el
parámetro `page` cuando la página activa sea `1`. La página activa MUST
inicializarse una sola vez desde la URL y la navegación entre páginas MUST
actualizar la URL sin recargar la pantalla y sin agregar entradas innecesarias al
historial. Cuando la página destino sea la página activa, el sistema MUST NOT
reescribir la URL ni disparar una nueva carga. La URL de paginación MUST conservar
los parámetros `providerId` y `serviceId` del calendario cuando estén presentes,
sin eliminarlos ni sobreescribirlos.

#### Scenario: La página se refleja en la URL
- GIVEN la lista está en la primera página
- WHEN el usuario avanza a la página 2
- THEN la URL MUST incluir `page=2`
- AND al recargar la página con esa URL la lista MUST restaurar la página 2

#### Scenario: La primera página no agrega el parámetro
- GIVEN la lista está en la página 2
- WHEN el usuario regresa a la primera página
- THEN la URL MUST NOT incluir el parámetro `page`

#### Scenario: No se reescribe la URL sin cambio de página
- GIVEN la lista está en la página 2
- WHEN el usuario activa la acción de la página ya activa
- THEN la URL MUST permanecer sin cambios
- AND MUST NOT dispararse una nueva carga del listado

#### Scenario: La paginación no pisa los filtros del calendario
- GIVEN una URL con `providerId` y `serviceId` activos
- WHEN el usuario cambia de página en la lista
- THEN la URL MUST conservar `providerId` y `serviceId`
- AND MUST incluir el nuevo `page`

### Requirement: Reinicio a la primera página al cambiar filtros
Cuando el usuario cambia cualquier filtro del listado (servicio, paciente,
proveedor, rango de fechas) o el ordenamiento, la lista MUST volver a la página
`1` antes de solicitar los nuevos resultados, de modo que la página activa nunca
quede fuera del rango del conjunto filtrado.

#### Scenario: Cambiar un filtro reinicia la página
- GIVEN la lista está en la página 4 con un filtro activo
- WHEN el usuario cambia el valor del filtro de servicio
- THEN la nueva solicitud MUST corresponder a la página `1`
- AND la URL MUST dejar de incluir `page=4`

#### Scenario: Cambiar el orden reinicia la página
- GIVEN la lista está en la página 3
- WHEN el usuario cambia el campo de ordenamiento
- THEN la nueva solicitud MUST corresponder a la página `1`

### Requirement: Estado vacío de una página sin filas
Cuando la página activa no tenga citas, la lista MUST mostrar un estado vacío
explícito en lugar de una tabla vacía. El estado vacío MUST distinguir entre un
conjunto filtrado sin resultados, un listado sin citas registradas y una página
fuera de rango con resultados existentes. Cuando existan resultados en el conjunto
filtrado pero la página activa esté vacía, el control de paginación MUST
permanecer visible para permitir regresar a una página con filas.

#### Scenario: Página fuera de rango con resultados existentes
- GIVEN un conjunto filtrado con 5 citas en una sola página
- WHEN el usuario abre una URL con `page=9`
- THEN la lista MUST mostrar un estado vacío explícito de página sin filas
- AND el control de paginación MUST permanecer visible
- AND la tabla de citas MUST NOT renderizarse

#### Scenario: Filtros sin resultados
- GIVEN la lista tiene filtros activos que no coinciden con ninguna cita
- WHEN la lista renderiza los resultados
- THEN MUST mostrarse el estado vacío de filtros sin coincidencias
- AND MUST NOT mostrarse una tabla vacía

### Requirement: Preservación de la página al alternar vistas
La página activa de la lista MUST preservarse cuando el usuario alterna entre la
vista de Lista y la vista de Calendario y los filtros no cambian. El cambio de
vista MUST NOT disparar una reescritura de la URL ni reiniciar la página.

#### Scenario: Volver a la lista conserva la página
- GIVEN la lista está en la página 3 y el usuario cambia al calendario
- WHEN el usuario regresa a la vista de Lista sin cambiar filtros
- THEN la lista MUST seguir en la página `3`
- AND la URL MUST conservar `page=3`
