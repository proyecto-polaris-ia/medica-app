# Delta for Admin Appointments

**Change**: buscar-paciente-autocomplete-citas
**Baseline**: ninguno en `openspec/specs/` (la capability `admin-appointments` no
existe como baseline en este worktree; el delta se expresa íntegramente como
**ADDED Requirements**)

## ADDED Requirements

### Requirement: Filtro de paciente por autocompletado en la lista
La lista de citas MUST ofrecer el filtro de paciente como un campo de texto con
autocompletado, en lugar de un selector con el catálogo completo de pacientes. El
campo MUST conservar la etiqueta visible "Paciente" y MUST estar asociado a ella
para que sea localizable por tecnología asistiva. Seleccionar una sugerencia MUST
mostrar el nombre completo del paciente en el campo y MUST aplicar el filtro por
el identificador del paciente, de la misma forma en que la lista ya filtra hoy. El
campo MUST mostrar el nombre del paciente seleccionado mientras el filtro esté
aplicado.

#### Scenario: Seleccionar una sugerencia aplica el filtro por identificador
- GIVEN la lista de citas sin filtro de paciente y coincidencias disponibles
- WHEN la secretaria escribe al menos 2 caracteres y selecciona una sugerencia
- THEN el campo MUST mostrar el nombre completo del paciente seleccionado
- AND la siguiente petición del listado MUST incluir el identificador de ese paciente como filtro

#### Scenario: El filtro aplicado se refleja en el campo
- GIVEN un filtro de paciente aplicado por una selección previa
- WHEN la lista vuelve a renderizar
- THEN el campo MUST mostrar el nombre del paciente seleccionado
- AND el panel de sugerencias MUST permanecer cerrado mientras el campo no tenga foco

#### Scenario: La búsqueda no modifica el contrato del endpoint de pacientes
- GIVEN el campo consulta el listado administrativo de pacientes
- WHEN la consulta se emite
- THEN MUST usar el parámetro de búsqueda textual existente del endpoint de pacientes
- AND MUST NOT requerir parámetros nuevos ni cambiar la forma de la respuesta

### Requirement: Búsqueda progresiva con debounce y descarte de respuestas obsoletas
El campo MUST consultar el listado administrativo de pacientes únicamente cuando
el texto tenga al menos 2 caracteres después de recortar espacios. El campo MUST
esperar un intervalo de debounce de 300 milisegundos antes de emitir la consulta,
de modo que teclear varios caracteres seguidos MUST producir una sola petición con
el texto final. El campo MUST descartar los resultados de una consulta anterior
que llegue después de una consulta más reciente, y MUST cerrar el panel y limpiar
las sugerencias cuando el texto quede por debajo del mínimo. Al desmontarse el
campo, MUST cancelar la consulta pendiente y MUST NOT actualizar estado.

#### Scenario: Tecleo rápido produce una sola consulta
- GIVEN el campo enfocado y sin selección
- WHEN la secretaria teclea "mar" sin pausas mayores al debounce
- THEN MUST emitirse una sola consulta con el texto "mar"

#### Scenario: Texto por debajo del mínimo no consulta
- GIVEN el campo enfocado
- WHEN la secretaria escribe "m" o solo espacios
- THEN MUST NOT emitirse ninguna consulta de pacientes
- AND el panel de sugerencias MUST NOT mostrarse

#### Scenario: Una respuesta obsoleta no pisa a la vigente
- GIVEN una consulta anterior que aún no responde
- WHEN la secretaria completa un texto nuevo y la consulta nueva responde primero
- THEN el panel MUST mostrar las sugerencias de la consulta más reciente
- AND los resultados de la consulta anterior MUST NOT reemplazarlos

#### Scenario: Menos de dos caracteres cierra el panel
- GIVEN un panel de sugerencias visible
- WHEN la secretaria borra el texto hasta dejar menos de 2 caracteres
- THEN el panel MUST cerrarse
- AND las sugerencias anteriores MUST NOT quedar visibles

