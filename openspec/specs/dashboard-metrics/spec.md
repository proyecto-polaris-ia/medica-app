# Dashboard Metrics Specification

## Purpose

Dar al panel administrativo una lectura determinista de qué tan ocupada está la
agenda y cuántos pacientes faltan. La capacidad calcula el porcentaje de
ocupación y la tasa de no-show sobre una ventana seleccionada (esta semana,
este mes o un rango personalizado), desglosa ambos indicadores por proveedor y
los compara contra el periodo inmediatamente anterior de igual duración. Además
instrumenta los instantes de transición (`confirmed_at`, `cancelled_at`,
`no_show_at`) que las métricas temporales consumen, estampándolos de forma
atómica junto con el `status` de la cita, sin modificar el enum
`appointment_status`. Toda la aritmética es en memoria y no depende del reloj
UTC del servidor: las fechas y ventanas se rigen por `America/Mexico_City`.

## Requirements

### Requirement: Cálculo de ocupación de agenda

El sistema MUST calcular la ocupación como la razón entre los minutos ocupados y
los minutos de capacidad dentro del rango seleccionado, expresada como
porcentaje. El numerador MUST sumar los minutos de las citas cuyo `status` sea
`confirmed`, `attended`, `pending` o `requested` y que se solapen con el rango,
prorrateando los minutos cuando una cita cruce los límites del rango. El
denominador MUST sumar los minutos de `business_hours` del proveedor dentro del
rango; los días sin horario laboral aportan cero minutos. La ocupación agregada
MUST ser la suma del numerador sobre la suma del denominador. La ocupación
resultante MUST quedar siempre entre `0` y `100` mediante un ajuste defensivo
(clamp) que impida valores negativos o mayores a `100`. Las citas con `status`
`cancelled`, `rescheduled` o `no_show` MUST NOT contar en el numerador.

#### Scenario: Rango con horarios completos

- GIVEN un rango con `business_hours` cargados para los proveedores y citas elegibles dentro de él
- WHEN el sistema calcula la ocupación del rango
- THEN el sistema MUST obtener la razón entre minutos ocupados y minutos de capacidad del rango
- AND MUST expresarla como porcentaje entre `0` y `100`

#### Scenario: Día sin horario laboral aporta capacidad cero

- GIVEN un rango que incluye un día sin `business_hours` para un proveedor
- WHEN el sistema calcula la ocupación del rango
- THEN ese día MUST aportar cero minutos al denominador
- AND MUST NOT reducir la ocupación por debajo del numerador correspondiente a los días con horario

#### Scenario: Cita que cruza medianoche se prorratea

- GIVEN una cita elegible cuyo intervalo cruza la medianoche de un día del rango
- WHEN el sistema calcula los minutos ocupados
- THEN el sistema MUST contar en el rango únicamente los minutos que caen dentro de él
- AND MUST NOT contar los minutos fuera del rango

#### Scenario: Cita que cruza los límites del rango se prorratea

- GIVEN una cita elegible que empieza antes del inicio del rango o termina después de su fin
- WHEN el sistema calcula los minutos ocupados
- THEN el sistema MUST contar solo la porción de la cita que se solapa con el rango
- AND MUST NOT contar los minutos fuera del rango

#### Scenario: Ocupación cero cuando no hay citas

- GIVEN un rango con capacidad en `business_hours` y sin citas elegibles que se solapen
- WHEN el sistema calcula la ocupación del rango
- THEN la ocupación MUST ser `0` por ciento

#### Scenario: Ajuste defensivo cuando la suma excede la capacidad

- GIVEN un rango cuyos minutos ocupados superan los minutos de capacidad (por ejemplo, datos sucios de `business_hours`)
- WHEN el sistema calcula la ocupación del rango
- THEN la ocupación MUST quedar acotada en `100` por ciento
- AND MUST NOT reportar un valor mayor a `100` ni negativo

#### Scenario: Fechas calculadas en la zona horaria de la clínica

- GIVEN un rango seleccionado por el administrador
- WHEN el sistema calcula los límites del rango y los minutos ocupados cerca de la medianoche
- THEN el sistema MUST calcular las fechas y ventanas en `America/Mexico_City`
- AND MUST NOT usar la fecha UTC del servidor

### Requirement: Cálculo de tasa de no-show

