# Delta para Admin Panel

## MODIFIED Requirements

### Requirement: Patients CRUD
El panel administrativo MUST permitir a un usuario autenticado listar, crear,
actualizar y eliminar pacientes con nombre completo, teléfono E.164 opcional,
correo electrónico opcional y notas. Cada paciente MUST conservar al menos un
medio de contacto. El correo MUST almacenarse normalizado, mostrarse junto con
los demás datos y conservar unicidad sin distinción de mayúsculas; los teléfonos
proporcionados MUST conservar su unicidad.

(Previously: El CRUD administraba nombre completo, teléfono E.164 obligatorio y notas.)

#### Scenario: Create and list a patient
- GIVEN un administrador autenticado
- WHEN crea un paciente con nombre y teléfono válidos, y consulta la lista
- THEN el paciente MUST aparecer con los datos enviados

#### Scenario: Create and list a patient with email only
- GIVEN un administrador autenticado
- WHEN crea un paciente con nombre y correo válidos, sin teléfono, y consulta la lista
- THEN el paciente MUST aparecer con el correo normalizado

#### Scenario: Create and list a patient with both contacts
- GIVEN un administrador autenticado
- WHEN crea un paciente con teléfono y correo válidos
- THEN ambos contactos MUST persistir y mostrarse en la lista

#### Scenario: Patient without contact is rejected
- GIVEN un administrador autenticado
- WHEN intenta crear o actualizar un paciente sin teléfono ni correo
- THEN la operación MUST rechazarse y MUST conservar los datos anteriores

#### Scenario: Duplicate contact is rejected
- GIVEN ya existe un paciente con un teléfono o un correo
- WHEN el administrador intenta guardar el mismo contacto en otra ficha
- THEN MUST rechazarse sin crear ni modificar la ficha duplicada

#### Scenario: Update a patient
- GIVEN un paciente existente con al menos un contacto
- WHEN el administrador edita sus campos y guarda
- THEN el registro persistido MUST reflejar los cambios
- AND MUST conservar al menos un contacto válido

#### Scenario: Delete a patient
- GIVEN existe un paciente
- WHEN el administrador lo elimina
- THEN el registro MUST eliminarse y dejar de aparecer en la lista
