# Treatment Plans Specification

## Purpose

Gestionar los planes de tratamiento del expediente dental: el documento en el que el staff acuerda en consultorio el monto, los procedimientos y el estado del tratamiento con el paciente. Los montos los define el staff en consultorio, nunca el LLM. Los montos en `treatment_plans` son el acuerdo interno; la exposición por WhatsApp se gobierna en fases posteriores y únicamente para planes aceptados. Se respeta el guardrail de dominio "no precios definitivos por WhatsApp".

## Requirements

### Requirement: Authenticated access and confidentiality

Todo acceso a planes de tratamiento MUST requerir sesión de administrador válida. Los datos de planes de tratamiento MUST NOT ser accesibles vía `anon` ni por canales públicos. El LLM no define montos ni precios definitivos; los montos son acordados por el staff en consultorio.

#### Scenario: Unauthenticated request rejected

- GIVEN una petición sin sesión de administrador válida
- WHEN accede a cualquier endpoint de planes de tratamiento
- THEN el sistema MUST responder 401 y MUST NOT devolver datos de planes

#### Scenario: Anon role denied at database level

- GIVEN un rol `anon` sobre las tablas de planes de tratamiento
- WHEN intenta consultarlas directamente
- THEN la consulta MUST ser rechazada por control de acceso a nivel fila

#### Scenario: LLM does not define prices

- GIVEN un plan de tratamiento con ítems y montos
- WHEN el agente de WhatsApp interactúa con el paciente
- THEN el agente MUST NOT comunicar montos ni precios definitivos por WhatsApp

### Requirement: Treatment plan CRUD

El sistema MUST permitir a usuarios autenticados crear, leer, actualizar y eliminar planes de tratamiento para un paciente. Cada plan MUST incluir: paciente (`patient_id`), dentista responsable (`provider_id`), visita clínica de origen opcional (`clinical_visit_id`), nombre (`name`), estado (`status`), monto total (`total_amount`), fecha de aceptación (`accepted_at`) y notas (`notes`).

#### Scenario: Create a treatment plan

- GIVEN un administrador autenticado y un paciente existente
- WHEN crea un plan de tratamiento con los campos requeridos
- THEN el sistema MUST persistir el plan con estado inicial `draft` y `total_amount` en 0.00

#### Scenario: List treatment plans for a patient

- GIVEN un administrador autenticado y un paciente con múltiples planes
- WHEN solicita la lista de planes del paciente
- THEN el sistema MUST devolver todos los planes del paciente ordenados por fecha de creación descendente

#### Scenario: Get a single treatment plan

- GIVEN un administrador autenticado y un plan existente
- WHEN solicita el detalle del plan
- THEN el sistema MUST devolver el plan completo con sus ítems

#### Scenario: Update a treatment plan

- GIVEN un administrador autenticado y un plan en estado `draft`
- WHEN actualiza el nombre o las notas del plan
- THEN el sistema MUST persistir los cambios

#### Scenario: Delete a treatment plan

- GIVEN un administrador autenticado y un plan en estado `draft`
- WHEN elimina el plan
- THEN el sistema MUST eliminar el plan y todos sus ítems asociados

#### Scenario: Unauthenticated creation rejected

- GIVEN una petición sin sesión válida
- WHEN intenta crear un plan de tratamiento
- THEN el sistema MUST responder 401 y MUST NOT persistir datos

#### Scenario: Get non-existent plan returns 404

- GIVEN un administrador autenticado
- WHEN solicita un plan que no existe para el paciente
- THEN el sistema MUST responder 404

### Requirement: Treatment plan status lifecycle

El estado de un plan de tratamiento MUST ser uno de: `draft`, `presented`, `accepted`, `in_progress`, `completed`, `cancelled`. El sistema MUST validar que las transiciones de estado sean coherentes.

#### Scenario: Plan starts in draft status

- GIVEN un plan de tratamiento recién creado
- WHEN se persiste
- THEN su estado inicial MUST ser `draft`

