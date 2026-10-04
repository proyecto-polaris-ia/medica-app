# Delta: treatment-plans

## MODIFIED Requirements

### Requirement: Treatment plan CRUD

El sistema MUST permitir a usuarios autenticados crear, leer, actualizar y eliminar planes de tratamiento para un paciente. Cada plan MUST incluir: paciente (`patient_id`), dentista responsable (`provider_id`), visita clínica de origen opcional (`clinical_visit_id`), nombre (`name`), estado (`status`), monto total (`total_amount`), fecha de aceptación (`accepted_at`) y notas (`notes`). La creación de un plan con ítems MUST ser atómica respecto a los datos de entrada: si algún ítem es inválido, el sistema MUST NOT persistir ninguna fila (ni plan ni ítems).

#### Scenario: Create a treatment plan

- GIVEN un administrador autenticado y un paciente existente
- WHEN crea un plan de tratamiento con los campos requeridos
- THEN el sistema MUST persistir el plan con estado inicial `draft` y `total_amount` en 0.00

#### Scenario: Invalid item aborts creation without persisting rows

- GIVEN un administrador autenticado y un paciente existente
- WHEN intenta crear un plan con al menos un ítem inválido (diente FDI fuera de rango, `unitPrice` negativo o descripción vacía)
- THEN el sistema MUST responder con error de validación (422) y MUST NOT existir ninguna fila en `treatment_plans` ni en `treatment_plan_items` correspondiente al intento