El sistema MUST calcular la tasa de no-show como `no_show / (no_show + attended)`
dentro del rango seleccionado. Las citas `cancelled` y cualquier otro estado
distinto de `no_show` o `attended` MUST NOT contar en el numerador ni en el
denominador. Cuando el denominador sea cero, la tasa MUST reportarse como no
definida (`null`), nunca como `0` por ciento.

#### Scenario: Tasa con no-shows

- GIVEN un rango con citas en estado `no_show` y citas en estado `attended`
- WHEN el sistema calcula la tasa de no-show
- THEN la tasa MUST ser la razón entre las citas `no_show` y la suma de `no_show` más `attended`

#### Scenario: Sin no-shows

- GIVEN un rango con citas `attended` y sin citas `no_show`
- WHEN el sistema calcula la tasa de no-show
- THEN la tasa MUST ser `0` por ciento

#### Scenario: Denominador cero

- GIVEN un rango sin citas `no_show` ni citas `attended`
- WHEN el sistema calcula la tasa de no-show
- THEN la tasa MUST reportarse como no definida (`null`)
- AND MUST NOT reportarse como `0` por ciento

#### Scenario: Canceladas quedan fuera del denominador

- GIVEN un rango con citas `cancelled`, además de citas `no_show` y `attended`
- WHEN el sistema calcula la tasa de no-show
- THEN las citas `cancelled` MUST NOT contar en el numerador ni en el denominador

### Requirement: Panel de métricas en el dashboard

El panel administrativo MUST mostrar una sección de métricas con un selector de
rango que incluya, al menos, esta semana, este mes y un rango personalizado. La
sección MUST mostrar como tarjetas el porcentaje de ocupación, la tasa de
no-show, el total de citas y el total de cancelaciones del rango, además de un
desglose por proveedor. Cuando el rango no tenga datos, la sección MUST mostrar
un estado vacío en lugar de valores inválidos. Al cambiar el rango seleccionado,
el sistema MUST recalcular las métricas mostradas.

#### Scenario: Métricas con datos presentes

- GIVEN un rango con citas y `business_hours` en los datos
- WHEN el administrador abre la sección de métricas
- THEN el sistema MUST mostrar las tarjetas de ocupación, no-show, citas totales y cancelaciones
- AND MUST mostrar el desglose por proveedor

#### Scenario: Estado vacío sin datos en el rango

- GIVEN un rango sin citas ni `business_hours` en los datos
- WHEN el administrador abre la sección de métricas
- THEN el sistema MUST mostrar un estado vacío
- AND MUST NOT mostrar valores inválidos ni porcentajes negativos

#### Scenario: Cambio de rango recalcula

- GIVEN un administrador viendo las métricas de un rango
- WHEN selecciona otro rango en el selector
- THEN el sistema MUST recalcular las métricas para el nuevo rango
- AND MUST actualizar las tarjetas y el desglose por proveedor

#### Scenario: Rango personalizado

- GIVEN un administrador que elige un rango personalizado con fecha de inicio y fin
- WHEN el sistema calcula las métricas
- THEN el sistema MUST usar la ventana personalizada seleccionada
- AND MUST mostrar las métricas correspondientes a esa ventana

### Requirement: Tendencia contra el periodo anterior

El sistema MUST comparar las métricas del rango seleccionado contra el periodo
inmediatamente anterior de igual duración: semana contra semana anterior, mes
contra mes anterior y un rango personalizado contra el periodo inmediatamente
anterior de igual duración. El sistema MUST mostrar la serie simple de evolución
de las métricas por periodo. Cuando el periodo anterior no tenga datos, la
comparación MUST reportarse como no disponible en lugar de mostrarse como una
caída o un aumento.

#### Scenario: Comparación correcta contra el periodo anterior

- GIVEN un rango seleccionado y datos en el periodo inmediatamente anterior de igual duración
- WHEN el sistema calcula la tendencia
- THEN el sistema MUST comparar las métricas contra ese periodo anterior
- AND MUST mostrar la variación correspondiente

#### Scenario: Semana contra semana anterior

- GIVEN el rango seleccionado es esta semana
- WHEN el sistema calcula la tendencia
- THEN el periodo de comparación MUST ser la semana inmediatamente anterior

#### Scenario: Mes contra mes anterior