#### Scenario: Transition to accepted populates accepted_at

- GIVEN un plan en estado `presented`
- WHEN el sistema transiciona el plan a `accepted`
- THEN el campo `accepted_at` MUST poblarse con la fecha y hora de la transición

#### Scenario: Transition to accepted from draft is rejected

- GIVEN un plan en estado `draft`
- WHEN se intenta transicionar directamente a `accepted`
- THEN el sistema MUST rechazar la transición (el plan debe pasar por `presented` primero)

#### Scenario: Cancel a plan

- GIVEN un plan en cualquier estado excepto `completed`
- WHEN se transiciona a `cancelled`
- THEN el sistema MUST persistir el cambio de estado

#### Scenario: Completed plan cannot be modified

- GIVEN un plan en estado `completed`
- WHEN se intenta modificar su estado
- THEN el sistema MUST rechazar la modificación

### Requirement: Treatment plan total_amount snapshot semantics

El campo `total_amount` es un snapshot del acuerdo económico. El sistema MUST recalcular `total_amount` automáticamente como la suma de `quantity * unit_price` de todos los ítems SOLO mientras el plan esté en estado `draft`. Una vez que el plan sale de `draft`, el `total_amount` se congela y cualquier mutación de ítems que alteraría el total MUST ser rechazada.

#### Scenario: Total recomputed while in draft

- GIVEN un plan en estado `draft` con dos ítems de 100.00 y 250.00
- WHEN se agrega un tercer ítem de 150.00
- THEN `total_amount` MUST actualizarse a 500.00

#### Scenario: Total recomputed on item edit while in draft

- GIVEN un plan en estado `draft` con un ítem de quantity=2 y unit_price=100.00
- WHEN se edita el ítem a quantity=3
- THEN `total_amount` MUST actualizarse a 300.00

#### Scenario: Total recomputed on item delete while in draft

- GIVEN un plan en estado `draft` con tres ítems que suman 500.00
- WHEN se elimina un ítem de unit_price=150.00
- THEN `total_amount` MUST actualizarse a 350.00

#### Scenario: Item mutation rejected when plan is not in draft

- GIVEN un plan en estado `accepted` con `total_amount` = 500.00
- WHEN se intenta agregar un nuevo ítem
- THEN el sistema MUST rechazar la operación y MUST NOT alterar `total_amount`

#### Scenario: Item edit rejected when plan is not in draft

- GIVEN un plan en estado `presented` con ítems existentes
- WHEN se intenta editar el `unit_price` de un ítem
- THEN el sistema MUST rechazar la operación

#### Scenario: Revert to draft allows item mutations again

- GIVEN un plan que fue transicionado de `draft` a `presented` y de vuelta a `draft`
- WHEN se agrega un nuevo ítem
- THEN el sistema MUST aceptar la operación y MUST recalcular `total_amount`

### Requirement: Treatment plan items CRUD

El sistema MUST permitir a usuarios autenticados crear, leer, actualizar y eliminar ítems dentro de un plan de tratamiento. Cada ítem MUST incluir: descripción (`description`), referencia opcional a servicio (`service_id`), diente en notación FDI opcional (`tooth`), cantidad (`quantity`), precio unitario (`unit_price`) y estado del ítem (`status`).

#### Scenario: Create an item in a draft plan

- GIVEN un administrador autenticado y un plan en estado `draft`
- WHEN crea un ítem con descripción, cantidad y precio unitario
- THEN el sistema MUST persistir el ítem y MUST recalcular `total_amount`

#### Scenario: Create an item with optional service reference

- GIVEN un plan en estado `draft` y un servicio existente en el catálogo
- WHEN se crea un ítem con `service_id` referenciando ese servicio
- THEN el sistema MUST persistir el ítem con la referencia al servicio

#### Scenario: Create an item with FDI tooth notation

- GIVEN un plan en estado `draft`
- WHEN se crea un ítem con `tooth` en notación FDI válida (ej. "11", "26", "47")
- THEN el sistema MUST persistir el ítem con la notación FDI

