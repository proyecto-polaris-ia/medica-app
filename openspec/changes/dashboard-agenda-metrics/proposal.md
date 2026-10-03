# Change: Métricas de ocupación de agenda y tasa de no-show en el dashboard

## Why

El consultorio hoy opera a ciegas: el panel admin lista citas, pacientes y
horarios, pero no responde la pregunta que el cliente usa para evaluar el
producto — **¿qué tan ocupada está la agenda y cuántos pacientes faltan?**.
Sin esas cifras no se puede demostrar valor, detectar huecos ni justificar la
inversión, y no existe ninguna base medible para el embrión del agente de
indicadores (**Nora**), que necesitará exactamente estos cálculos.

Este cambio agrega al dashboard administrativo las dos métricas que importan:
**porcentaje de ocupación de agenda** y **tasa de no-show**, con selector de
rango, desglose por proveedor y comparativo contra el periodo anterior
(tendencia). Cubre el
issue [#88](https://github.com/proyecto-polaris-ia/medica-app/issues/88).

## What Changes

Entrega incremental en **tres fases con PRs apilados**, cada una revisable por
separado.

### Fase 1 — Librería pura de cálculo + migración

- Módulo puro (sin acceso a red/DB) que recibe las citas del rango y los
  `business_hours` y devuelve ocupación, tasa de no-show, totales y desglose por
  proveedor. Toda la aritmética vive en memoria y es testeable sin base de datos.
- Migración `0019_*.sql` aditiva que agrega a `appointments` las columnas de
  transición `confirmed_at`, `cancelled_at` y `no_show_at` (`timestamptz`,
  nullable). El enum `appointment_status` **no cambia**.
- Los instantes de transición se escriben **en la misma transacción** que el
  cambio de `status` (decisión registrada en el issue #88).

### Fase 2 — Panel en el dashboard

- Selector de rango: **esta semana / este mes / rango personalizado**.
- Cards: ocupación %, tasa de no-show %, citas totales y cancelaciones.
- Desglose por proveedor.
- Todo read-only; no requiere feature flag.

### Fase 3 — Tendencia

- Comparativo contra el periodo anterior (misma duración, inmediatamente previo).
- Serie simple de evolución para el rango seleccionado.

## Capabilities

### New Capabilities

- `dashboard-metrics`: Cálculo determinista de ocupación de agenda y tasa de
  no-show sobre la ventana seleccionada, panel en el dashboard admin con
  selector de rango y desglose por proveedor, y comparativo contra el periodo
  anterior. Incluye la instrumentación de los instantes de transición que las
  métricas consumen (migración de `confirmed_at` / `cancelled_at` /
  `no_show_at` y su escritura atómica junto con el `status`).

### Modified Capabilities

- Ninguna. El dashboard y la agenda actuales sólo aportan datos de lectura; el
  nuevo comportamiento queda encapsulado en `dashboard-metrics`.

### Decisión sobre la migración de transiciones

La migración de `confirmed_at` / `cancelled_at` / `no_show_at` y su escritura
en la misma transacción que el `status` se declara como **requisito ADDED
dentro de `dashboard-metrics`**, no como delta de otra capability.

- **Razón:** el invariante "todo cambio de `status` estampa su instante de
  transición de forma atómica" cruza **todos** los escritores del estado
  (dashboard/admin, respuestas a recordatorio de #87 y reserva), así que ninguna
  capability existente lo posee por sí sola. Las columnas son nullable y
  aditivas, y su único consumidor es `dashboard-metrics`; mantener el delta
  autocontenido evita `MODIFIED` parciales sobre `admin-panel` y
  `appointment-reminder-reply`.
- **Alternativa considerada y descartada:** declararlo como `MODIFIED` en
  `admin-panel` (requisito "Appointments CRUD"). Se descarta porque cubriría sólo
  el camino de captura manual y dejaría los caminos de recordatorio/reserva sin
  estampar a nivel de spec.
- Coherente con los deltas archivados: `confirm-appointment-from-reminder` ubica
  las transiciones de estado en la capability de su camino (respuesta a
  recordatorio); aquí, al ser un invariante transversal sin dueño único, vive en
  la capability que lo necesita.

## Approach

- **Núcleo puro primero (Fase 1).** La librería de cálculo recibe únicamente los
  datos crudos del rango (citas + `business_hours`) y devuelve los resultados;
  no consulta la base de datos, no conoce Supabase y no toca el reloj del
  sistema por su cuenta. Esto permite probar bordes sin infraestructura.
- **Sin N+1.** El cálculo hace **una** consulta de citas del rango y **una**
  consulta de `business_hours`; toda la aritmética se resuelve en memoria en la
  lib pura. El desglose por proveedor se deriva del mismo conjunto cargado.
- **Numerador de ocupación.** Minutos de citas con `status` en
  `confirmed | attended | pending | requested`. Se **excluyen**
  `cancelled | rescheduled | no_show`.
- **Denominador de ocupación.** Minutos de `business_hours` por proveedor dentro
  del rango. No existe tabla de exclusiones de agenda: la migración
  `0002_agenda_exclusion.sql` es la constraint `EXCLUDE` de solapamiento, **no**
  bloqueos. La capacidad agregada es la suma por proveedor.
- **Clamp defensivo.** La ocupación **nunca** puede exceder 100 % ni ser
  negativa; el ajuste defensivo queda documentado y probado.
- **Tasa de no-show.** `no_show / (no_show + attended)` en la ventana; las citas
  `cancelled` no entran en el denominador.
- **Zona horaria de la clínica.** Todo cálculo de fecha, ventana y formateo usa
  `America/Mexico_City` reutilizando `src/lib/admin/clinic-time.ts` y
  `src/lib/admin/timezone.ts`; nunca la fecha UTC del servidor.
- **Instrumentación de transiciones.** Las columnas `confirmed_at`,
  `cancelled_at` y `no_show_at` se estampan en la misma transacción que el
  cambio de `status`, en el punto donde ya se escribe la transición. Migración
  aditiva y aditiva-only.
- **Fases apiladas.** Fase 1 (lib + tests + migración) es la base; Fase 2 (panel)
  consume la lib; Fase 3 (tendencia) consume la misma lib con dos ventanas. Cada
  PR es revisable de forma independiente.

## Impacto

Archivos esperados (sin modificar TravelHub):

| Área | Impacto | Descripción |
|---|---|---|
| `src/lib/admin/` (lib de métricas) | New | Cálculo puro de ocupación, no-show, totales y desglose por proveedor. |
| `src/lib/admin/__tests__/` | New | Tests de bordes: medianoche, días sin horario, rangos que cruzan meses, clamp, TZ. |
| `supabase/migrations/0019_*.sql` | New | Columnas `confirmed_at` / `cancelled_at` / `no_show_at` (nullable, aditivas). |
| `app/(admin)/dashboard/page.tsx` | Modified | Panel con selector de rango, cards, desglose por proveedor y tendencia. |
| Punto(s) de escritura de `appointments.status` | Modified | Estampar el instante de transición en la misma transacción (Fase 1). |
| `appointment_status` (enum) | Sin cambios | El enum no se toca. |

## Decisions

| Decisión | Valor | Razón |
|---|---|---|
| Numerador de ocupación | `confirmed, attended, pending, requested` | Cuenta minutos comprometidos u ocupados; excluye `cancelled, rescheduled, no_show`. |
| Tasa de no-show | `no_show / (no_show + attended)` | Mide inasistencia sobre citas efectivamente esperadas; `cancelled` fuera del denominador. |
| Denominador de ocupación | Minutos de `business_hours` por proveedor en el rango | No hay tabla de exclusiones; `0002_agenda_exclusion.sql` es la constraint `EXCLUDE`, no bloqueos. |
| Ocupación agregada | Suma por proveedor, con clamp a `[0, 100]` | Refleja la capacidad total; el clamp evita valores imposibles por datos sucios. |
| Zona horaria | `America/Mexico_City` vía `clinic-time.ts` / `timezone.ts` | Coherencia con el resto del panel; nunca UTC del servidor. |
| Migración de transiciones | Columnas `timestamptz` nullable + estampado atómico | Instrumenta las métricas temporales sin romper contratos existentes. |
| Número de migración | `0019` (secuencial `NNNN_nombre.sql`) | Siguiente secuencial; `0018` ya existe. |
| Estrategia de consulta | Una consulta de citas + una de `business_hours` | Evita N+1; toda la aritmética en memoria en la lib pura. |
| Entrega | 3 fases con PRs apilados | Revisión incremental y riesgo acotado por fase. |
| Feature flag | No aplica | Métricas read-only; no habilitan escrituras nuevas de negocio. |

## Fuera de alcance

- Cambios al enum `appointment_status` o a las transiciones de estado definidas
  por [#87](https://github.com/proyecto-polaris-ia/medica-app/issues/87).
- Exclusión de bloques de agenda: **no existe** tabla de exclusiones; no se crea
  en este cambio.
- Reportes exportables, notificaciones o alertas automáticas de indicadores.
- El agente de indicadores (Nora) como agente conversacional: este cambio sólo
  deja lista la base de cálculo.
- Diagnóstico, precios o disponibilidad por WhatsApp.

## Riesgos

- **Captura manual de `no_show` / `attended`.** Hoy no hay escritor automatizado
  de esos estados; la tasa de no-show depende de que el admin los capture. Si no
  se capturan, la tasa queda subestimada. Mitigación: documentar la dependencia
  y dejar el cálculo correcto para cuando exista captura (p. ej. desde #87).
- **Reschedule in situ.** Reprogramar actualiza `start_at` / `end_at` sin cambiar
  `status`, así que la cita movida cuenta en su **nuevo** horario. Es el
  comportamiento esperado para ocupación hacia adelante, pero puede sorprender al
  comparar periodos pasados. Mitigación: documentarlo como supuesto del cálculo.
- **Datos sucios de `business_hours`.** Traslapes, duplicados o días sin horario
  pueden inflar o vaciar el denominador. Mitigación: clamp a `[0, 100]`,
  agregación por proveedor y tests de días sin horario.
- **Timezone.** Un cálculo en UTC del servidor correría la ventana un día cerca
  de medianoche. Mitigación: `clinic-time.ts` / `timezone.ts` para todo cálculo y
  test de borde de medianoche.
- **N+1.** Cargar por proveedor dentro de un loop degradaría el panel.
  Mitigación: dos consultas agregadas y aritmética en memoria.

## Rollback

- **Revertir el PR.** Las métricas son read-only y no cambian comportamiento de
  negocio; revertir restaura el dashboard previo.
- **La migración es aditiva.** Las columnas `confirmed_at`, `cancelled_at` y
  `no_show_at` son `timestamptz` **nullable**; no borran ni reescriben datos y no
  hay migración destructiva que revertir. Dejar las columnas sin uso es inocuo.
- Si se estampa alguna transición con la Fase 1 desplegada, los valores quedan
  como dato histórico válido aunque se revierta la lectura de métricas.

## Criterios de éxito

- [ ] La ocupación nunca es mayor a 100 % ni negativa, y el clamp está
      documentado y probado.
- [ ] Todo cálculo de fecha/ventana usa `America/Mexico_City`
      (`clinic-time.ts` / `timezone.ts`), no UTC del servidor.
- [ ] El cálculo hace una sola consulta de citas del rango y una sola de
      `business_hours` (sin N+1); la aritmética vive en la lib pura.
- [ ] La tasa de no-show usa `no_show / (no_show + attended)` y excluye
      `cancelled` del denominador.
- [ ] El numerador de ocupación incluye `confirmed | attended | pending |
      requested` y excluye `cancelled | rescheduled | no_show`.
- [ ] El denominador de ocupación son los minutos de `business_hours` por
      proveedor dentro del rango, agregados por suma (sin tabla de exclusiones).
- [ ] Existe la migración `0019` aditiva con `confirmed_at` / `cancelled_at` /
      `no_show_at` nullable, y el enum `appointment_status` no cambia.
- [ ] Tests exhaustivos de bordes: medianoche, días sin horario y rangos que
      cruzan meses.
- [ ] El dashboard muestra selector de rango, desglose por proveedor y
      comparativo contra el periodo anterior.
- [ ] El cambio está especificado con SDD/OpenSpec.
