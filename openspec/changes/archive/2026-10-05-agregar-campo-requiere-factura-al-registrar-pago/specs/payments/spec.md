# Delta para Payments

## MODIFIED Requirements

### Requirement: Registro manual de pagos

El sistema MUST permitir a usuarios autenticados registrar pagos manuales para un
paciente. Cada pago MUST incluir paciente, monto, método, fecha de pago y usuario
creador; MAY incluir referencia, notas y relación opcional a un plan de
tratamiento del mismo paciente. Cada pago MAY incluir la marca booleana
`requires_invoice`; cuando se omita o no sea exactamente verdadera, el sistema
MUST persistir `false`. La marca MUST almacenarse como columna no nula con
default `false`, MUST devolverse en el contrato de lectura y MUST NOT participar
en los cálculos de saldo.

(Previously: Cada pago registraba paciente, monto, método, fecha y usuario
creador, con referencia, notas y plan de tratamiento opcionales; no existía una
marca de factura.)

#### Scenario: Registrar pago con marca de factura

- GIVEN un usuario administrativo autenticado y un paciente existente
- WHEN registra un pago enviando `requiresInvoice: true`
- THEN el sistema MUST persistir el pago con `requires_invoice` verdadero
- AND el pago MUST seguir apareciendo en el historial financiero del paciente

#### Scenario: Marca ausente se persiste en falso

- GIVEN un usuario administrativo autenticado y un paciente existente
- WHEN registra un pago sin el campo `requiresInvoice`
- THEN el sistema MUST persistir el pago con `requires_invoice` falso

#### Scenario: Valor no booleano se normaliza a falso

- GIVEN un usuario administrativo autenticado y un paciente existente
- WHEN registra un pago con `requiresInvoice` distinto de `true`
- THEN el sistema MUST persistir el pago con `requires_invoice` falso
- AND MUST NOT rechazar la operación por ese campo

#### Scenario: La marca no altera los saldos

- GIVEN un paciente con pagos activos, con y sin la marca de factura
- WHEN el sistema calcula el saldo y el resumen por cobrar
- THEN la marca MUST NOT modificar ningún monto derivado

### Requirement: Historial de pagos del paciente

El sistema MUST mostrar el historial de pagos de un paciente de forma
cronológica y distinguible por estado. El historial MUST incluir pagos activos y
pagos reversados, indicando método, monto, fecha, referencia o notas cuando
existan, relación opcional a plan, estado de reverso y la marca de factura
cuando sea verdadera. La marca de factura MUST exponerse en el contrato de
lectura del historial como `requiresInvoice` booleano.

(Previously: El historial indicaba método, monto, fecha, referencia o notas,
relación opcional a plan y estado de reverso, sin marca de factura.)

#### Scenario: El listado devuelve la marca de factura

- GIVEN un paciente con un pago marcado como requiere factura
- WHEN un usuario administrativo autenticado consulta el historial de pagos
- THEN cada pago devuelto MUST incluir `requiresInvoice` como booleano

#### Scenario: Historial muestra la marca solo cuando corresponde

- GIVEN un paciente con un pago con marca de factura y otro sin ella
- WHEN se consulta el historial de pagos
- THEN solo el pago marcado MUST indicarse como "Requiere factura"
- AND el pago sin marca MUST NOT presentarse como requiere factura

### Requirement: Actualización controlada de pagos activos

El sistema MUST permitir corregir datos operativos de pagos activos mientras no
estén reversados. El sistema MUST NOT permitir modificar un pago reversado. La
marca de factura MUST ser de solo creación: el sistema MUST NOT permitir
modificarla mediante la operación de actualización de pagos.

(Previously: La actualización corregía datos operativos de pagos activos y
rechazaba modificar pagos reversados, sin una regla explícita sobre la marca de
factura.)

#### Scenario: Corregir referencia o notas de pago activo

- GIVEN un usuario administrativo autenticado y un pago activo existente
- WHEN actualiza la referencia o las notas del pago
- THEN el sistema MUST persistir la corrección
- AND MUST mantener el pago como activo

#### Scenario: La marca de factura no se modifica en la actualización

- GIVEN un usuario administrativo autenticado y un pago existente
- WHEN la operación de actualización intenta cambiar la marca de factura
- THEN el sistema MUST NOT modificar `requires_invoice`
- AND MUST conservar el valor registrado en la creación

#### Scenario: Rechazar modificación de pago reversado

- GIVEN un usuario administrativo autenticado y un pago reversado
- WHEN intenta modificar el monto, método, fecha, referencia, notas o plan asociado
- THEN el sistema MUST rechazar la operación
- AND MUST preservar el historial del pago reversado sin cambios