### Requirement: Panel de sugerencias: visibilidad, cierre y resaltado
El panel de sugerencias MUST mostrarse únicamente cuando el campo tenga foco y
existan coincidencias. Cuando no haya coincidencias, el panel MUST NOT
renderizarse. El panel MUST cerrarse al seleccionar una sugerencia, al perder el
foco del campo y al presionar `Escape`. Cada sugerencia MUST mostrar el nombre
completo del paciente y MUST resaltar el fragmento del nombre que coincide con el
texto buscado, sin perder el nombre accesible completo de la opción. Cuando el
texto buscado no aparezca literalmente en el nombre —por ejemplo, una coincidencia
por teléfono o correo— la sugerencia MUST mostrarse sin resaltado y sin error.
Mientras las coincidencias estén en vuelo, el campo MAY mostrar un aviso de
búsqueda en curso; si la consulta falla, el campo MUST mostrar un mensaje de error
y MUST NOT renderizar el panel con resultados incompletos.

#### Scenario: Sin coincidencias no hay panel
- GIVEN el campo enfocado con 2 o más caracteres
- WHEN la consulta no devuelve pacientes
- THEN el panel de sugerencias MUST NOT renderizarse
- AND la lista de citas MUST conservar su estado sin cambios

#### Scenario: Seleccionar cierra el panel
- GIVEN un panel con sugerencias visibles
- WHEN la secretaria selecciona una sugerencia
- THEN el panel MUST cerrarse
- AND el campo MUST conservar el foco o reflejar la selección sin panel abierto

#### Scenario: Perder el foco cierra el panel
- GIVEN un panel con sugerencias visibles
- WHEN el campo pierde el foco
- THEN el panel MUST cerrarse

#### Scenario: Resaltado del fragmento coincidente
- GIVEN un paciente cuyo nombre contiene el texto buscado
- WHEN la sugerencia se renderiza
- THEN el fragmento coincidente MUST resaltarse visualmente
- AND el nombre accesible completo del paciente MUST seguir siendo anunciado por la opción

#### Scenario: Coincidencia fuera del nombre
- GIVEN una consulta que coincide con un paciente por teléfono o correo
- WHEN la sugerencia se renderiza
- THEN el nombre MUST mostrarse como texto plano
- AND MUST NOT producirse un error de renderizado

#### Scenario: Error de consulta
- GIVEN el campo enfocado con texto suficiente para consultar
- WHEN la consulta de pacientes falla
- THEN MUST mostrarse un mensaje de error
- AND el panel de sugerencias MUST NOT renderizarse

### Requirement: Navegación por teclado y accesibilidad del autocompletado
El campo de búsqueda MUST ser operable únicamente con teclado y MUST exponer el
patrón accesible de autocompletado: el campo MUST anunciar su estado expandido, la
lista de sugerencias MUST exponerse como un conjunto de opciones seleccionables y
la opción activa MUST anunciarse como tal. `↓` y `↑` MUST mover la opción activa
dentro de la lista, `Enter` MUST seleccionar la opción activa y `Escape` MUST
cerrar el panel sin cambiar la selección aplicada. Cuando el panel esté abierto y
no haya una opción activa, `Enter` MUST NOT aplicar ninguna selección.

#### Scenario: Navegar y seleccionar con teclado
- GIVEN un panel con varias sugerencias visibles
- WHEN la secretaria presiona `↓` para activar la primera opción y luego `Enter`
- THEN la primera sugerencia MUST seleccionarse
- AND el filtro de paciente MUST quedar aplicado

#### Scenario: Escape cierra sin seleccionar
- GIVEN un panel con sugerencias visibles y sin selección nueva
- WHEN la secretaria presiona `Escape`
- THEN el panel MUST cerrarse
- AND la selección aplicada MUST permanecer sin cambios

#### Scenario: Enter sin opción activa no selecciona
- GIVEN un panel abierto sin ninguna opción activa
- WHEN la secretaria presiona `Enter`
- THEN MUST NOT aplicarse ninguna selección de paciente

