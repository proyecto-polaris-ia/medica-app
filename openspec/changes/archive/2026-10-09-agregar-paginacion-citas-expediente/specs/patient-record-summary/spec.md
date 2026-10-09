# Delta Spec: Record del paciente sin listas de citas y secciones paginadas

**Change**: agregar-paginacion-citas-expediente
**Capability**: `patient-record-summary` (existente)

Alcance: el contrato del record deja de incluir las listas de citas y las
secciones de citas se renderizan paginadas. Todo lo demás de la capacidad queda
sin cambios.

## MODIFIED Requirements

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
