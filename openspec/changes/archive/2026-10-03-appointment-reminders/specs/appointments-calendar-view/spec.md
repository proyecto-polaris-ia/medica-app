# Delta for Appointments Calendar View

## ADDED Requirements

### Requirement: Recordatorio y confirmación visibles en la vista de cita

La vista de cita del panel MUST mostrar si se envió un recordatorio, indicando la
cadencia y su fecha, y MUST mostrar el estado de confirmación de la cita.

#### Scenario: Cita con recordatorio de 24 a 36 horas enviado

- GIVEN una cita con recordatorio de 24 a 36 horas antes ya enviado
- WHEN el staff abre la vista de esa cita
- THEN la vista MUST mostrar que se envió el recordatorio
- AND MUST mostrar la fecha del envío

#### Scenario: Cita sin recordatorios

- GIVEN una cita sin ningún recordatorio enviado
- WHEN el staff abre la vista de esa cita
- THEN la vista MUST mostrar un estado neutro o MUST omitir el bloque de recordatorio
- AND MUST NOT mostrar una fecha de recordatorio inexistente

#### Scenario: Cita confirmada muestra su estado

- GIVEN una cita confirmada
- WHEN el staff abre la vista de esa cita
- THEN la vista MUST mostrar el estado de confirmación de la cita