#### Scenario: Roles y atributos anunciados
- GIVEN el campo de búsqueda con el panel abierto
- WHEN una tecnología asistiva inspecciona el control
- THEN el campo MUST anunciar el estado expandido y su lista asociada
- AND la lista MUST exponerse como opciones y la opción activa MUST exponerse como seleccionada

### Requirement: Limpieza del filtro de paciente
El campo MUST ofrecer una acción visible de limpieza cuando exista un paciente
seleccionado, y activarla MUST vaciar el campo y devolver el filtro al estado "sin
filtro de paciente". Vaciar el texto del campo también MUST limpiar el filtro
aplicado. En ambos casos, la siguiente petición del listado MUST NOT incluir el
identificador de paciente y la lista MUST volver a la primera página. La limpieza
del filtro MUST NOT alterar los demás filtros de la lista.

#### Scenario: La acción de limpieza devuelve a "Todos"
- GIVEN un filtro de paciente aplicado
- WHEN la secretaria activa la acción de limpieza del campo
- THEN el campo MUST quedar vacío
- AND la siguiente petición del listado MUST NOT incluir el identificador de paciente
- AND la lista MUST solicitar la primera página

#### Scenario: Vaciar el texto limpia el filtro
- GIVEN un filtro de paciente aplicado
- WHEN la secretaria borra todo el texto del campo
- THEN el filtro de paciente aplicado MUST limpiarse
- AND los demás filtros de la lista MUST conservar su valor

### Requirement: Integración del filtro de paciente con los filtros existentes
El filtro de paciente MUST convivir con los filtros de servicio, proveedor y rango
de fechas de la lista, y MUST combinarse con ellos de forma conjuntiva. La acción
"Limpiar filtros" de la lista MUST limpiar también el filtro de paciente y MUST
dejar el campo vacío. El formulario de alta y edición de citas MUST seguir
mostrando su selector de pacientes con el catálogo completo y MUST NOT verse
afectado por la búsqueda del panel de filtros.

#### Scenario: Combinación con los filtros existentes
- GIVEN un filtro de servicio y un rango de fechas activos
- WHEN la secretaria selecciona un paciente en el autocompletado
- THEN la petición del listado MUST incluir los tres filtros a la vez
- AND la lista MUST solicitar la primera página

#### Scenario: "Limpiar filtros" limpia también el paciente
- GIVEN un filtro de paciente aplicado junto con otros filtros
- WHEN la secretaria activa "Limpiar filtros"
- THEN el campo de búsqueda de paciente MUST quedar vacío
- AND la petición del listado MUST NOT incluir el identificador de paciente

#### Scenario: El formulario conserva el catálogo completo
- GIVEN el formulario de alta o edición de una cita
- WHEN el selector de pacientes se despliega
- THEN MUST mostrar los pacientes del catálogo completo
- AND MUST NOT depender del texto del filtro de la lista

### Requirement: Componente reutilizable de búsqueda de pacientes
La búsqueda de paciente con autocompletado MUST estar encapsulada en un componente
reutilizable que reciba su valor seleccionado y notifique los cambios de selección
a quien lo consume. El componente MUST NOT depender del estado de la lista de
citas, de sus filtros ni de la URL, y MUST poder montarse en otra superficie
administrativa notificando la selección por su interfaz pública. La limpieza, el
mínimo de caracteres, el debounce y la navegación por teclado MUST residir en el
componente, no en la página que lo consume.

#### Scenario: El componente funciona fuera de la lista de citas
- GIVEN el componente montado de forma aislada con su interfaz pública
- WHEN la secretaria busca y selecciona un paciente
- THEN el componente MUST notificar la selección a quien lo consume
- AND MUST NOT escribir la URL ni reiniciar la página de la lista por sí mismo

#### Scenario: La página conserva la responsabilidad del filtro
- GIVEN el componente montado en la lista de citas
- WHEN la selección cambia o se limpia
- THEN la página MUST traducir esa selección al filtro del listado
- AND MUST aplicar el regreso a la primera página
