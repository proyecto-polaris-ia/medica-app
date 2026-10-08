# Delta para Admin Panel

## ADDED Requirements

### Requirement: Casilla "Requiere factura" en el registro de pago

El formulario de registro de pago del expediente del paciente MUST incluir una
casilla opcional etiquetada "Requiere factura", asociada a su control mediante
`htmlFor`/`id` o etiqueta envolvente. La casilla MUST iniciar desmarcada en cada
carga y MUST enviarse como `requiresInvoice` en el cuerpo del `POST` a
`/api/admin/patients/{id}/payments`. Tras un registro exitoso, la casilla MUST
volver a quedar desmarcada. La casilla MUST NOT ser obligatoria.

#### Scenario: La casilla existe desmarcada y accesible

- GIVEN un usuario administrativo autenticado en el expediente del paciente
- WHEN se renderiza el formulario de registro de pago
- THEN MUST existir una casilla accesible con la etiqueta "Requiere factura"
- AND MUST estar desmarcada por defecto

#### Scenario: El envío propaga la marca seleccionada

- GIVEN el usuario marca "Requiere factura" y captura los datos obligatorios del pago
- WHEN envía el formulario
- THEN el cuerpo del `POST` MUST incluir `requiresInvoice: true`
- AND el sistema MUST registrar el pago con esa marca

#### Scenario: El envío omite la marca cuando no se selecciona

- GIVEN el usuario deja "Requiere factura" desmarcada
- WHEN envía el formulario
- THEN el pago MUST registrarse con la marca en falso
- AND el sistema MUST NOT bloquear el registro por ese campo

#### Scenario: Reinicio tras registro exitoso

- GIVEN un registro de pago exitoso con la casilla marcada
- WHEN el formulario procesa la respuesta correcta
- THEN la casilla MUST volver a estar desmarcada
- AND los demás campos del formulario MUST conservar su reinicio habitual

### Requirement: Distintivo "Requiere factura" en el historial de pagos

El historial de pagos del expediente MUST mostrar un distintivo "Requiere
factura" en cada pago cuya marca sea verdadera, de forma independiente del
estado activo o reversado. Cuando la marca sea falsa, el historial MUST NOT
mostrar el distintivo. El distintivo MUST ser solo informativo y MUST NOT alterar
el orden, los cálculos de saldo ni las acciones disponibles sobre el pago.

#### Scenario: Pago con factura muestra el distintivo

- GIVEN un pago registrado con `requiresInvoice: true`
- WHEN el usuario consulta el historial de pagos
- THEN el pago MUST mostrar el distintivo "Requiere factura"

#### Scenario: Pago sin factura no muestra el distintivo

- GIVEN un pago registrado con `requiresInvoice: false`
- WHEN el usuario consulta el historial de pagos
- THEN el pago MUST NOT mostrar el distintivo "Requiere factura"

#### Scenario: El distintivo no interfiere con el reverso

- GIVEN un pago reversado con `requiresInvoice: true`
- WHEN el historial renderiza el pago
- THEN MUST mostrarse tanto el estado de reverso como el distintivo "Requiere factura"
