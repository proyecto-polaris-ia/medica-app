# Spec delta — demo-data

## ADDED Requirements

### Requirement: Registro de datos demo
El sistema DEMO de mantener un registro (`demo_data_registry`) de toda fila
insertada por el set de prueba, con tabla destino, id y clave determinista.

#### Scenario: Borrado aislado en producción
- **Given** un entorno con datos reales y datos demo aplicados
- **When** se ejecuta el borrado del set demo
- **Then** solo se eliminan las filas registradas en `demo_data_registry`
- **And** ningún dato real (proveedores, pacientes, citas existentes) se modifica

### Requirement: Generador idempotente y extensible
El generador del set demo DEBE poder re-ejecutarse sin duplicar filas y DEBE
extender los días futuros generados en cada ejecución.

#### Scenario: Re-ejecución extiende días
- **Given** un seed aplicado hoy con horizonte de 14 días
- **When** se re-ejecuta el generador 3 días después
- **Then** no se duplican filas existentes
- **And** se agregan días hasta cubrir hoy + 14 días

#### Scenario: Wipe y re-seed repetibles
- **Given** datos demo aplicados
- **When** se ejecuta wipe y luego seed
- **Then** el set vuelve a generarse completo con fechas relativas a la nueva
  fecha de ejecución
