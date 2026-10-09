# Delta for Admin Panel

**Change**: agregar-filtro-proveedor-horarios
**Baseline**: openspec/specs/admin-panel/spec.md

## ADDED Requirements

### Requirement: Filtro por proveedor en la lista de horarios
La lista de horarios (`/business-hours`) MUST ofrecer un panel de filtros arriba
de la tabla con un selector nativo de proveedores. El selector MUST poblarse con
el catálogo de proveedores que la página ya carga y MUST incluir una opción
"Todos" con valor vacío, seleccionada por defecto. Al elegir un proveedor, la
tabla MUST mostrar únicamente los horarios de ese proveedor. Al elegir "Todos" la
tabla MUST mostrar todos los horarios. El filtrado MUST aplicarse en memoria
sobre los horarios ya cargados y MUST NOT modificar la petición al endpoint de
horarios ni su contrato.

#### Scenario: Selección por defecto muestra todos los horarios
- GIVEN la lista de horarios recién cargada y sin filtro aplicado
- WHEN el panel de filtros se renderiza
- THEN el selector de proveedores MUST mostrar "Todos" como valor seleccionado
- AND la tabla MUST mostrar los horarios de todos los proveedores

#### Scenario: Seleccionar un proveedor filtra sus horarios
- GIVEN la lista de horarios con registros de más de un proveedor
- WHEN la secretaria selecciona un proveedor en el selector
- THEN la tabla MUST mostrar únicamente los horarios de ese proveedor
- AND los horarios de los demás proveedores MUST NOT mostrarse

#### Scenario: Regresar a "Todos" restaura la lista completa
- GIVEN la lista de horarios filtrada por un proveedor
- WHEN la secretaria selecciona "Todos" en el selector
- THEN la tabla MUST mostrar nuevamente los horarios de todos los proveedores

#### Scenario: El filtro no cambia la petición al endpoint
- GIVEN la lista de horarios cargada
- WHEN la secretaria cambia el proveedor seleccionado
- THEN MUST NOT emitirse una nueva petición al endpoint de horarios
- AND el endpoint MUST seguir devolviendo el conjunto completo de horarios

### Requirement: Limpieza del filtro por proveedor
El panel de filtros MUST mostrar una acción "Limpiar filtro" únicamente cuando
exista un proveedor seleccionado. Activarla MUST devolver el selector a "Todos" y
la tabla a la lista completa de horarios. La limpieza MUST afectar únicamente a
este filtro y MUST NOT alterar los datos cargados, el estado del modal ni las
operaciones de alta, edición o eliminación.

#### Scenario: La acción de limpieza aparece solo con filtro activo
- GIVEN la lista de horarios sin proveedor seleccionado
- WHEN el panel de filtros se renderiza
- THEN la acción "Limpiar filtro" MUST NOT mostrarse
- AND al seleccionar un proveedor la acción MUST mostrarse

#### Scenario: Activar la acción devuelve a "Todos"
- GIVEN un proveedor seleccionado y la tabla acotada a sus horarios
- WHEN la secretaria activa "Limpiar filtro"
- THEN el selector MUST volver a "Todos"
- AND la tabla MUST mostrar los horarios de todos los proveedores

#### Scenario: Limpiar no altera los datos cargados
- GIVEN un proveedor seleccionado con horarios visibles
- WHEN la secretaria activa "Limpiar filtro"
- THEN el conjunto de horarios cargados MUST conservarse sin cambios
- AND MUST NOT emitirse una nueva petición al endpoint de horarios

### Requirement: Sincronización del filtro con la URL
La selección de proveedor MUST reflejarse en la URL como `?providerId=<id>`. Al
abrir la vista con `?providerId=<id>` (deep link), el selector MUST quedar en ese
proveedor y la tabla MUST mostrar únicamente sus horarios. Al no existir el
parámetro, la vista MUST mostrar todos los horarios. La URL MUST actualizarse sin
recargar la vista y sin agregar entradas al historial de navegación.

#### Scenario: Seleccionar escribe el parámetro en la URL
- GIVEN la lista de horarios sin `providerId` en la URL
- WHEN la secretaria selecciona un proveedor
- THEN la URL MUST contener `?providerId=<id>` de ese proveedor
- AND la vista MUST NOT recargarse ni agregar una entrada al historial desde la
  selección del filtro

#### Scenario: Deep link abre la vista filtrada
- GIVEN una URL con `?providerId=<id>` de un proveedor existente
- WHEN la vista de horarios se abre
- THEN el selector MUST quedar en ese proveedor
- AND la tabla MUST mostrar únicamente los horarios de ese proveedor

#### Scenario: Sin parámetro se muestran todos
- GIVEN una URL sin el parámetro `providerId`
- WHEN la vista de horarios se abre
- THEN el selector MUST quedar en "Todos"
- AND la tabla MUST mostrar los horarios de todos los proveedores

### Requirement: Persistencia del filtro y estado vacío del proveedor
El proveedor seleccionado MUST conservarse cuando la página vuelve a cargar los
datos después de crear, editar o eliminar un horario. Cuando el proveedor
seleccionado no tenga horarios registrados, la vista MUST mostrar un estado vacío
con un mensaje propio que identifique al proveedor, y MUST NOT presentar el
mensaje general de lista sin horarios.

#### Scenario: El filtro sobrevive a la edición
- GIVEN la lista filtrada por un proveedor
- WHEN la secretaria edita un horario de ese proveedor y la página recarga los
  datos
- THEN el selector MUST conservar el proveedor seleccionado
- AND la tabla MUST seguir mostrando únicamente los horarios de ese proveedor

#### Scenario: El filtro sobrevive a la eliminación
- GIVEN la lista filtrada por un proveedor
- WHEN la secretaria elimina un horario y la página recarga los datos
- THEN el selector MUST conservar el proveedor seleccionado
- AND la tabla MUST seguir acotada a ese proveedor

#### Scenario: Proveedor sin horarios muestra su propio estado vacío
- GIVEN un proveedor seleccionado que no tiene horarios registrados
- WHEN la vista renderiza el resultado del filtro
- THEN MUST mostrarse un estado vacío con un mensaje propio del proveedor
- AND MUST NOT mostrarse el mensaje general de lista sin horarios
