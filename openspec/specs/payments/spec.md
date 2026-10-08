# Payments Specification

## Purpose

Gestionar el registro manual de pagos de pacientes del consultorio dental para que el staff autenticado pueda capturar abonos reales, consultar historial financiero operativo y corregir registros mediante reversos auditables sin eliminar físicamente el historial.

## Requirements

### Requirement: Acceso autenticado a pagos

El sistema MUST permitir consultar y modificar pagos únicamente a usuarios autenticados del área administrativa. El sistema MUST NOT exponer pagos a usuarios anónimos ni a canales públicos.

#### Scenario: Usuario autenticado consulta pagos de un paciente

- GIVEN un usuario administrativo autenticado
- WHEN solicita el historial de pagos de un paciente existente
- THEN el sistema MUST devolver los pagos registrados para ese paciente

#### Scenario: Usuario no autenticado es rechazado

- GIVEN una petición sin sesión administrativa válida
- WHEN intenta consultar o registrar pagos
- THEN el sistema MUST responder `401`
- AND MUST NOT devolver ni persistir datos financieros

### Requirement: Registro manual de pagos

El sistema MUST permitir a usuarios autenticados registrar pagos manuales para un
paciente. Cada pago MUST incluir paciente, monto, método, fecha de pago y usuario
creador; MAY incluir referencia, notas y relación opcional a un plan de
tratamiento del mismo paciente. Cada pago MAY incluir la marca booleana
`requires_invoice`; cuando se omita o no sea exactamente verdadera, el sistema
MUST persistir `false`. La marca MUST almacenarse como columna no nula con
default `false`, MUST devolverse en el contrato de lectura y MUST NOT participar
en los cálculos de saldo.

#### Scenario: Registrar pago ligado a un plan de tratamiento

- GIVEN un usuario administrativo autenticado, un paciente existente y un plan de tratamiento del mismo paciente
- WHEN registra un pago con monto, método, fecha y plan de tratamiento
- THEN el sistema MUST persistir el pago ligado a ese paciente y a ese plan
- AND el pago MUST aparecer en el historial financiero del paciente

#### Scenario: Registrar pago a cuenta sin plan asociado

- GIVEN un usuario administrativo autenticado y un paciente existente
- WHEN registra un pago sin seleccionar plan de tratamiento
- THEN el sistema MUST persistir el pago como pago a cuenta del paciente
- AND MUST NOT asignarlo automáticamente a ningún plan individual

#### Scenario: Rechazar plan de otro paciente

- GIVEN un usuario administrativo autenticado, un paciente y un plan de tratamiento perteneciente a otro paciente
- WHEN intenta registrar un pago del paciente ligado a ese plan externo
- THEN el sistema MUST rechazar la operación con un error de validación
- AND MUST NOT persistir el pago

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

### Requirement: Métodos y datos de pago válidos

El sistema MUST validar que el método de pago sea uno de `cash`, `card`, `transfer` u `other`. El monto MUST ser mayor que cero y manejarse con precisión monetaria de dos decimales. La fecha de pago MUST ser una fecha válida.

#### Scenario: Método de pago válido

- GIVEN un usuario administrativo autenticado
- WHEN registra un pago con método `cash`, `card`, `transfer` u `other`
- THEN el sistema MUST aceptar el método como válido

#### Scenario: Método de pago inválido

- GIVEN un usuario administrativo autenticado
- WHEN registra un pago con un método no reconocido
- THEN el sistema MUST rechazar la operación con un error de validación

#### Scenario: Monto cero o negativo rechazado

- GIVEN un usuario administrativo autenticado
- WHEN registra un pago con monto `0.00` o un monto negativo
- THEN el sistema MUST rechazar la operación con un error de validación
- AND MUST NOT persistir el pago

#### Scenario: Precisión monetaria con centavos

- GIVEN un usuario administrativo autenticado
- WHEN registra un pago por `100.50`
- THEN el sistema MUST conservar el monto como `100.50`
- AND MUST NOT perder precisión de centavos

### Requirement: Historial de pagos del paciente

El sistema MUST mostrar el historial de pagos de un paciente de forma
cronológica y distinguible por estado. El historial MUST incluir pagos activos y
pagos reversados, indicando método, monto, fecha, referencia o notas cuando
existan, relación opcional a plan, estado de reverso y la marca de factura
cuando sea verdadera. La marca de factura MUST exponerse en el contrato de
lectura del historial como `requiresInvoice` booleano.

#### Scenario: Historial ordenado por fecha reciente

- GIVEN un paciente con múltiples pagos registrados
- WHEN un usuario administrativo consulta su historial de pagos
- THEN el sistema MUST mostrar los pagos ordenados por fecha de pago descendente

#### Scenario: Historial muestra pagos a cuenta

- GIVEN un paciente con un pago sin plan asociado
- WHEN se consulta el historial de pagos
- THEN el sistema MUST mostrar el pago como pago a cuenta o no ligado a plan
- AND MUST NOT presentarlo como pago de un plan específico

#### Scenario: Historial conserva pagos reversados

- GIVEN un paciente con un pago reversado
- WHEN se consulta el historial de pagos
- THEN el sistema MUST mostrar el pago reversado con su estado de reverso
- AND MUST conservar visible la información operativa del pago original

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

### Requirement: Reverso operativo sin borrado físico

El sistema MUST permitir reversar un pago activo mediante una operación auditable. Un pago reversado MUST conservarse en el historial, MUST registrar fecha de reverso, usuario que reversó y motivo, y MUST quedar excluido de cálculos de saldos.

#### Scenario: Reversar pago activo

- GIVEN un usuario administrativo autenticado y un pago activo
- WHEN reversa el pago indicando un motivo
- THEN el sistema MUST marcar el pago como reversado
- AND MUST registrar fecha, usuario y motivo de reverso
- AND MUST excluir el pago de los saldos derivados

#### Scenario: Reverso requiere motivo

- GIVEN un usuario administrativo autenticado y un pago activo
- WHEN intenta reversar el pago sin motivo
- THEN el sistema MUST rechazar la operación con un error de validación
- AND MUST mantener el pago activo

#### Scenario: Reverso idempotente rechazado para pago ya reversado

- GIVEN un pago que ya fue reversado
- WHEN un usuario administrativo intenta reversarlo de nuevo
- THEN el sistema MUST rechazar la operación
- AND MUST NOT alterar los datos del primer reverso

### Requirement: Sin eliminación física de pagos

El sistema MUST NOT eliminar físicamente pagos mediante la operación administrativa normal. Las correcciones que invaliden un pago MUST realizarse mediante reverso operativo.

#### Scenario: Eliminación física no disponible

- GIVEN un usuario administrativo autenticado y un pago existente
- WHEN intenta eliminar físicamente el pago desde la operación administrativa normal
- THEN el sistema MUST rechazar o no ofrecer esa operación
- AND MUST indicar que la corrección debe realizarse mediante reverso operativo
