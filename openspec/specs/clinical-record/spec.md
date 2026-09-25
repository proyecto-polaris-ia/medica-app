# Clinical Record Specification

## Purpose

Gestionar el expediente clínico del paciente: historia clínica 1:1 y notas de evolución SOAP. Todo acceso MUST restringirse a staff autenticado; los datos clínicos son confidenciales y MUST NOT exponerse vía `anon`.

## Requirements

### Requirement: Authenticated access and confidentiality

Todo acceso a datos clínicos MUST requerir sesión de administrador válida. Los datos clínicos MUST NOT ser accesibles vía `anon` ni por canales públicos.

#### Scenario: Unauthenticated request rejected

- GIVEN una petición sin sesión de administrador válida
- WHEN accede a cualquier endpoint de historia clínica o notas SOAP
- THEN el sistema MUST responder 401 y MUST NOT devolver datos clínicos

#### Scenario: Anon role denied at database level

- GIVEN un rol `anon` sobre las tablas clínicas
- WHEN intenta consultarlas directamente
- THEN la consulta MUST ser rechazada por control de acceso a nivel fila

### Requirement: Medical history 1:1 retrieval and replacement

Cada paciente MAY tener exactamente un registro de historia clínica con: alergias, condiciones sistémicas y medicamentos actuales (arreglos JSON), embarazo, trastornos de coagulación, anticoagulantes, antecedente quirúrgico, enfermedades infecciosas, tabaquismo, alcoholismo, historia dental, hábitos orales (JSON) y notas clínicas. El sistema MUST permitir obtener y reemplazar (UPSERT) la historia completa de un paciente.

#### Scenario: Retrieve existing medical history

- GIVEN un administrador autenticado y un paciente con historia clínica
- WHEN solicita la historia clínica del paciente
- THEN el sistema MUST devolver todos los campos de la historia

#### Scenario: Retrieve medical history when none exists

- GIVEN un paciente sin historia clínica registrada
- WHEN se solicita su historia clínica
- THEN el sistema MUST devolver valores vacíos y MUST NOT devolver error

#### Scenario: Replace medical history

- GIVEN un administrador autenticado con la historia existente de un paciente
- WHEN envía un reemplazo completo
- THEN el sistema MUST persistir la nueva historia completa

### Requirement: Medical history warning badge

Cuando la historia clínica contenga alergias o condiciones sistémicas, el sistema MUST mostrar una insignia de advertencia roja visible en el expediente.

#### Scenario: Patient with allergies shows warning

- GIVEN un paciente cuya historia clínica tiene alergias registradas
- WHEN se renderiza su expediente
- THEN el sistema MUST mostrar una insignia roja visible

#### Scenario: Patient without allergies or conditions shows no warning

- GIVEN un paciente sin alergias ni condiciones sistémicas
- WHEN se renderiza su expediente
- THEN no se muestra ninguna insignia de advertencia

### Requirement: SOAP clinical visit notes CRUD

El sistema MUST permitir a usuarios autenticados crear, leer, editar y eliminar notas SOAP vinculadas a un paciente. El campo `assessment` MUST ser texto libre redactado por el dentista; el sistema MUST NOT generar ni sugerir diagnósticos automáticamente. Cada nota MUST incluir: motivo (S), hallazgos (O), valoración clínica (A), plan (P), tratamiento realizado y notas. Cada nota MAY vincularse a una cita y al dentista responsable.

#### Scenario: Create a clinical visit note

- GIVEN un dentista autenticado
- WHEN crea una nota SOAP con los campos requeridos
- THEN el sistema MUST persistir la nota vinculada al paciente

#### Scenario: Unauthenticated creation rejected

- GIVEN una petición sin sesión válida
- WHEN intenta crear una nota SOAP
- THEN el sistema MUST responder 401 y MUST NOT persistir datos

#### Scenario: Assessment is free text from dentist

- GIVEN un dentista autenticado que crea una nota SOAP
- WHEN proporciona el campo de valoración como texto libre
- THEN el sistema MUST persistir el texto sin alterarlo

### Requirement: Clinical visits listing

El sistema MUST permitir listar las notas de evolución de un paciente ordenadas por fecha descendente.

#### Scenario: List clinical visits for a patient

- GIVEN un administrador autenticado y un paciente con múltiples notas SOAP
- WHEN solicita la lista de consultas del paciente
- THEN el sistema MUST devolver las notas de la más reciente a la más antigua