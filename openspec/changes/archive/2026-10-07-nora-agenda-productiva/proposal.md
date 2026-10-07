# Change: Nora — agenda productiva (indicadores y sugerencias de reacomodo)

## Why

El consultorio ya mide cuánto se ocupó la agenda y cuántos pacientes faltaron
(#88 / spec `dashboard-metrics`), pero la medición se queda en el número: nadie
responde la pregunta operativa que sigue — **¿dónde quedaron huecos improductivos
y qué citas se podrían reacomodar para aprovecharlos?**. Hoy recepción detecta a
ojo un hueco entre dos citas y reprograma a mano, una por una, sin una lista
determinista que priorice el trabajo ni un registro auditable de por qué se movió
una cita.

Este cambio entrega **Nora**: la capacidad administrativa de agenda productiva.
Nora **no es un agente conversacional**: es un núcleo determinista con UI de
panel que (Fase 1) expone indicadores de huecos improductivos por proveedor y día
reutilizando el motor de métricas de #88, y (Fase 2) genera **sugerencias de
reacomodo** que un administrador humano acepta o rechaza de forma explícita. La
reprogramación se aplica **solo** tras confirmación humana, por la única ruta de
mutación sancionada (`rescheduleAppointment`). Cubre el
issue [#149](https://github.com/proyecto-polaris-ia/medica-app/issues/149) dentro
del épico [#140](https://github.com/proyecto-polaris-ia/medica-app/issues/140)
(Fase 3).

## What Changes

Entrega en **dos fases con PRs apilados**, cada una revisable por separado.

### Fase 1 — Indicadores de agenda productiva

- **Reuso del motor puro de #88.** La ocupación y la tasa de no-show ya viven en
  `src/lib/admin/metrics/` (`computeMetrics`, `computeOccupancy`,
  `computeNoShow`). Nora **no duplica** esa aritmética: la consume tal cual desde
  su loader y su sección de panel.
- **Detección determinista de huecos ("huecos improductivos").** Módulo puro
  nuevo que, por proveedor y día clínico, resta de las ventanas de
  `business_hours` las citas activas que las solapan (mismo criterio semántico
  que `booking_free_slots`, `0004_agenda_functions.sql`) y devuelve los huecos
  con su duración. Un hueco se cuenta como improductivo cuando alcanza el mínimo
  configurado.
- **Sección Nora en el dashboard.** Extensión de `app/(admin)/dashboard/page.tsx`
  con una sección nueva que reutiliza el patrón de rango (`preset` / `from` /
  `to`) de `MetricsRangeSelector`: huecos y minutos improductivos por proveedor y
  día, más los indicadores de ocupación y no-show ya existentes.

### Fase 2 — Sugerencias de reacomodo con confirmación humana

- **Generador determinista de sugerencias.** Módulo puro que mapea citas
  movibles (`requested | pending | confirmed`) a huecos libres **reales** del
  mismo proveedor cuya duración alcance la duración del servicio de la cita.
  Cada sugerencia lleva un código de razón determinista
  (`gap_before | gap_after | gap_between`). Lista acotada, orden determinista y
  **nada se aplica automáticamente**.
- **Persistencia aditiva.** Migración nueva con la tabla
  `nora_reschedule_suggestions` (propuesta, aceptada, rechazada, expirada,
  aplicada). El enum `appointment_status` **no se modifica**.
- **Flujo de confirmación en el panel.** El administrador ve las sugerencias y
  **acepta** o **rechaza** cada una. Aceptar dispara una server action que
  reejecuta la reprogramación por `rescheduleAppointment` (admin, con guarda
  optimista de estado) y luego marca la sugerencia como aplicada; rechazar la
  marca como rechazada. Tan solo la confirmación explícita mueve una cita.
- **Rastro auditable.** Cada aplicación anexa a `appointments.notes` una entrada
  con marca de tiempo en `America/Mexico_City`, reutilizando el patrón de
  `confirm-appointment-from-reminder`.

## Impacto y capacidades

### New Capabilities

- `nora-agent`: Capacidad administrativa determinista de agenda productiva.
  Fase 1 expone indicadores de huecos improductivos por proveedor y día
  (reutilizando ocupación y no-show de `dashboard-metrics`) y su detección
  determinista a partir de `business_hours` y citas. Fase 2 genera sugerencias de
  reacomodo deterministas, las persiste y exige confirmación humana explícita en
  el panel antes de aplicar la única mutación sancionada
  (`rescheduleAppointment`), con guarda optimista, ciclo de vida de la
  sugerencia y rastro auditable en `appointments.notes`. La disponibilidad sale
  siempre de la base de datos.

### Modified Capabilities

- Ninguna. La capability `dashboard-metrics` se **reutiliza sin cambios de
  contrato**: Nora consume sus funciones puras y su loader, y agrega una sección
  hermana en la misma página. El comportamiento especificado de
  `dashboard-metrics` (ocupación, no-show, tendencia, panel) permanece intacto.

| Área | Impacto | Descripción |
|---|---|---|
| `src/lib/admin/nora/` | New | Núcleo puro de huecos y sugerencias, loader y ruta de aplicación. |
| `src/lib/admin/metrics/` | Reused | `computeMetrics`, `computeOccupancy`, `computeNoShow`, `overlapsRange`, `capacityMinutesForProvider`; sin cambios. |
| `src/lib/booking/reschedule.ts` | Reused | Única ruta de mutación de agenda; admin, con guarda optimista de estado. |
| `src/lib/admin/timezone.ts` | Reused | `CLINIC_TZ`, `clinicDayKey`, `clinicTimeLabel` para días y rastro. |
| `app/(admin)/dashboard/page.tsx` | Modified | Agrega la sección Nora debajo de métricas, con el mismo rango. |
| `app/(admin)/dashboard/components/` | New | Sección presentacional y acciones cliente de aceptar/rechazar. |
| `app/(admin)/dashboard/nora-actions.ts` | New | Server actions de confirmación (requieren usuario autenticado). |
| `supabase/migrations/<timestamp>_nora_reschedule_suggestions.sql` | New | Tabla aditiva `nora_reschedule_suggestions` + RLS. |
| `supabase/migrations/down/<timestamp>_nora_reschedule_suggestions.down.sql` | New | Reversión de la migración nueva. |
| `appointment_status` (enum) | Sin cambios | Nora nunca toca el enum de estados de la cita. |

## Decisions

| Decisión | Valor | Razón |
|---|---|---|
| Forma de entidad | Capacidad determinista con UI (lib + loader + sección), **no** agente LLM | El LLM interpreta y redacta; no decide disponibilidad ni escribe en Supabase. Propuestas no deterministas que mueven la agenda violarían "toda disponibilidad sale de la BD". Detalle y alternativas descartadas en `design.md`. |
| Reuso de métricas | `src/lib/admin/metrics/` sin modificar | Evita duplicar aritmética ya probada de #88; Nora agrega solo el delta de huecos. |
| Definición de hueco | `business_hours` menos citas con `status NOT IN ('cancelled','rescheduled')` | Mismo criterio semántico que `booking_free_slots` (`0004_agenda_functions.sql`); una sola noción de "libre" en el repo. |
| Citas movibles | `requested | pending | confirmed` | Estados no terminales que admiten reprogramación (`rescheduleAppointment` rechaza `cancelled / attended / no_show`). |
| Sugerencias | Tabla nueva `nora_reschedule_suggestions` (aditiva, `TEXT` + `CHECK`) | Persiste la propuesta y su decisión sin tocar el enum `appointment_status`; el ciclo de vida queda auditable. |
| Confirmación | Server action con usuario autenticado; solo `proposed` se decide | Ninguna cita se mueve sin confirmación humana explícita; idempotente ante doble click. |
| Ruta de aplicación | `rescheduleAppointment` (`src/lib/booking/reschedule.ts`) | Única vía sancionada de mutación de agenda; respeta la constraint de exclusión por proveedor. |
| Rastro | Anexo a `appointments.notes` con hora `America/Mexico_City` | Patrón ya establecido en `confirm-appointment-from-reminder`; trazabilidad sin migración adicional. |
| Zona horaria | `America/Mexico_City` (UTC−6 fijo) vía `src/lib/admin/timezone.ts` | Coherencia con métricas y panel; nunca la fecha UTC del servidor. |
| Entrega | 2 fases con PRs apilados | Revisión incremental: indicadores primero, mutación con confirmación después. |
| Feature flag | No aplica | Fase 1 es read-only; Fase 2 solo escribe tras confirmación humana explícita en el panel, no automatiza nada. |

## Fuera de alcance (Non-goals)

- **Reprogramación automática.** Ninguna sugerencia se aplica sin confirmación
  humana explícita en el panel.
- **WhatsApp de sugerencias.** Nora no envía propuestas ni mensajes por WhatsApp;
  tampoco notifica al paciente.
- **Nora conversacional (LLM).** No se crea prompt, tool ni subagente de Eve.
- **Cambios a la disponibilidad publicada.** Nora no crea, mueve ni borra
  `business_hours`; solo propone reacomodos dentro de la disponibilidad existente.
- **Cambios al enum `appointment_status`** o a las transiciones de estado de
  [#87](https://github.com/proyecto-polaris-ia/medica-app/issues/87).
- **Cambios al contrato de `dashboard-metrics`** o a la lógica de tendencia de
  #88.
- **Precios, diagnóstico o consejo clínico** por cualquier canal.
- **Bloqueos de agenda / tabla de exclusiones**: no existen; no se crean aquí.

## Riesgos y plan de reversión

- **Riesgo — sugerencia obsoleta al confirmar.** Entre la generación y la
  aceptación, la cita pudo moverse o el hueco pudo llenarse. Mitigación: guarda
  optimista al aplicar (releer `start_at`/`end_at` de la cita y estado
  `proposed` de la sugerencia) más la constraint de exclusión por proveedor, que
  devuelve conflicto `23P01` si el hueco ya no está libre.
- **Riesgo — doble decisión concurrente.** Dos administradores aceptan la misma
  sugerencia. Mitigación: la confirmación actualiza la sugerencia con
  `WHERE status = 'proposed'`; solo la primera transición gana y la segunda
  reporta conflicto sin mover nada dos veces.
- **Riesgo — huecos por datos sucios de `business_hours`.** Traslapes o
  duplicados pueden inflar los huecos. Mitigación: unir ventanas del mismo día
  antes de restar y acotar la salida con un mínimo de duración.
- **Riesgo — carga del panel.** Cálculo por proveedor en un loop degradaría la
  página. Mitigación: lecturas agregadas y aritmética en memoria sobre el mismo
  conjunto cargado (mismo patrón que #88).
- **Rollback.** Fase 1 es read-only: revertir el PR restaura el dashboard previo.
  Fase 2 no automatiza nada; revertir el PR elimina la sección de sugerencias y
  las server actions. La migración es **aditiva** (tabla nueva, `IF NOT EXISTS`),
  sin backfill ni borrado; dejarla sin uso es inocuo y el `down` la revierte.

## Criterios de éxito

- [ ] Nora reutiliza el motor de métricas de #88 sin duplicar aritmética de
      ocupación o no-show.
- [ ] La detección de huecos es pura, determinista y consistente con la noción de
      "libre" de `booking_free_slots`.
- [ ] El panel muestra huecos y minutos improductivos por proveedor y día con el
      mismo selector de rango, y un estado vacío cuando no hay datos.
- [ ] El generador propone solo reacomodos hacia huecos **reales** del mismo
      proveedor, con duración suficiente, y con códigos de razón deterministas.
- [ ] Ninguna cita cambia de horario sin confirmación humana explícita en el
      panel; rechazar no mueve nada.
- [ ] Aceptar aplica la reprogramación por `rescheduleAppointment`, marca la
      sugerencia como aplicada y anexa el rastro con hora de la clínica.
- [ ] El enum `appointment_status` y la disponibilidad publicada quedan intactos.
- [ ] El panel degrada con "no disponible" cuando falta Supabase o falla la
      lectura, sin lanzar excepciones ni mostrar valores inválidos.
- [ ] Todo cálculo y todo rastro usan `America/Mexico_City`.
- [ ] El cambio está especificado con SDD/OpenSpec.
