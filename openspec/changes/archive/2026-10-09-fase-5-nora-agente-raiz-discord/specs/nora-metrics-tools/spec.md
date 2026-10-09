# Capability nora-metrics-tools (issue #162, Fase 5)

Capability nueva: las tools conversacionales de lectura de métricas de Nora.
Todas son proyecciones del `DashboardMetricsView` que produce
`getDashboardMetrics` (`src/lib/admin/metrics/loader.ts`): resuelven rango
(`preset`/`from`/`to`), consultan vía el adaptador Supabase existente y
devuelven resultados tipados con mensajes en español. Nunca lanzan excepciones:
devuelven `{ success: false, error }`. Revalidan la autorización del doctor
antes de cualquier consulta.

## ADDED Requirements

### Requirement: Tool de resumen general del consultorio

`get-dashboard-summary` MUST devolver el resumen del rango solicitado
(preset `week`/`month` o rango custom): ocupación total, tasa de no-show total,
conteos por status y desglose por proveedor. La ausencia de datos MUST degradar
con un estado vacío explícito, nunca con valores inválidos.

#### Scenario: Resumen semanal

- GIVEN un doctor autorizado y un rango con citas
- WHEN invoca el resumen para `week`
- THEN la tool MUST devolver ocupación, no-show, conteos por status y desglose por proveedor
- AND los valores MUST coincidir con el motor de métricas para el mismo rango

#### Scenario: Rango sin datos

- GIVEN un rango sin citas ni `business_hours`
- WHEN se solicita el resumen
- THEN la tool MUST devolver un estado vacío explícito
- AND MUST NOT inventar valores ni porcentajes

### Requirement: Tool de métricas por proveedor

`get-provider-metrics` MUST devolver, para un proveedor identificado y un rango:
ocupación, tasa y conteo de no-shows, citas atendidas y totales del status. Si
el proveedor no existe o no tiene datos, MUST degradar explícitamente.

#### Scenario: Métricas de un doctor

- GIVEN un doctor autorizado y un proveedor existente con citas en el rango
- WHEN se solicitan sus métricas
- THEN la tool MUST devolver ocupación, no-show y atendidos solo de ese proveedor
- AND MUST NOT mezclar datos de otros proveedores

#### Scenario: Proveedor inexistente

- GIVEN un identificador de proveedor que no existe
- WHEN se solicitan sus métricas
- THEN la tool MUST devolver `{ success: false, error }` con mensaje en español
- AND MUST NOT devolver métricas de otro proveedor ni vacías ambiguas

### Requirement: Tools de ocupación, no-shows y estadísticas de citas

`get-occupancy` MUST devolver la ocupación del rango por proveedor y total;
`get-no-shows` MUST devolver tasa y conteo de no-shows del período por proveedor
y total; `get-appointment-stats` MUST devolver los conteos por status
(`requested, confirmed, pending, cancelled, rescheduled, no_show, attended`) del
rango. Las tres MUST derivar del mismo motor de métricas y revalidar autorización.

#### Scenario: Ocupación del mes

- GIVEN un doctor autorizado y un rango con `business_hours`
- WHEN se solicita ocupación `month`
- THEN la tool MUST devolver el porcentaje de ocupación del motor por proveedor y total
- AND MUST coincidir con la ocupación que muestra el panel para el mismo rango

#### Scenario: No-shows del período

- GIVEN un rango con citas marcadas `no_show`
- WHEN se solicita la tasa de no-shows
- THEN la tool MUST devolver la tasa y el conteo del motor
- AND los conteos MUST coincidir con `get-appointment-stats` para el mismo rango

#### Scenario: Estadísticas de citas

- GIVEN un rango con citas en varios estados
- WHEN se solicitan las estadísticas
- THEN la tool MUST devolver el conteo por cada status del rango
- AND la suma de los conteos MUST igualar el total de citas del rango

### Requirement: Autorización revalidada en cada tool

Cada tool MUST verificar la autorización del doctor de Discord antes de
consultar datos y MUST fallar cerrado: sin principal autorizado, MUST devolver
refusal sin ejecutar ninguna consulta.

#### Scenario: Sesión sin autorización invoca una tool

- GIVEN una sesión cuyo principal no está autorizado
- WHEN cualquier tool de métricas es invocada
- THEN la tool MUST devolver refusal en español
- AND MUST NOT ejecutar ninguna consulta a Supabase