#### Scenario: Create an item without tooth notation

- GIVEN un plan en estado `draft`
- WHEN se crea un ítem sin especificar `tooth`
- THEN el sistema MUST persistir el ítem con `tooth` = null

#### Scenario: Update an item in a draft plan

- GIVEN un plan en estado `draft` con un ítem existente
- WHEN se actualiza la descripción o el precio unitario del ítem
- THEN el sistema MUST persistir los cambios y MUST recalcular `total_amount`

#### Scenario: Delete an item from a draft plan

- GIVEN un plan en estado `draft` con ítems
- WHEN se elimina un ítem
- THEN el sistema MUST eliminar el ítem y MUST recalcular `total_amount`

#### Scenario: Item CRUD rejected when plan is not in draft

- GIVEN un plan en estado `accepted` con ítems
- WHEN se intenta crear, editar o eliminar un ítem
- THEN el sistema MUST rechazar la operación

#### Scenario: List items for a plan

- GIVEN un administrador autenticado y un plan con múltiples ítems
- WHEN solicita los ítems del plan
- THEN el sistema MUST devolver todos los ítems del plan

### Requirement: Treatment plan item status

El estado de un ítem MUST ser uno de: `pending` o `done`. El estado del ítem es independiente del estado del plan.

#### Scenario: Item starts in pending status

- GIVEN un ítem recién creado en un plan
- WHEN se persiste
- THEN su estado inicial MUST ser `pending`

#### Scenario: Mark item as done

- GIVEN un ítem en estado `pending`
- WHEN se transiciona a `done`
- THEN el sistema MUST persistir el cambio de estado

#### Scenario: Mark item back to pending

- GIVEN un ítem en estado `done`
- WHEN se transiciona de vuelta a `pending`
- THEN el sistema MUST persistir el cambio de estado

### Requirement: Treatment plan field validation

El sistema MUST validar los campos de planes e ítems antes de persistir. `total_amount` y `unit_price` MUST ser numéricos con precisión de 12 dígitos y 2 decimales (MXN). `quantity` MUST ser un entero positivo. `unit_price` MUST ser no negativo. La notación FDI (`tooth`) MUST seguir el formato válido o ser null.

#### Scenario: Reject negative unit_price

- GIVEN un administrador autenticado creando un ítem
- WHEN envía `unit_price` = -50.00
- THEN el sistema MUST rechazar la operación con un error de validación

#### Scenario: Reject zero or negative quantity

- GIVEN un administrador autenticado creando un ítem
- WHEN envía `quantity` = 0 o `quantity` = -1
- THEN el sistema MUST rechazar la operación con un error de validación

#### Scenario: Reject invalid FDI tooth notation

- GIVEN un administrador autenticado creando un ítem
- WHEN envía `tooth` = "99" (notación FDI inválida)
- THEN el sistema MUST rechazar la operación con un error de validación

#### Scenario: Accept valid FDI tooth notation

- GIVEN un administrador autenticado creando un ítem
- WHEN envía `tooth` = "18" (notación FDI válida)
- THEN el sistema MUST persistir el ítem con la notación FDI

#### Scenario: Accept null tooth notation

- GIVEN un administrador autenticado creando un ítem
- WHEN envía `tooth` = null
- THEN el sistema MUST persistir el ítem con `tooth` = null

#### Scenario: Reject invalid plan status

- GIVEN un administrador autenticado actualizando un plan
- WHEN envía `status` = "unknown_status"
- THEN el sistema MUST rechazar la operación con un error de validación

#### Scenario: Reject invalid item status

- GIVEN un administrador autenticado actualizando un ítem
- WHEN envía `status` = "invalid"
- THEN el sistema MUST rechazar la operación con un error de validación

#### Scenario: Monetary precision

- GIVEN un ítem con `quantity` = 3 y `unit_price` = 100.50
- WHEN se calcula la contribución al total
- THEN la contribución MUST ser 301.50 (precisión de 2 decimales)

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
