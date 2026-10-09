# Patient Record Summary Specification

## Purpose

Provide the patient record surface for authenticated clinic staff, showing patient identity data with editable ficha de identificación; future and attended appointments load through the paginated endpoints of the `patient-record-appointments` capability as the foundation of the clinical expediente.

## Requirements

### Requirement: Authenticated patient record API

The system MUST expose a server-side admin API that returns the patient's
identification data and ficha de identificación only to authenticated users.
The response MUST NOT include the patient's appointment lists: las citas del
expediente MUST consumirse exclusivamente de los endpoints paginados de la
capacidad `patient-record-appointments`. The patient data section MUST be
editable via the patient update API.
(Previously: The system exposed a server-side admin API that returned the
patient's identification data, ficha de identificación and appointment summary,
including future and attended appointments.)

#### Scenario: Authenticated user receives record

- GIVEN an authenticated admin
- WHEN they request the patient record
- THEN the API MUST return patient identification data and ficha de
  identificación for that patient
- AND the response MUST NOT include `upcomingAppointments` or `attendedAppointments`

#### Scenario: Unauthenticated user rejected

- GIVEN a request without a valid admin session
- WHEN it requests the patient record
- THEN the API MUST return `401` and MUST NOT expose patient data

### Requirement: Patient data section

La vista del expediente del paciente MUST mostrar nombre completo, teléfono, email, notas, fecha de registro y ficha de identificación (fecha de nacimiento, sexo, dirección, ocupación, fuente de referencia, teléfono secundario, nombre de contacto de emergencia, teléfono de contacto de emergencia y relación del contacto de emergencia) con valores vacíos explícitos cuando falten campos opcionales. Los campos de ficha de identificación MUST ser editables mediante la API de actualización de paciente. La vista del expediente MUST organizarse en pestañas: `Datos`, `Historia`, `Consultas`, `Citas`, `Plan de tratamiento` y `Pagos`.
(Previously: La vista del expediente organizaba las pestañas `Datos`, `Historia`, `Consultas` y `Citas`, sin las pestañas `Plan de tratamiento` y `Pagos`.)

#### Scenario: Campos de contacto opcionales faltantes

- GIVEN un paciente no tiene teléfono, email o notas
- WHEN el expediente se renderiza
- THEN cada campo faltante MUST mostrar un placeholder visible en lugar de desaparecer

#### Scenario: Campos opcionales de ficha faltantes

- GIVEN un paciente no tiene fecha de nacimiento, dirección u ocupación
- WHEN la pestaña `Datos` se renderiza
- THEN cada campo faltante de la ficha MUST mostrar un placeholder visible en lugar de desaparecer

#### Scenario: Editar datos de identificación del paciente

- GIVEN un administrador autenticado consulta la pestaña `Datos`
- WHEN actualiza campos de la ficha de identificación y guarda
- THEN el sistema MUST persistir los cambios y reflejarlos en el expediente del paciente

#### Scenario: Las pestañas incluyen plan de tratamiento y pagos

- GIVEN un administrador autenticado consulta un expediente de paciente
- WHEN la navegación del expediente se renderiza
- THEN las pestañas MUST incluir `Datos`, `Historia`, `Consultas`, `Citas`, `Plan de tratamiento` y `Pagos`

#### Scenario: Plan de tratamiento tab lists patient plans

- GIVEN an authenticated admin viewing the patient record of a patient with treatment plans
- WHEN they select the "Plan de tratamiento" tab
- THEN the system MUST display the list of treatment plans with status, responsible dentist, and total amount

### Requirement: Future appointments section

La pestaña `Citas` del expediente MUST mostrar las citas futuras del paciente
(page 1 por defecto, orden `start_at` ascendente, estados activos, máximo
`pageSize` filas) consumiendo el endpoint paginado
`GET /api/admin/patients/[id]/appointments/upcoming` de la capacidad
`patient-record-appointments`. El detalle de paginación, URL, carga y vacío de
la sección se especifica en esa capacidad.
(Previously: The patient record view showed all future appointments for the
patient sorted by start time ascending, embedded in the record payload.)

#### Scenario: Future appointments sorted

- GIVEN two future active appointments for the same patient
- WHEN la primera página de la sección se renderiza
- THEN the earliest future appointment MUST appear first

#### Scenario: Future appointments stay bounded

- GIVEN un paciente con más citas futuras que `pageSize`
- WHEN la sección se renderiza
- THEN la sección MUST mostrar como máximo `pageSize` filas
- AND MUST NOT requerir el record para obtenerlas

### Requirement: Attended appointments section

La pestaña `Citas` del expediente MUST mostrar las citas asistidas del paciente
(page 1 por defecto, orden `start_at` descendente, máximo `pageSize` filas)
consumiendo el endpoint paginado
`GET /api/admin/patients/[id]/appointments/attended` de la capacidad
`patient-record-appointments`. El detalle de paginación, URL, carga y vacío de
la sección se especifica en esa capacidad.
(Previously: The patient record view showed all attended appointments for the
patient sorted by start time descending, embedded in the record payload.)

#### Scenario: Attended appointments history

- GIVEN attended appointments for the patient
- WHEN la primera página de la sección se renderiza
- THEN the most recent attended appointment MUST appear first

#### Scenario: Attended appointments stay bounded

- GIVEN un paciente con un historial largo de citas asistidas
- WHEN la sección se renderiza
- THEN la sección MUST mostrar como máximo `pageSize` filas
- AND MUST NOT requerir el record para obtenerlas

### Requirement: Pestaña Pagos en expediente del paciente

El expediente del paciente MUST incluir una pestaña `Pagos` para usuarios administrativos autenticados. La pestaña MUST mostrar el saldo global del paciente, saldos por plan de tratamiento, pagos a cuenta sin plan asociado, historial de pagos y controles para registrar o reversar pagos manuales según las reglas de la capacidad `payments`.

#### Scenario: Pestaña Pagos visible en expediente

- GIVEN un usuario administrativo autenticado consulta el expediente de un paciente
- WHEN se renderiza la navegación del expediente
- THEN el sistema MUST mostrar la pestaña `Pagos` junto con las demás pestañas del expediente

#### Scenario: Pagos muestra saldo e historial

- GIVEN un paciente con planes elegibles y pagos registrados
- WHEN un usuario administrativo abre la pestaña `Pagos`
- THEN el sistema MUST mostrar el saldo global del paciente
- AND MUST mostrar los saldos por plan de tratamiento
- AND MUST mostrar el historial de pagos del paciente

#### Scenario: Pagos distingue pagos a cuenta

- GIVEN un paciente tiene pagos sin plan asociado
- WHEN un usuario administrativo abre la pestaña `Pagos`
- THEN el sistema MUST mostrar esos pagos como pagos a cuenta
- AND MUST NOT presentarlos como pagos asignados a un plan específico

#### Scenario: Estado vacío de pagos

- GIVEN un paciente no tiene pagos registrados
- WHEN un usuario administrativo abre la pestaña `Pagos`
- THEN el sistema MUST mostrar un estado vacío claro
- AND SHOULD ofrecer el flujo para registrar el primer pago manual

#### Scenario: Error al cargar pagos

- GIVEN un usuario administrativo autenticado consulta el expediente de un paciente
- WHEN falla la carga de pagos o saldos
- THEN la pestaña `Pagos` MUST mostrar un estado de error recuperable
- AND MUST NOT ocultar las demás secciones del expediente
