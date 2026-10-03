# Diseño: Métricas de ocupación de agenda y tasa de no-show en el dashboard

## Contexto y objetivos

Este diseño implementa la capacidad nueva `dashboard-metrics` descrita en
`proposal.md` y especificada en `specs/dashboard-metrics/spec.md` (6 requisitos /
29 escenarios), y resuelve el
issue [#88](https://github.com/proyecto-polaris-ia/medica-app/issues/88). El
panel admin hoy (`app/(admin)/dashboard/page.tsx`) es una rejilla estática de
enlaces: no consulta datos ni responde cuánto se ocupó la agenda o cuántos
pacientes faltaron.

Objetivos técnicos:

- **Núcleo puro primero.** Toda la aritmética (ocupación, no-show, totales,
  desglose por proveedor, tendencia y serie) vive en funciones puras en
  `src/lib/admin/metrics/` que reciben filas planas y un rango. Se prueban sin
  Supabase y sin reloj implícito.
- **Dos consultas base, cero N+1.** El loader hace una lectura de citas del
  rango y una de `business_hours` (más un join manual por lote a `providers`
  para los nombres), y la lib resuelve todo en memoria.
- **Zona horaria de la clínica.** Todo límite de ventana y todo cálculo de días
  rige por `America/Mexico_City`, reutilizando `src/lib/admin/clinic-time.ts` y
  `src/lib/admin/timezone.ts`. Nunca la fecha UTC del servidor.
- **Migración aditiva y estampado atómico.** `0019` agrega
  `confirmed_at` / `cancelled_at` / `no_show_at` (`timestamptz`, nullable) y cada
  escritor de `appointments.status` estampa su columna en el **mismo `UPDATE`**.
  El enum `appointment_status` no cambia.
- **Entrega en 3 fases con PRs apilados.** Fase 1 (lib pura + migración + tests)
  es la base; Fase 2 (panel) consume la lib; Fase 3 (tendencia y serie) consume
  la misma lib con dos ventanas.

Base reutilizada (leída para este diseño):

- `app/(admin)/dashboard/page.tsx` — rejilla estática actual (server component
  con `export const dynamic = 'force-dynamic'`, `app/(admin)/dashboard/page.tsx:3`).
- `app/(admin)/whatsapp-command-center/page.tsx` — patrón de server component
  `async` con `force-dynamic` y loader esperado.
- `app/(admin)/accounts-receivable/page.tsx:157-170` — markup de cards resumen
  (`grid gap-3 sm:grid-cols-3`, etiqueta `text-xs font-semibold uppercase
  tracking-wide text-gray-500` + `text-2xl font-bold`).
- `src/lib/admin/clinic-time.ts` — `clinicDayRange(now)` / `trailingDaysRange(now, days)`,
  intervalos semiabiertos en UTC−6.
- `src/lib/admin/timezone.ts` — `CLINIC_TZ`, `clinicDayKey`, `clinicTimeLabel`,
  `clinicMonthRangeUtc(year, month)` (y el helper privado `utcFromClinicParts`).
- `src/lib/admin/appointments.ts:214` — `updateAppointment` (update full-row).
- `src/lib/citas/appointment-status.ts:60-66` — `transitionAppointmentFromReminder`
  (update status-only guardado).
- `src/lib/booking/reschedule.ts:99-107` — reprogramación in situ
  (`start_at` / `end_at`, sin tocar `status`).
- `src/lib/admin/business-hours.ts` + `src/lib/admin/types.ts:64` — modelo
  `BusinessHour` (`providerId`, `dayOfWeek`, `startTime`, `endTime`).
- `supabase/migrations/0001_agenda_tables.sql:33-45` — `business_hours`
  (`UNIQUE(provider_id, day_of_week, start_time)`), y `:61-76` `appointments`.
- `supabase/migrations/0004_agenda_functions.sql:26` — `day_of_week = EXTRACT(dow FROM ...)`,
  confirma `0 = domingo`.
- `src/lib/wcc-payments.ts:195-263` — patrón de loader con `Promise.all` /
  join manual por lote y contrato `isSupabaseConfigured` /
  `isConfiguredButUnavailable`.
- `supabase/migrations/0018_appointment_reminders.sql` — estilo idempotente y
  `down/` migration.
- `src/lib/admin/__tests__/clinic-time.test.ts` — fixtures de instantes UTC fijos
  con expectativas locales exactas.
- `src/lib/citas/__tests__/appointment-status.test.ts` — montaje de queries
  encadenables y aserción del payload de `.update`.
- `app/(admin)/appointments/page.test.tsx` y
  `app/(admin)/whatsapp-command-center/appointments/page.test.tsx` — patrones de
  test (jsdom, `vi.mock` de loader, `render(await Page(...))`).

---

## 1. Enfoque técnico

### Fase 1 — Librería pura de cálculo + migración de transiciones

#### 1.1 Migración `supabase/migrations/0019_appointment_transition_columns.sql`

Siguiente número secuencial: `0018` ya existe (`ls supabase/migrations/*0019*`
no devuelve nada). Aditiva e idempotente, en el estilo de `0018`:

```sql
-- Instrumentación de transiciones para dashboard-metrics (issue #88).
-- Aditiva: columnas nullable, sin backfill, sin cambios al enum appointment_status.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_at timestamptz;
```

**Estrategia de índices: ninguna.** Las columnas de transición no se filtran en
ninguna consulta de este cambio (las métricas de rango se resuelven por solape de
intervalo sobre `start_at` / `end_at`). La tabla `appointments` de un consultorio
es de volumen bajo y ya tiene `idx_appointments_provider_start (provider_id,
start_at)` (`0001_agenda_tables.sql`); agregar un índice aquí sería peso muerto.
Se descarta `(status, start_at)`: el predicado de métricas no es un rango puro
de `start_at` (necesita `end_at`), y el `IN` de status recorre casi todos los
valores.

**Sin CHECK de consistencia.** Un `CHECK (status <> 'confirmed' OR confirmed_at
IS NOT NULL)` rompería filas históricas y no se puede exigir retroactivamente;
la atomicidad se garantiza en la escritura, no con una constraint.

Down migration propuesta como higiene, siguiendo el patrón de
`supabase/migrations/down/0018_appointment_reminders.down.sql`:

```sql
-- supabase/migrations/down/0019_appointment_transition_columns.down.sql
ALTER TABLE appointments
  DROP COLUMN IF EXISTS confirmed_at,
  DROP COLUMN IF EXISTS cancelled_at,
  DROP COLUMN IF EXISTS no_show_at;
```

#### 1.2 Módulo puro `src/lib/admin/metrics/`

Módulos nuevos, sin I/O ni `Date.now()` implícito. La división propuesta:

| Archivo | Responsabilidad | Exporta |
|---|---|---|
| `types.ts` | Tipos planos de entrada/salida y constantes de status. | `ClinicRange`, `MetricAppointment`, `MetricBusinessHour`, `ProviderRef`, `ProviderMetrics`, `MetricsResult`, `OCCUPANCY_STATUSES`, `NO_OCCUPANCY_STATUSES`, `NO_SHOW_STATUSES` |
| `occupancy.ts` | Minutos de solape, minutos de capacidad y porcentaje con clamp. | `overlapMinutes`, `capacityMinutesForProvider`, `computeOccupancy`, `clampOccupancyPct` |
| `no-show.ts` | Tasa de no-show con denominador cero → `null`. | `computeNoShow` |
| `aggregate.ts` | Métricas agregadas + desglose por proveedor sobre la unión de ids. | `computeMetrics` |
| `range.ts` | Resolución de preset/rango en la TZ clínica. | `resolveRange` (Fase 1), `previousRangeOf`, `bucketRange` (Fase 3) |
| `transitions.ts` | Mapeo puro status → columna de transición. | `TransitionStamp`, `TRANSITION_COLUMN_BY_STATUS`, `buildTransitionStamp` |
| `index.ts` | Barril de import estable para el loader y el panel. | Re-exporta lo público |
| `loader.ts` | **Fase 2**: acceso a Supabase + llamada a la lib pura. | `getDashboardMetrics`, `DashboardMetricsView` |

Tipos y convención de intervalo (semiabierto `[start, end)` en UTC, coherente
con `clinic-time.ts`):

```ts
// src/lib/admin/metrics/types.ts
import type { AppointmentStatus } from '../types';

export type ClinicRange = { start: Date; end: Date }; // [start, end)

export type MetricAppointment = {
  id: string;
  providerId: string;
  startAt: string; // timestamptz ISO
  endAt: string;   // timestamptz ISO
  status: AppointmentStatus;
};

export type MetricBusinessHour = {
  providerId: string;
  dayOfWeek: number; // 0 = domingo .. 6 = sábado (EXTRACT(dow))
  startTime: string; // "HH:MM:SS" (time)
  endTime: string;   // "HH:MM:SS" (time)
};

export type ProviderRef = { id: string; name: string };

export const OCCUPANCY_STATUSES = ['confirmed', 'attended', 'pending', 'requested'] as const;
export const NON_OCCUPANCY_STATUSES = ['cancelled', 'rescheduled', 'no_show'] as const;
export const NO_SHOW_STATUSES = ['no_show', 'attended'] as const;

export type ProviderMetrics = {
  providerId: string;
  providerName: string;
  occupancyPct: number;        // clamp [0, 100]
  occupiedMinutes: number;
  capacityMinutes: number;
  noShowRatePct: number | null; // null cuando el denominador es 0
  noShowCount: number;
  attendedCount: number;
  totalAppointments: number;
  cancelledCount: number;
};

export type MetricsResult = {
  occupancyPct: number;
  occupiedMinutes: number;
  capacityMinutes: number;
  noShowRatePct: number | null;
  noShowCount: number;
  attendedCount: number;
  totalAppointments: number;
  cancelledCount: number;
  providers: ProviderMetrics[];
};
```

Aritmética y firmas puras:

```ts
// src/lib/admin/metrics/occupancy.ts
/** Minutos de [startAt, endAt) dentro de `range`, con prorrateo en los bordes. */
export function overlapMinutes(startAt: string, endAt: string, range: ClinicRange): number;

/** Minutos de business_hours del proveedor para los días clínicos de `range`. */
export function capacityMinutesForProvider(
  businessHours: MetricBusinessHour[],
  providerId: string | null, // null = todos los proveedores
  range: ClinicRange
): number;

export function clampOccupancyPct(value: number): number; // [0, 100]; NaN -> 0

export function computeOccupancy(input: {
  appointments: MetricAppointment[];
  businessHours: MetricBusinessHour[];
  providerId?: string; // undefined = agregado
  range: ClinicRange;
}): { occupiedMinutes: number; capacityMinutes: number; occupancyPct: number };

// src/lib/admin/metrics/no-show.ts
export function computeNoShow(input: {
  appointments: MetricAppointment[];
  providerId?: string;
  range: ClinicRange;
}): { noShowCount: number; attendedCount: number; noShowRatePct: number | null };

// src/lib/admin/metrics/aggregate.ts
export function computeMetrics(input: {
  appointments: MetricAppointment[];
  businessHours: MetricBusinessHour[];
  providers?: ProviderRef[];
  range: ClinicRange;
}): MetricsResult;
```

Reglas internas, explicitadas para que los tests las fijen:

- **Solape.** `overlapMs = max(0, min(appt.end, range.end) − max(appt.start, range.start))`;
  minutos = `overlapMs / 60_000`. Cubre la cita que cruza medianoche, la que
  cruza los bordes del rango y el prorrateo (`spec.md` escenarios 3 y 4 de
  ocupación).
- **Denominador.** El rango es **alineado a días clínicos**, así que se itera
  desde `range.start` (medianoche local) sumando 24 h por día hasta `range.end`
  (exclusive). Para cada día se obtiene su `day_of_week` con `getUTCDay()` sobre
  el instante de medianoche local (en UTC−6 la medianoche local es `06:00Z` del
  mismo día, así que `getUTCDay()` coincide con el día clínico) y se suman los
  minutos `end_time − start_time` de las filas de ese proveedor y `dayOfWeek`.
  Un día sin `business_hours` aporta 0. `business_hours` tiene
  `CHECK (start_time < end_time)`, así que ningún bloque cruza medianoche por sí
  mismo.
- **Supuesto de zona fija.** MX ya no observa horario de verano (UTC−6 fijo), el
  mismo supuesto que usa `clinic-time.ts` con `addDays(..., 24h)`. Los tests lo
  anclan con instantes UTC fijos.
- **Clamp.** `clampOccupancyPct` acota `[0, 100]`; datos sucios que inflen el
  numerador se reportan como 100, nunca más. Si `capacityMinutes === 0`, la
  ocupación es `0` (no hay capacidad medible) — el escenario "día sin horario
  aporta cero" y el clamp quedan cubiertos.
- **No-show.** `no_show / (no_show + attended)` contando citas cuyo intervalo
  solape el rango; `cancelled` y cualquier otro status quedan fuera. Con
  denominador 0 devuelve `null`, nunca `0`.
- **Agregado.** `occupancyPct` agregada = `clamp(100 × Σ ocupados / Σ capacidad)`,
  **no** el promedio de porcentajes por proveedor (requisito de spec).
- **Desglose.** Se construye sobre la unión de `provider_id` de citas y
  `business_hours`; un proveedor con solo horario reporta 0 % y uno con solo
  citas y sin horario también 0 % (capacidad 0). Si no hay ids, `providers: []`
  y el panel muestra solo el agregado (fallback).
- **Total y cancelaciones.** `totalAppointments` = citas cuyo intervalo solape el
  rango, sin filtrar status; `cancelledCount` = las de status `cancelled`.

#### 1.3 Instrumentación de transiciones (mismo `UPDATE`)

Helper puro nuevo en `src/lib/admin/metrics/transitions.ts`:

```ts
import type { AppointmentStatus } from '../types';

export type TransitionStamp = Partial<
  Record<'confirmed_at' | 'cancelled_at' | 'no_show_at', string>
>;

export const TRANSITION_COLUMN_BY_STATUS: Readonly<
  Partial<Record<AppointmentStatus, keyof TransitionStamp>>
> = {
  confirmed: 'confirmed_at',
  cancelled: 'cancelled_at',
  no_show: 'no_show_at',
};

/** Devuelve la columna de transición del status, o `{}` si no es estampable. */
export function buildTransitionStamp(status: AppointmentStatus, at: Date): TransitionStamp {
  const column = TRANSITION_COLUMN_BY_STATUS[status];
  return column ? { [column]: at.toISOString() } : {};
}
```

**Decisión: mapeo explícito en los dos escritores, sin trigger.** Se descarta un
trigger `BEFORE UPDATE` en la migración aunque garantizaría el invariante para
cualquier escritor futuro: haría invisible la atomicidad a los tests de unidad,
sacar el contrato del tipado del llamador y no cubrir el `INSERT`. El mapeo
explícito mantiene el invariante verificable en TypeScript y en los tests de los
escritores, y ambos escriben status + instante en **una sola sentencia** (atómica
por definición en Postgres).

Escritores modificados:

1. `src/lib/citas/appointment-status.ts` — `transitionAppointmentFromReminder`.
   Se agrega el estampado al payload existente, con el `occurredAt` que ya
   recibe (instante de dominio, no un `new Date()` nuevo):

   ```ts
   .update({ status: input.to, notes, ...buildTransitionStamp(input.to, input.occurredAt) })
   ```

   `input.to` es `'confirmed' | 'cancelled'`, así que estampa `confirmed_at` o
   `cancelled_at`; el mapeo ya cubre `no_show_at` para futuros escritores.

2. `src/lib/admin/appointments.ts` — `updateAppointment` (**sí debe estampar**).
   Es el otro escritor real de `status`: el formulario de citas envía
   `status` en el PATCH (`app/api/admin/appointments/[id]/route.ts`) y llama a
   `updateAppointment`. Para no reescribir el instante en un guardado que no
   cambia el estado, `updateAppointment` lee el `status` actual (`select('status')`,
   lectura, no escritura) y solo agrega el estampado si cambió:

   ```ts
   const parsed = validateAppointmentInput(input);
   const current = await supabase.from('appointments').select('status').eq('id', parsedId).maybeSingle();
   const statusChanged = current.data?.status !== parsed.status;
   const stamp = statusChanged ? buildTransitionStamp(parsed.status, new Date()) : {};
   await supabase.from('appointments')
     .update({ ...parsed, ...stamp })
     .eq('id', parsedId)
     .select(SELECT_COLUMNS)
     .single();
   ```

   El `UPDATE` sigue siendo una sola sentencia: `status` y su instante quedan
   atómicos. La lectura previa no es una transacción aparte.

3. `src/lib/admin/appointments.ts` — `createAppointment` (decisión de
   consistencia). Si el `status` inicial es estampable (p. ej. el admin captura
   una cita ya `confirmed`), el `INSERT` incluye el estampado con el instante de
   creación:

   ```ts
   .insert({ ...payload, ...buildTransitionStamp(payload.status, new Date()) })
   ```

   El default sigue siendo `requested` (no estampable), así que la reserva
   pública (`src/lib/booking/booking.ts`, inserta `status: 'requested'`) no
   cambia.

4. `src/lib/booking/reschedule.ts` — **sin cambios.** Reprogramar actualiza
   `start_at` / `end_at` in situ y no toca `status`, así que no hay transición
   que estampar. La cita movida cuenta en su horario nuevo (supuesto registrado).

### Fase 2 — Panel en el dashboard

#### 2.1 Loader `src/lib/admin/metrics/loader.ts`

Envuelve Supabase y el contrato `isSupabaseConfigured` /
`isConfiguredButUnavailable` de `src/lib/wcc-payments.ts`, sin lanzar nunca
hacia el server component:

```ts
export type DashboardMetricsView = {
  isSupabaseConfigured: boolean;
  isConfiguredButUnavailable: boolean;
  generatedAt: string;
  preset: MetricsPreset;
  rangeLabel: string;              // "1 – 31 de octubre, 2026"
  range: { startAt: string; endAt: string };
  metrics: MetricsResult | null;   // null = rango sin datos
};

export async function getDashboardMetrics(
  params: { preset?: string; from?: string; to?: string },
  now?: Date
): Promise<DashboardMetricsView>;
```

Consultas (constantes, en `Promise.all`, **sin N+1**):

1. **Citas del rango** (todas, sin filtro de `status`): predicado exacto de
   solape semiabierto `start_at < range.end AND end_at > range.start`, expresado
   con PostgREST `.lt('start_at', endIso).gt('end_at', startIso)`. Columnas:
   `id, provider_id, start_at, end_at, status`.
2. **`business_hours`**: todas las filas (`id, provider_id, day_of_week,
   start_time, end_time`). Es una plantilla semanal recurrente; no se filtra por
   rango.
3. **`providers` por lote**: `.in('id', providerIds)` con la unión de ids de las
   citas y de `business_hours` (join manual por lote, mismo patrón que
   `patientsFor` en `wcc-payments.ts`). Solo para resolver nombres.
4. Si no hay configuración de Supabase → vista vacía con
   `isSupabaseConfigured: false`. Si algo lanza → `isConfiguredButUnavailable:
   true` y `metrics: null`.

`metrics === null` (rango sin citas y sin capacidad) dispara el estado vacío del
panel. No se agregan rutas API: el dashboard ya es un server component
`force-dynamic`.

#### 2.2 Página y componentes

- `app/(admin)/dashboard/page.tsx` (**modificar**, server component `async`):
  conserva `export const dynamic = 'force-dynamic'` y el título/descripción
  actuales. Lee `searchParams` como `Promise<{ preset?: string; from?: string;
  to?: string }>` (patrón Next 15 de
  `app/(admin)/whatsapp-command-center/contacts/page.tsx:6`), llama a
  `getDashboardMetrics({ preset, from, to })` y renderiza
  `<MetricsRangeSelector>` + `<MetricsSection>` arriba de la rejilla de enlaces
  existente.

  ```ts
  export default async function DashboardPage({
    searchParams,
  }: { searchParams?: Promise<{ preset?: string; from?: string; to?: string }> }) {
    const params = await searchParams;
    const view = await getDashboardMetrics(params ?? {});
    // <MetricsRangeSelector .../> + <MetricsSection view={view} /> + rejilla actual
  }
  ```

- `app/(admin)/dashboard/components/MetricsRangeSelector.tsx` (**nuevo**,
  `'use client'`): selector "Esta semana / Este mes / Rango personalizado" +
  `input type="date"` de inicio y fin. Actualiza la URL vía `useRouter().push` /
  `useSearchParams` (patrón `useSearchParams` ya usado en
  `app/(admin)/appointments/page.tsx:121`). Los presets son botones; el rango
  personalizado es un `<form>` pequeño con `from` / `to` (validados en el
  servidor).
- `app/(admin)/dashboard/components/MetricsSection.tsx` (**nuevo**, server
  presentacional, recibe `view` por props): cards en
  `<section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">` con el markup
  de `accounts-receivable/page.tsx:157-170` — **Ocupación %**, **Tasa de no-show
  %** (o "No disponible"), **Citas totales**, **Cancelaciones** — más el desglose
  por proveedor (tabla o lista de cards) y el bloque de tendencia (Fase 3). Si
  `metrics === null`, renderiza `EmptyState` de `src/components/admin/`; si
  `isConfiguredButUnavailable`, un aviso de degradación.
- Formato: porcentajes con `Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 })`;
  etiquetas de rango en español con `Intl.DateTimeFormat('es-MX', { timeZone:
  CLINIC_TZ, ... })`; nunca fechas crudas.

### Fase 3 — Tendencia contra el periodo anterior y serie

Todo se apoya en la misma lib pura; no se agregan consultas por proveedor ni por
bucket.

- `src/lib/admin/metrics/range.ts` (**extender**):

  ```ts
  /** Periodo inmediatamente anterior: mes→mes calendario previo, semana→7 días
   *  antes, personalizado→igual duración inmediatamente anterior. */
  export function previousRangeOf(preset: MetricsPreset, range: ClinicRange): ClinicRange;

  /** Sub-rangos alineados a días clínicos: diarios si el rango ≤ 31 días,
   *  semanales (recortadas al rango) si es mayor. */
  export function bucketRange(preset: MetricsPreset, range: ClinicRange): ClinicRange[];
  ```

- `src/lib/admin/metrics/trend.ts` (**nuevo**):

  ```ts
  export type MetricsTrend = {
    current: MetricsResult;
    previous: MetricsResult | null; // null = periodo anterior sin datos
    previousRange: ClinicRange;
    series: Array<{ range: ClinicRange; label: string; metrics: MetricsResult }>;
  };

  export function computeTrend(input: {
    preset: MetricsPreset;
    range: ClinicRange;
    previousRange: ClinicRange;
    appointments: MetricAppointment[];      // rango actual
    previousAppointments: MetricAppointment[];
    businessHours: MetricBusinessHour[];
    providers: ProviderRef[];
  }): MetricsTrend;
  ```

  Reglas: `previous` es `null` cuando el periodo anterior no tiene citas **ni**
  capacidad (la UI muestra "comparación no disponible", nunca una caída);
  la serie reutiliza `computeMetrics` por bucket, en memoria, sobre el mismo
  conjunto de citas ya cargado. La variación se calcula en el panel como
  `current − previous` solo si ambos son numéricos (`noShowRatePct` puede ser
  `null` → sin variación).

- `src/lib/admin/metrics/loader.ts` (**extender**): con el mismo conteo
  constante de consultas, agrega una lectura de citas del `previousRange`
  (reutiliza `business_hours` y `providers` ya cargados) y llama a
  `computeTrend`. Total: 2 lecturas de citas + 1 de `business_hours` + 1 de
  `providers`, sin importar el número de buckets.

- `app/(admin)/dashboard/components/MetricsSection.tsx` (**extender**): bloque de
  tendencia con la variación (flecha/etiqueta) y la serie simple (una barra por
  bucket con ocupación % / no-show %), rotulada en `America/Mexico_City`.

---

## 2. Decisiones de arquitectura

| # | Decisión | Valor | Razón / alternativa descartada |
|---|---|---|---|
| 1 | Frontera lib pura ↔ Supabase | `src/lib/admin/metrics/*` puro; `loader.ts` es la única capa con I/O | Permite probar bordes sin DB y sin reloj; el loader queda delgado. |
| 2 | Zona horaria | `America/Mexico_City` vía `clinic-time.ts` / `timezone.ts` | Consistencia con el resto del panel; nunca UTC del servidor. Se agrega a `timezone.ts` un wrapper `clinicDateRangeUtc` que reutiliza el `utcFromClinicParts` ya existente (no se duplica la aritmética de offset). |
| 3 | Convención de intervalo | Semiabierto `[start, end)` | Idéntica a `clinicDayRange`; evita doble conteo en el borde. |
| 4 | Prorrateo | `max(start, rangeStart)` / `min(end, rangeEnd)` | Requisito de spec para citas que cruzan medianoche o bordes. |
| 5 | Capacidad | Minutos de `business_hours` por día clínico (`day_of_week`, `0 = domingo`) | No existe tabla de exclusiones (`0002` es la constraint `EXCLUDE`); `EXTRACT(dow)` de `0004` confirma el mapeo de días. |
| 6 | Clamp | `[0, 100]`, `NaN → 0` | Datos sucios de `business_hours` no producen valores imposibles. |
| 7 | Ocupación sin capacidad | `0` % | No hay capacidad medible; el estado vacío del panel se reserva a rango sin citas ni horario. |
| 8 | Tasa de no-show | `no_show / (no_show + attended)`; denominador 0 → `null` | Requisito de spec; `null` ≠ `0`. |
| 9 | Agregado | `Σ numerador / Σ denominador`, no promedio de % | Requisito de spec; evita que un proveedor con poca agenda pese igual. |
| 10 | Numerador de ocupación | Incluye `confirmed, attended, pending, requested`; excluye `cancelled, rescheduled, no_show` | Decisión vinculante del issue #88 / proposal. |
| 11 | Reprogramación | Cuenta en su horario **nuevo** | `reschedule.ts` actualiza in situ sin cambiar status; documentado como supuesto. |
| 12 | Membresía de rango | Solape de intervalo para **todos** los conteos (incluye `no_show` / `attended` / `cancelled`) | Predicado uniforme y consistente con ocupación; no depende de backfill. Las columnas de transición son auditoría atómica **write-only** en esta entrega, con consumidor futuro (series temporales / Nora). |
| 13 | Desglose por proveedor | Unión de `provider_id` de citas y `business_hours`; sin ids → solo agregado | Cubre proveedores con agenda y sin citas; fallback a agregado si no hay ids. |
| 14 | Estampado de transición | Mapeo explícito `buildTransitionStamp` en el mismo `UPDATE` | Atómico por sentencia y verificable en tests; se descarta trigger (invisible al tipado/tests, no cubre `INSERT`). |
| 15 | `updateAppointment` | Lee `status` previo y solo estampa si cambió | Evita reescribir el instante histórico en un guardado sin cambio de estado. |
| 16 | `createAppointment` | Estampa en el `INSERT` si el status inicial es estampable | Consistencia: una cita creada ya `confirmed` no queda sin `confirmed_at`. |
| 17 | Migración | `0019` aditiva, nullable, sin índice nuevo | Las columnas no se filtran; no hay backfill ni constraint retroactiva. |
| 18 | Estado del selector | `searchParams` (`preset`, `from`, `to`); default `month` | Server component navegable/compartible sin estado en memoria; mes es el horizonte operativo por defecto. |
| 19 | Feature flag | No aplica | Métricas read-only; no habilitan escrituras nuevas de negocio. |
| 20 | Serie | Buckets diarios si el rango ≤ 31 días; semanales si es mayor | Serie "simple" sin multiplicar consultas; buckets en memoria. |

---

## 3. Flujo de datos

```text
GET /dashboard?preset=month            (o ?preset=custom&from=2026-10-01&to=2026-10-15)
  │
  ▼
app/(admin)/dashboard/page.tsx   (server component, force-dynamic)
  │  searchParams (Promise) ──▶ { preset, from, to }
  │
  ├─ resolveRange(params, new Date())
  │     preset = week  ──▶ lunes 00:00 local → lunes siguiente 00:00 local
  │     preset = month ──▶ clinicMonthRangeUtc(año, mes actuales)
  │     preset = custom──▶ clinicDateRangeUtc(from, to)  ([from 00:00, to+1d 00:00))
  │     (inválido/custom incompleto ──▶ fallback a month)
  │     TODOS los límites en America/Mexico_City; intervalo semiabierto [start, end)
  │
  ▼
getDashboardMetrics({ preset, from, to }, now?)
  │  si !isSupabaseConfigured ──▶ vista vacía (flag en false)
  │  try:
  │    Promise.all([
  │      appointments  .select('id, provider_id, start_at, end_at, status')
  │                    .lt('start_at', range.endIso)   ← solape
  │                    .gt('end_at',   range.startIso) ← semiabierto
  │      business_hours.select('id, provider_id, day_of_week, start_time, end_time')  // plantilla
  │    ])
  │    providers = .in('id', ids de citas ∪ business_hours)   // join manual por lote
  │  catch ──▶ { isConfiguredButUnavailable: true, metrics: null }
  │
  ▼
src/lib/admin/metrics/  (puro, en memoria)
  │  computeMetrics({ appointments, businessHours, providers, range })
  │    ├─ ocupación: Σ overlapMinutes(elegibles) / Σ capacityMinutes, clamp [0,100]
  │    ├─ no-show: no_show / (no_show + attended), null si denominador 0
  │    ├─ totales: totalAppointments, cancelledCount
  │    └─ desglose por proveedor (unión de ids)
  │  (Fase 3) previousRangeOf + computeTrend(..., previousAppointments, bucketRange)
  │
  ▼
<MetricsRangeSelector/>  +  <MetricsSection view={...}/>
  │  cards: Ocupación % · No-show % · Citas totales · Cancelaciones
  │  desglose por proveedor · tendencia vs periodo anterior · serie
  └─ metrics === null ──▶ EmptyState (sin valores inválidos)
```

Predicado de solape exacto (semiabierto): dos intervalos `[a, b)` y
`[start, end)` se solapan sí y solo sí `a < end AND b > start`. Ese es el
`.lt('start_at', endIso).gt('end_at', startIso)` del loader, y en memoria el
mismo criterio con `max` / `min` para prorratear.

---

## 4. Cambios de archivos

### Fase 1 — Librería pura + migración de transiciones

| Archivo | Acción | Propósito |
|---|---|---|
| `supabase/migrations/0019_appointment_transition_columns.sql` | Nuevo | `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmed_at / cancelled_at / no_show_at timestamptz`. Sin índice, sin cambio de enum. |
| `supabase/migrations/down/0019_appointment_transition_columns.down.sql` | Nuevo | `DROP COLUMN IF EXISTS` de las tres columnas (higiene, patrón `down/0018`). |
| `src/lib/admin/metrics/types.ts` | Nuevo | Tipos planos de entrada/salida y constantes de status. |
| `src/lib/admin/metrics/occupancy.ts` | Nuevo | Solape, capacidad, clamp y `computeOccupancy`. |
| `src/lib/admin/metrics/no-show.ts` | Nuevo | `computeNoShow` con denominador cero → `null`. |
| `src/lib/admin/metrics/aggregate.ts` | Nuevo | `computeMetrics` (agregado + desglose por proveedor). |
| `src/lib/admin/metrics/range.ts` | Nuevo | `resolveRange` en la TZ clínica (`previousRangeOf` / `bucketRange` llegan en Fase 3). |
| `src/lib/admin/metrics/transitions.ts` | Nuevo | `buildTransitionStamp` + `TRANSITION_COLUMN_BY_STATUS`. |
| `src/lib/admin/metrics/index.ts` | Nuevo | Barril de import estable. |
| `src/lib/admin/metrics/__tests__/occupancy.test.ts` | Nuevo | Bordes de ocupación (prorrateo, clamp, días sin horario, TZ). |
| `src/lib/admin/metrics/__tests__/no-show.test.ts` | Nuevo | Tasa, denominador cero, canceladas fuera. |
| `src/lib/admin/metrics/__tests__/aggregate.test.ts` | Nuevo | Agregado = Σ/Σ, desglose, fallback. |
| `src/lib/admin/metrics/__tests__/range.test.ts` | Nuevo | Semana/mes/custom, límites locales, `previousRangeOf`, `bucketRange`. |
| `src/lib/admin/metrics/__tests__/transitions.test.ts` | Nuevo | Mapeo status → columna; `{}` para no estampables. |
| `src/lib/admin/timezone.ts` | Modificar | Exportar `clinicDateKeyToUtc` y `clinicDateRangeUtc` reutilizando `utcFromClinicParts` (sin duplicar). |
| `src/lib/citas/appointment-status.ts` | Modificar | `...buildTransitionStamp(input.to, input.occurredAt)` en el mismo `UPDATE`. |
| `src/lib/admin/appointments.ts` | Modificar | `updateAppointment`: lee status previo y estampa si cambió. `createAppointment`: estampa en el `INSERT` si aplica. |
| `src/lib/citas/__tests__/appointment-status.test.ts` | Modificar | Aserción de `confirmed_at` / `cancelled_at` en el payload del update. |
| `src/lib/admin/__tests__/appointments.test.ts` | Modificar | Estampado en create/update, y **no** estampado si el status no cambia. |

### Fase 2 — Panel en el dashboard

| Archivo | Acción | Propósito |
|---|---|---|
| `src/lib/admin/metrics/loader.ts` | Nuevo | `getDashboardMetrics`: 2 lecturas base + join a `providers`, contrato `isSupabaseConfigured` / `isConfiguredButUnavailable`. |
| `src/lib/admin/metrics/__tests__/loader.test.ts` | Nuevo | Predicado de solape, ausencia de N+1, fallback de degradación, mapeo de nombres. |
| `app/(admin)/dashboard/page.tsx` | Modificar | Server component `async`: `searchParams` → `getDashboardMetrics` → `<MetricsRangeSelector>` + `<MetricsSection>`; conserva la rejilla de enlaces. |
| `app/(admin)/dashboard/components/MetricsRangeSelector.tsx` | Nuevo | Cliente: presets semana/mes/custom y fechas; actualiza la URL. |
| `app/(admin)/dashboard/components/MetricsSection.tsx` | Nuevo | Server presentacional: cards, desglose por proveedor, estado vacío y aviso de degradación. |
| `app/(admin)/dashboard/page.test.tsx` | Nuevo | Render del panel con loader mockeado (cards, desglose, estado vacío). |

### Fase 3 — Tendencia y serie

| Archivo | Acción | Propósito |
|---|---|---|
| `src/lib/admin/metrics/trend.ts` | Nuevo | `computeTrend`: periodo anterior, comparación y serie en memoria. |
| `src/lib/admin/metrics/range.ts` | Modificar | Agregar `previousRangeOf` y `bucketRange`. |
| `src/lib/admin/metrics/loader.ts` | Modificar | Lectura de citas del periodo anterior y llamada a `computeTrend`. |
| `app/(admin)/dashboard/components/MetricsSection.tsx` | Modificar | Bloque de tendencia (variación + serie) con el estado "no disponible". |
| `src/lib/admin/metrics/__tests__/trend.test.ts` | Nuevo | Comparación mes/semana/custom, periodo anterior sin datos → `null`, buckets. |
| `app/(admin)/dashboard/page.test.tsx` | Modificar | Casos de tendencia disponible y no disponible. |

### Sin cambios

- `appointment_status` (enum) y `supabase/migrations/0001_agenda_tables.sql`.
- `supabase/migrations/0002_agenda_exclusion.sql` (es la constraint `EXCLUDE`,
  no una tabla de exclusiones).
- `src/lib/booking/reschedule.ts` y `src/lib/booking/booking.ts` (no hay
  transición de status que estampar).
- `src/lib/admin/clinic-time.ts` (se reutiliza tal cual).
- `agent/**` (Nora conversacional) y `travelhub-app`.

---

## 5. Estrategia de pruebas

Runner existente: `npm run test` → `vitest run` (`package.json:12`), con
`environmentMatchGlobs` de jsdom para `app/**/*.test.ts*` y `src/components/**`.
Política test-first (RED → GREEN → TRIANGULATE) en Fase 1 para la lib pura y los
escritores.

### 5.1 Lib pura (exhaustiva)

Fixtures de instantes UTC fijos con expectativas locales exactas, como
`src/lib/admin/__tests__/clinic-time.test.ts` (p. ej.
`now = 2026-09-03T20:30:00.000Z` = 14:30 local).

| Archivo | Casos mínimos |
|---|---|
| `occupancy.test.ts` | Cita dentro del rango; cita que cruza medianoche del día; cita que cruza el borde del rango (prorrateo exacto); día sin `business_hours` → capacidad 0; rango que cruza meses; numerador > capacidad → clamp a 100; `NaN` → 0; capacidad 0 → 0 %; `business_hours` con dos bloques el mismo día se suman; `day_of_week` 0 = domingo. |
| `no-show.test.ts` | `no_show`/`attended` → razón; sin `no_show` → 0; sin `no_show` ni `attended` → `null`; `cancelled` fuera de numerador y denominador; conteo por proveedor vs agregado. |
| `aggregate.test.ts` | Agregado = Σ ocupados / Σ capacidad (no promedio de %); desglose por proveedor; proveedor con solo horario y proveedor con solo citas; sin ids → `providers: []`; totales y cancelaciones; estado vacío (sin citas ni horario). |
| `range.test.ts` | Semana empieza lunes en TZ clínica; mes = `clinicMonthRangeUtc`; custom `[from 00:00, to+1d 00:00)`; custom inválido → fallback `month`; `previousRangeOf` mes→mes previo, semana→−7 d, custom→igual duración; `bucketRange` diario vs semanal; límites cerca de medianoche UTC. |
| `transitions.test.ts` | `confirmed`→`confirmed_at`, `cancelled`→`cancelled_at`, `no_show`→`no_show_at` con el ISO exacto; `requested`/`pending`/`attended`/`rescheduled`→`{}`. |

### 5.2 Escritores de transición

- `src/lib/citas/__tests__/appointment-status.test.ts` (**extender**, patrón de
  query encadenable ya existente): el payload de `.update` incluye
  `confirmed_at` / `cancelled_at` igual al `occurredAt` ISO; sigue devolviendo
  `ineligible_status` / `not_found` sin escribir.
- `src/lib/admin/__tests__/appointments.test.ts` (**extender**): `updateAppointment`
  estampa solo cuando el `status` cambia; no reescribe el instante si el status
  es el mismo; `createAppointment` con status estampable lo escribe; con
  `requested` no agrega columnas.

### 5.3 Loader y panel

- `src/lib/admin/metrics/__tests__/loader.test.ts` (patrón `vi.mock` de
  `getSupabaseAdmin` de `appointment-status.test.ts`): verifica que la consulta
  de citas usa `.lt('start_at', endIso).gt('end_at', startIso)`; que se llama una
  sola vez por tabla (sin N+1); el join por lote a `providers`; y el contrato
  `isConfiguredButUnavailable` cuando el cliente lanza. La verificación contra
  una base real se difiere a la verificación manual de la fase (no hay DB en CI).
- `app/(admin)/dashboard/page.test.tsx` (patrón `render(await Page({...}))` de
  `app/(admin)/whatsapp-command-center/appointments/page.test.tsx`, con
  `getDashboardMetrics` mockeado y `next/navigation` mockeado): muestra las 4
  cards, el desglose por proveedor, "No disponible" cuando `noShowRatePct` es
  `null`, `EmptyState` cuando `metrics === null` y el aviso de degradación;
  Fase 3: variación y "comparación no disponible".
- `MetricsRangeSelector`: se cubre dentro de `page.test.tsx` si no se le agrega
  lógica propia; si se le agrega, test de componente jsdom colocado en
  `app/(admin)/dashboard/components/`.

### 5.4 Comandos de validación

```bash
npm run test        # vitest run — suite completa (foco primero en los archivos nuevos)
npx tsc --noEmit    # typecheck (equivalente a npm run typecheck)
```

Los tests de fecha/hora deben pasar `now` explícito a `resolveRange` /
`getDashboardMetrics` (o usar `vi.setSystemTime`) para no depender del reloj real.

---

## 6. Open Questions

Ninguna. El default del selector queda fijado en `month`, el rango personalizado
se pasa por `searchParams` y el desglose por proveedor cae a agregado cuando no
hay ids. La captura manual de `no_show` / `attended` sigue siendo una dependencia
operativa documentada en `proposal.md` (riesgo, no pregunta de diseño).