- GIVEN el rango seleccionado es este mes
- WHEN el sistema calcula la tendencia
- THEN el periodo de comparación MUST ser el mes inmediatamente anterior

#### Scenario: Rango personalizado contra periodo anterior de igual duración

- GIVEN un rango personalizado de duración conocida
- WHEN el sistema calcula la tendencia
- THEN el periodo de comparación MUST ser el periodo inmediatamente anterior de la misma duración

#### Scenario: Serie de evolución por periodo

- GIVEN un rango seleccionado con datos en varios periodos
- WHEN el sistema muestra la tendencia
- THEN el sistema MUST mostrar la serie simple de evolución de las métricas por periodo

#### Scenario: Periodo anterior sin datos

- GIVEN un rango seleccionado cuyo periodo anterior no tiene datos
- WHEN el sistema calcula la tendencia
- THEN la comparación MUST reportarse como no disponible
- AND MUST NOT presentarse como una caída ni un aumento

### Requirement: Zona horaria de la clínica

Todo cálculo y presentación de fechas, límites de rango y ventanas temporales de
las métricas MUST regirse por la zona horaria `America/Mexico_City`, nunca por
UTC del servidor. Los instantes de transición persistidos MUST conservar su
zona horaria.

#### Scenario: Límites de rango en la zona de la clínica

- GIVEN un administrador selecciona esta semana o este mes
- WHEN el sistema calcula los límites del rango mientras en UTC ya es el día siguiente
- THEN el sistema MUST usar los límites en `America/Mexico_City`
- AND MUST NOT desplazar la ventana por la fecha UTC del servidor

#### Scenario: Instantes de transición con zona horaria

- GIVEN una transición de estado de una cita
- WHEN el sistema persiste su instante de transición
- THEN el instante MUST conservar la zona horaria de la clínica

### Requirement: Columnas de transición de estado

La migración `0019` MUST agregar de forma aditiva a `appointments` las columnas
`confirmed_at`, `cancelled_at` y `no_show_at` de tipo `timestamptz` y nullable.
Cada actualización de `status` MUST escribir su columna de transición
correspondiente en la misma transacción que el cambio de estado:
`confirmed` MUST escribir `confirmed_at`, `cancelled` MUST escribir
`cancelled_at` y `no_show` MUST escribir `no_show_at`. Cuando un cambio de estado
revierta a un estado anterior (por ejemplo, `cancelled` a `confirmed`), el
sistema MUST re-escribir la columna de transición del nuevo estado. El enum
`appointment_status` MUST NOT modificarse.

#### Scenario: Confirmación escribe su instante

- GIVEN una cita cuyo `status` cambia a `confirmed`
- WHEN el sistema aplica el cambio de estado
- THEN el sistema MUST escribir `confirmed_at` en la misma transacción
- AND la cita MUST quedar con `status` `confirmed` y `confirmed_at` no nulo

#### Scenario: Cancelación escribe su instante

- GIVEN una cita cuyo `status` cambia a `cancelled`
- WHEN el sistema aplica el cambio de estado
- THEN el sistema MUST escribir `cancelled_at` en la misma transacción
- AND la cita MUST quedar con `status` `cancelled` y `cancelled_at` no nulo

#### Scenario: No-show escribe su instante

- GIVEN una cita cuyo `status` cambia a `no_show`
- WHEN el sistema aplica el cambio de estado
- THEN el sistema MUST escribir `no_show_at` en la misma transacción
- AND la cita MUST quedar con `status` `no_show` y `no_show_at` no nulo

#### Scenario: Reversión de estado re-escribe la columna

- GIVEN una cita cancelada con `cancelled_at` registrado
- WHEN su `status` cambia de nuevo a `confirmed`
- THEN el sistema MUST re-escribir `confirmed_at` en la misma transacción
- AND MUST conservar `status` `confirmed` con `confirmed_at` no nulo

#### Scenario: El enum no se modifica

- GIVEN la migración `0019` aplicada
- WHEN se inspecciona el tipo `appointment_status`
- THEN el conjunto de valores del enum MUST permanecer sin cambios

#### Scenario: Escritura atómica del estado y su instante

- GIVEN una transición de estado válida de una cita
- WHEN el sistema persiste el cambio de `status`
- THEN el `status` y su instante de transición MUST quedar escritos en la misma transacción
- AND MUST NOT quedar un estado nuevo sin su instante correspondiente
