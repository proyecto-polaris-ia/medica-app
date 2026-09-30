# Accounts Receivable Specification

## Purpose

Calcular saldos derivados y cartera vencida del consultorio dental a partir de planes de tratamiento elegibles y pagos manuales no reversados, sin materializar balances como fuente de verdad.

## Requirements

### Requirement: Saldos derivados por paciente

El sistema MUST calcular el saldo global de un paciente de forma derivada. El saldo global MUST ser la suma de los montos totales de planes de tratamiento elegibles del paciente menos la suma de pagos no reversados del paciente, incluyendo pagos ligados a plan y pagos a cuenta sin plan asociado.

#### Scenario: Paciente sin pagos conserva saldo total elegible

- GIVEN un paciente con planes elegibles que suman `1500.00` y sin pagos activos
- WHEN se calcula su saldo global
- THEN el saldo global MUST ser `1500.00`

#### Scenario: Pagos ligados y pagos a cuenta reducen saldo global

- GIVEN un paciente con planes elegibles que suman `1500.00`, un pago ligado a plan por `300.00` y un pago a cuenta por `200.00`
- WHEN se calcula su saldo global
- THEN el saldo global MUST ser `1000.00`

#### Scenario: Pago reversado no reduce saldo global

- GIVEN un paciente con planes elegibles que suman `1500.00` y un pago reversado por `500.00`
- WHEN se calcula su saldo global
- THEN el saldo global MUST ser `1500.00`

### Requirement: Planes elegibles para saldo

El sistema MUST incluir en los saldos únicamente planes de tratamiento con estado `accepted`, `in_progress` o `completed`. El sistema MUST excluir planes en estado `draft`, `presented` o `cancelled`.

#### Scenario: Incluir estados elegibles

- GIVEN un paciente con planes en estado `accepted`, `in_progress` y `completed`
- WHEN se calcula el saldo global
- THEN el sistema MUST incluir el monto total de esos planes en el saldo

#### Scenario: Excluir estados no elegibles

- GIVEN un paciente con planes en estado `draft`, `presented` y `cancelled`
- WHEN se calcula el saldo global
- THEN el sistema MUST excluir el monto total de esos planes del saldo

### Requirement: Saldos derivados por plan de tratamiento

El sistema MUST calcular el saldo de cada plan como el monto total del plan menos los pagos no reversados ligados explícitamente a ese plan. Los pagos sin plan asociado MUST NOT reducir el saldo de ningún plan individual.

#### Scenario: Pago ligado reduce saldo del plan

- GIVEN un plan elegible con monto total `1000.00` y un pago activo ligado al plan por `250.00`
- WHEN se calcula el saldo del plan
- THEN el saldo del plan MUST ser `750.00`

#### Scenario: Pago a cuenta no reduce saldo del plan

- GIVEN un plan elegible con monto total `1000.00` y un pago a cuenta del paciente por `250.00` sin plan asociado
- WHEN se calcula el saldo del plan
- THEN el saldo del plan MUST permanecer en `1000.00`
- AND el pago a cuenta MUST reducir únicamente el saldo global del paciente

#### Scenario: Pago reversado ligado al plan no reduce saldo del plan

- GIVEN un plan elegible con monto total `1000.00` y un pago ligado al plan por `250.00` que fue reversado
- WHEN se calcula el saldo del plan
- THEN el saldo del plan MUST ser `1000.00`

### Requirement: Sobrepago y crédito visible

El sistema MUST permitir que los pagos activos excedan los montos elegibles del paciente o de un plan. Cuando el resultado sea menor que cero, el sistema MUST mostrarlo como crédito operativo o saldo negativo visible, no como error de cálculo.

#### Scenario: Sobrepago global muestra crédito

- GIVEN un paciente con planes elegibles que suman `1000.00` y pagos activos por `1200.00`
- WHEN se calcula el saldo global
- THEN el saldo global MUST ser `-200.00`
- AND el sistema MUST presentarlo como crédito o saldo negativo visible

