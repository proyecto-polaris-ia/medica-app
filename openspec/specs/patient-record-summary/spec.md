# Patient Record Summary Specification

## Purpose

Provide the patient record surface for authenticated clinic staff, showing patient identity data with editable ficha de identificación plus future and attended appointments as the foundation of the clinical expediente.

## Requirements

### Requirement: Authenticated patient record API

The system MUST expose a server-side admin API that returns the patient's identification data, ficha de identificación and appointment summary only to authenticated users. The patient data section MUST be editable via the patient update API.

#### Scenario: Authenticated user receives record

- GIVEN an authenticated admin
- WHEN they request the patient record
- THEN the API MUST return patient identification data, ficha de identificación, future appointments, and attended appointments for that patient

#### Scenario: Unauthenticated user rejected

- GIVEN a request without a valid admin session
- WHEN it requests the patient record
- THEN the API MUST return `401` and MUST NOT expose patient data

### Requirement: Patient data section

La vista del expediente del paciente MUST mostrar nombre completo, teléfono, email, notas, fecha de registro y ficha de identificación (fecha de nacimiento, sexo, dirección, ocupación, fuente de referencia, teléfono secundario, nombre de contacto de emergencia, teléfono de contacto de emergencia y relación del contacto de emergencia) con valores vacíos explícitos cuando falten campos opcionales. Los campos de ficha de identificación MUST ser editables mediante la API de actualización de paciente. La vista del expediente MUST organizarse en pestañas: `Datos`, `Historia`, `Consultas`, `Citas`, `Plan de tratamiento` y `Pagos`.
(Previously: La vista del expediente organizaba las pestañas `Datos`, `Historia`, `Consultas` y `Citas`, sin la pestaña financiera `Pagos`.)

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

#### Scenario: Las pestañas incluyen pagos

- GIVEN un administrador autenticado consulta un expediente de paciente
- WHEN la navegación del expediente se renderiza
- THEN las pestañas MUST incluir `Datos`, `Historia`, `Consultas`, `Citas`, `Plan de tratamiento` y `Pagos`
### Requirement: Future appointments section

The patient record view MUST show future appointments for the patient sorted by start time ascending, excluding cancelled, rescheduled, no-show, and attended appointments. This section is accessible under the Citas tab.

#### Scenario: Future appointments sorted

- GIVEN two future active appointments for the same patient
- WHEN the record renders
- THEN the earliest future appointment MUST appear first

### Requirement: Attended appointments section

The patient record view MUST show appointments for the patient with status `attended`, sorted by start time descending. This section is accessible under the Citas tab.

#### Scenario: Attended appointments history

- GIVEN attended appointments for the patient
- WHEN the record renders
- THEN the most recent attended appointment MUST appear first
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

