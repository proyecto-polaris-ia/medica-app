# Delta Spec: Pre-población del formulario de edición de consulta clínica

**Change**: fix-clinical-visit-edit-form
**Capability**: `clinical-record` (modificada)
**Baseline**: `openspec/specs/clinical-record/spec.md`

Alcance: este delta agrega el comportamiento observable del formulario administrativo
que crea y edita notas SOAP. No modifica los requisitos vigentes de acceso autenticado,
historia clínica, badge de advertencia, CRUD SOAP ni listado de consultas.

## ADDED Requirements

### Requirement: Pre-población del formulario de edición de notas SOAP

El formulario de notas SOAP MUST precargar, al abrirse en modo edición, el valor
guardado de **todos** los campos de la consulta seleccionada: Subjetivo (S), Objetivo
(O), Valoración (A), Plan (P), Tratamiento realizado y Notas. El formulario MUST NOT
conservar datos de una consulta previamente editada: al abrirse en modo creación MUST
mostrar todos los campos vacíos, y al cambiar la consulta seleccionada MUST reemplazar
los valores por los de la nueva consulta. Esto MUST cumplirse aunque el componente
permanezca montado entre aperturas y cierres.

#### Scenario: Editar una consulta precarga todos los campos

- GIVEN una consulta guardada con valores en Subjetivo, Objetivo, Valoración, Plan, Tratamiento y Notas
- WHEN el administrador abre el formulario en modo edición para esa consulta
- THEN cada campo MUST mostrar el valor guardado correspondiente

#### Scenario: Abrir una consulta nueva muestra el formulario vacío

- GIVEN el administrador editó una consulta y luego abre el formulario para una consulta nueva
- WHEN el formulario se muestra en modo creación
- THEN todos los campos MUST mostrarse vacíos
- AND MUST NOT conservar valores de la consulta editada previamente

#### Scenario: Cambiar de consulta actualiza los campos

- GIVEN el formulario muestra los valores de una consulta seleccionada
- WHEN el administrador selecciona otra consulta para editar
- THEN cada campo MUST reemplazar su valor por el de la nueva consulta

#### Scenario: Escribir y cerrar no filtra datos a una creación posterior

- GIVEN el administrador escribe en un campo con una consulta cargada
- WHEN cierra el formulario y lo abre para una consulta nueva
- THEN todos los campos MUST mostrarse vacíos