#### Scenario: Sobrepago ligado a un plan muestra crédito del plan

- GIVEN un plan elegible con monto total `1000.00` y pagos activos ligados al plan por `1200.00`
- WHEN se calcula el saldo del plan
- THEN el saldo del plan MUST ser `-200.00`
- AND el sistema MUST presentarlo como crédito o saldo negativo visible para ese plan

### Requirement: Precisión monetaria en saldos

El sistema MUST calcular saldos con precisión monetaria de dos decimales y MUST conservar centavos en sumas y restas.

#### Scenario: Suma y resta con centavos

- GIVEN un plan elegible por `301.50` y pagos activos por `100.25` y `50.10`
- WHEN se calcula el saldo
- THEN el saldo MUST ser `151.15`

#### Scenario: Saldo cero exacto

- GIVEN un plan elegible por `500.00` y pagos activos por `300.00` y `200.00`
- WHEN se calcula el saldo
- THEN el saldo MUST ser `0.00`

### Requirement: Detección de morosidad por plan

El sistema MUST marcar un plan elegible como vencido cuando tenga saldo positivo y la antigüedad desde su fecha base exceda el umbral de morosidad. El umbral default MUST ser 30 días. La fecha base MUST ser `accepted_at`; si no existe, el sistema MUST usar `created_at` como fallback explícito.

#### Scenario: Plan vencido por accepted_at

- GIVEN un plan elegible con saldo positivo y `accepted_at` de hace 31 días
- WHEN se evalúa con el umbral default de 30 días
- THEN el sistema MUST marcar el plan como vencido
- AND MUST reportar días de atraso a partir de `accepted_at`

#### Scenario: Plan no vencido dentro del umbral

- GIVEN un plan elegible con saldo positivo y `accepted_at` de hace 20 días
- WHEN se evalúa con el umbral default de 30 días
- THEN el sistema MUST NOT marcar el plan como vencido

#### Scenario: Plan pagado no aparece como vencido

- GIVEN un plan elegible con saldo `0.00` y `accepted_at` de hace 45 días
- WHEN se evalúa la morosidad
- THEN el sistema MUST NOT marcar el plan como vencido

#### Scenario: Fallback a created_at cuando accepted_at falta

- GIVEN un plan elegible con saldo positivo, sin `accepted_at` y con `created_at` de hace 45 días
- WHEN se evalúa con el umbral default de 30 días
- THEN el sistema MUST usar `created_at` como fecha base
- AND MUST marcar el plan como vencido

#### Scenario: Umbral configurable

- GIVEN un plan elegible con saldo positivo y fecha base de hace 20 días
- WHEN se evalúa con un umbral configurado de 15 días
- THEN el sistema MUST marcar el plan como vencido

### Requirement: Vista global de cartera por cobrar

El sistema MUST ofrecer una vista administrativa de cartera por cobrar que liste pacientes con saldo positivo y destaque planes vencidos. La vista MUST mostrar paciente, saldo global, planes con saldo, fecha base de morosidad, días de atraso cuando aplique y último pago conocido cuando exista.

#### Scenario: Listar pacientes con saldo pendiente

- GIVEN existen pacientes con saldo positivo y pacientes con saldo cero o crédito
- WHEN un usuario administrativo consulta la cartera por cobrar
- THEN el sistema MUST listar los pacientes con saldo positivo
- AND MUST NOT listar pacientes cuyo saldo global sea `0.00` o negativo como deuda pendiente

#### Scenario: Destacar planes vencidos

- GIVEN un paciente tiene un plan vencido con saldo positivo
- WHEN se consulta la cartera por cobrar
- THEN la vista MUST destacar ese plan como vencido
- AND MUST mostrar sus días de atraso

#### Scenario: Estado vacío de cartera

- GIVEN no existen pacientes con saldo positivo
- WHEN un usuario administrativo consulta la cartera por cobrar
- THEN el sistema MUST mostrar un estado vacío claro indicando que no hay cartera pendiente
