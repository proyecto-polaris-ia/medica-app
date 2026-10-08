# Delta para Treatment Plans

## MODIFIED Requirements

### Requirement: Treatment plan tab in patient record

El expediente del paciente MUST incluir una pestaña "Plan de tratamiento" que liste los planes del paciente mostrando estado, dentista responsable y monto total. La pestaña MUST ofrecer un editor con los ítems del plan y un total en vivo. La pestaña MUST ofrecer además una vista de detalle de solo lectura del plan completo con sus ítems, accesible desde cada plan del listado, que muestre el desglose económico y permita el cierre sin perder el contexto del expediente.

(Previously: la pestaña solo describía el listado, el estado vacío y el editor; el detalle de consulta del plan no existía como comportamiento observable.)

#### Scenario: Tab shows plans list with status, dentist and total

- GIVEN un administrador autenticado viewing el expediente de un paciente con planes
- WHEN selecciona la pestaña "Plan de tratamiento"
- THEN el sistema MUST mostrar una lista de planes con su estado, dentista responsable y monto total

#### Scenario: Tab shows empty state when no plans exist

- GIVEN un administrador autenticado viewing el expediente de un paciente sin planes
- WHEN selecciona la pestaña "Plan de tratamiento"
- THEN el sistema MUST mostrar un estado vacío indicando que no hay planes

#### Scenario: Editor shows items with live total

- GIVEN un administrador autenticado viewing un plan en estado `draft`
- WHEN abre el editor del plan
- THEN el sistema MUST mostrar los ítems del plan con un total que se actualiza en vivo al agregar, editar o eliminar ítems

#### Scenario: Editor is read-only for non-draft plans

- GIVEN un administrador autenticado viewing un plan en estado `accepted`
- WHEN abre el detalle del plan
- THEN el sistema MUST mostrar los ítems en modo solo lectura sin opción de editar

#### Scenario: Detail opens from clicking a plan card

- GIVEN un administrador autenticado en la pestaña "Plan de tratamiento" con al menos un plan
- WHEN hace clic sobre la card de un plan
- THEN el sistema MUST abrir la vista de detalle de ese plan

#### Scenario: Detail opens from the explicit "Ver detalle" action

- GIVEN un administrador autenticado en la pestaña "Plan de tratamiento" con al menos un plan
- WHEN activa la acción "Ver detalle" de ese plan (con clic o con teclado)
- THEN el sistema MUST abrir la vista de detalle de ese plan

#### Scenario: Detail shows plan fields

- GIVEN un administrador autenticado
- WHEN abre la vista de detalle de un plan
- THEN el sistema MUST mostrar el nombre del plan, su estado en español, el dentista responsable, la fecha de creación, la fecha de aceptación cuando `accepted_at` tiene valor y las notas cuando existen

#### Scenario: Detail lists items with line cost and item status

- GIVEN un plan con al menos un ítem
- WHEN el administrador abre la vista de detalle
- THEN el sistema MUST mostrar por cada ítem su descripción, su diente en notación FDI cuando existe, su cantidad, su costo unitario, su costo de línea calculado como `cantidad × costo unitario` y su estado del ítem ("Pendiente" o "Realizado")

#### Scenario: Detail shows subtotal and stored total

- GIVEN un plan con ítems
- WHEN el administrador abre la vista de detalle
- THEN el sistema MUST mostrar el subtotal como la suma de `cantidad × costo unitario` de los ítems y MUST mostrar el total como el monto guardado del plan (`total_amount`), sin recalcularlo ni sustituirlo por el subtotal
- AND el sistema MUST NOT mostrar líneas de descuento ni de impuesto

#### Scenario: Draft plan offers editing from the detail view

- GIVEN un administrador autenticado
- WHEN abre la vista de detalle de un plan en estado `draft`
- THEN el sistema MUST ofrecer la acción "Editar"
- AND al activarla MUST abrir el flujo de edición existente del plan con sus ítems

#### Scenario: Non-draft plan is read-only in the detail view

- GIVEN un plan en estado `presented`, `accepted`, `in_progress`, `completed` o `cancelled`
- WHEN el administrador abre la vista de detalle
- THEN el sistema MUST mostrar el detalle y los ítems en modo solo lectura y MUST NOT ofrecer acciones de edición, eliminación ni cambio de estado

#### Scenario: Detail closes with X, outside click and Escape

- GIVEN un administrador autenticado con la vista de detalle abierta
- WHEN activa el botón de cierre (✕) o hace clic fuera del panel o presiona `Escape`
- THEN el sistema MUST cerrar la vista de detalle y MUST dejar el expediente en la pestaña "Plan de tratamiento" con su listado intacto

#### Scenario: Detail shows a loading state

- GIVEN un administrador autenticado que abre la vista de detalle de un plan
- WHEN la petición del plan todavía está en curso
- THEN el sistema MUST mostrar un estado de carga del detalle

#### Scenario: Detail shows an error state when the fetch fails

- GIVEN un administrador autenticado que abre la vista de detalle de un plan
- WHEN la petición del plan falla
- THEN el sistema MUST mostrar un mensaje de error, MUST permitir reintentar la carga y MUST permitir cerrar la vista de detalle

#### Scenario: Detail is legible on small screens

- GIVEN un administrador autenticado en un viewport de móvil
- WHEN abre la vista de detalle de un plan con ítems
- THEN el sistema MUST mostrar el panel dentro de la pantalla, con el contenido del plan y su tabla de ítems legible sin recortar datos
