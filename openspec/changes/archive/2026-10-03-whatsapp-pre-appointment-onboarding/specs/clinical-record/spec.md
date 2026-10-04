# Delta for Clinical Record

## MODIFIED Requirements

### Requirement: Medical history 1:1 retrieval and replacement

Cada paciente MAY tener exactamente un registro de historia clínica con: alergias, condiciones sistémicas y medicamentos actuales (arreglos JSON), embarazo, trastornos de coagulación, anticoagulantes, antecedente quirúrgico, enfermedades infecciosas, tabaquismo, alcoholismo, historia dental, hábitos orales (JSON), notas clínicas y procedencia del dato. El sistema MUST permitir obtener y reemplazar (UPSERT) la historia completa de un paciente. El contrato 1:1 de obtención y reemplazo MUST permanecer sin cambios.

(Previously: El registro de historia clínica no incluía un campo de procedencia del dato; el contrato 1:1 de obtención y reemplazo ya estaba vigente.)

#### Scenario: Retrieve existing medical history

- GIVEN un administrador autenticado y un paciente con historia clínica
- WHEN solicita la historia clínica del paciente
- THEN el sistema MUST devolver todos los campos de la historia, incluida la procedencia del dato

#### Scenario: Retrieve medical history when none exists

- GIVEN un paciente sin historia clínica registrada
- WHEN se solicita su historia clínica
- THEN el sistema MUST devolver valores vacíos y MUST NOT devolver error

#### Scenario: Replace medical history

- GIVEN un administrador autenticado con la historia existente de un paciente
- WHEN envía un reemplazo completo
- THEN el sistema MUST persistir la nueva historia completa

#### Scenario: El contrato de obtención y reemplazo no cambia

- GIVEN un paciente con historia clínica existente
- WHEN el sistema obtiene y reemplaza la historia
- THEN la relación 1:1 por paciente MUST permanecer sin cambios
- AND el reemplazo MUST seguir siendo un reemplazo completo

## ADDED Requirements

### Requirement: Provenance de la historia clínica

La historia clínica MUST registrar la procedencia del dato mediante una columna
aditiva `source` con los valores `patient_autoreport` (autoreporte del paciente,
capturado por WhatsApp) y `staff` (captura por staff). El valor por defecto MUST
ser `staff`, de modo que las filas existentes y las capturas por staff conserven
su semántica. La procedencia fijada por el onboarding MUST establecerse en el
backend.

#### Scenario: La escritura de onboarding lleva procedencia de autoreporte

- GIVEN una historia clínica capturada y confirmada por WhatsApp
- WHEN el sistema la persiste
- THEN el registro MUST quedar con procedencia `patient_autoreport`

#### Scenario: La captura por staff conserva procedencia de staff

- GIVEN un administrador autenticado que reemplaza la historia clínica
- WHEN el sistema persiste el reemplazo
- THEN el registro MUST quedar con procedencia `staff`

#### Scenario: Las filas existentes conservan su semántica

- GIVEN una fila de historia clínica creada antes de la columna de procedencia
- WHEN el sistema agrega la columna aditiva con valor por defecto `staff`
- THEN la fila existente MUST conservar la semántica de captura por staff

#### Scenario: El badge de advertencia clínica no cambia

- GIVEN un paciente cuya historia clínica tiene alergias o condiciones sistémicas
- WHEN se renderiza su expediente
- THEN el sistema MUST seguir mostrando el badge de advertencia clínica como antes
