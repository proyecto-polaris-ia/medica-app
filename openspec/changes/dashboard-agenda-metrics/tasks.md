# Tasks

Métricas de ocupación de agenda y tasa de no-show en el dashboard (issue
[#88](https://github.com/proyecto-polaris-ia/medica-app/issues/88)). El orden
respeta las dependencias y la estrategia de **PRs apilados**: **Fase 1 (lib pura
+ migración + escritores) es la base sobre `main`; Fase 2 (panel) se apila sobre
Fase 1; Fase 3 (tendencia) se apila sobre Fase 2.** Cada fase es un rebanado de
trabajo revisable por separado (una fase = un PR). Las tareas de código siguen
TDD (**RED → GREEN → TRIANGULATE → REFACTOR**); la migración se verifica de forma
estructural porque no hay runner de migraciones en `npm test`.

Convenciones: intervalo semiabierto `[start, end)` en UTC, zona horaria
`America/Mexico_City`, runner `npm run test` → `vitest run`, typecheck
`npm run typecheck` → `tsc --noEmit`.

---

## Fase 1 — Librería pura + migración de transiciones (PR base sobre `main`)

### 1. Migración `0019` (verificación estructural, sin runner de migraciones)

- [ ] 1.1 Crear `supabase/migrations/0019_appointment_transition_columns.sql`
  (siguiente secuencial tras `0018_appointment_reminders.sql`) con
  `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz, ADD COLUMN IF NOT EXISTS
  no_show_at timestamptz;`. **Aditiva, nullable, sin backfill, sin índice nuevo
  y sin tocar el enum `appointment_status`.** Estilo idempotente de `0018`.
  - Verificación:
    `grep -c "ADD COLUMN IF NOT EXISTS" supabase/migrations/0019_appointment_transition_columns.sql`
    → `3`; y confirmar por lectura que hay exactamente un `ALTER TABLE
    appointments` con las tres columnas `timestamptz` y **ningún** `CREATE INDEX`
    ni `ALTER TYPE`.
- [ ] 1.2 Crear `supabase/migrations/down/0019_appointment_transition_columns.down.sql`
  con `ALTER TABLE appointments DROP COLUMN IF EXISTS confirmed_at, DROP COLUMN IF
  EXISTS cancelled_at, DROP COLUMN IF EXISTS no_show_at;` (higiene, patrón
  `supabase/migrations/down/0018_appointment_reminders.down.sql`).
  - Verificación: lectura estructural; el `down` revierte exactamente las tres
    columnas de 1.1 y nada más.
- [ ] 1.3 Confirmar que el enum no se modifica y que no se agrega índice: buscar
  en `0019_*.sql` las cadenas `CREATE INDEX`, `ALTER TYPE`, `appointment_status`,
  `CHECK`.
  - Verificación: las cuatro búsquedas devuelven **cero** coincidencias.

### 2. Utilidades de zona horaria (TDD)

Archivo de implementación: `src/lib/admin/timezone.ts` (modificar).
Archivo de prueba: `src/lib/admin/__tests__/timezone.test.ts` (extender).

- [ ] 2.1 **RED** — Extender `src/lib/admin/__tests__/timezone.test.ts` con:
  `clinicDateKeyToUtc('2026-10-01')` → `2026-10-01T06:00:00.000Z` (medianoche
  local UTC−6); `clinicDateRangeUtc('2026-10-01', '2026-10-15')` → inicio
  `2026-10-01T06:00Z` y fin exclusivo `2026-10-16T06:00Z`; extremo en el que en
  UTC ya es el día siguiente y el límite local **no** se desplaza; fechas
  inválidas o invertidas → `null`. Fixtures de instantes UTC fijos, como
  `src/lib/admin/__tests__/clinic-time.test.ts`.
  - Verificación: `npx vitest run src/lib/admin/__tests__/timezone.test.ts` →
    falla (exports inexistentes).
- [ ] 2.2 **GREEN** — En `src/lib/admin/timezone.ts` exportar
  `clinicDateKeyToUtc(key: string): Date | null` y
  `clinicDateRangeUtc(from: string, to: string): { start: Date; end: Date } | null`,
  **reutilizando** el helper privado `utcFromClinicParts` ya existente (sin
  duplicar la aritmética de offset). Fin exclusivo = `to + 1 día` a medianoche
  local.
  - Verificación: `npx vitest run src/lib/admin/__tests__/timezone.test.ts` →
    pasa.
- [ ] 2.3 **TRIANGULATE/REFACTOR** — Añadir el caso de rango de un solo día
  (`from === to` → `[from 00:00, from+1d 00:00)`) y el caso cerca de medianoche
  UTC; limpiar sin cambiar el contrato.
  - Verificación: `npx vitest run src/lib/admin/__tests__/timezone.test.ts` →
    sigue en verde.

### 3. Lib pura — tipos (`types.ts`)

- [ ] 3.1 Crear `src/lib/admin/metrics/types.ts` con los tipos planos y
  constantes de `design.md` §1.2: `ClinicRange`, `MetricAppointment`,
  `MetricBusinessHour`, `ProviderRef`, `ProviderMetrics`, `MetricsResult`,
  `MetricsPreset` (`'week' | 'month' | 'custom'`) y las constantes
  `OCCUPANCY_STATUSES = ['confirmed','attended','pending','requested']`,
  `NON_OCCUPANCY_STATUSES = ['cancelled','rescheduled','no_show']`,
  `NO_SHOW_STATUSES = ['no_show','attended']` (con `as const`).
  - Verificación: `npm run typecheck` → sin errores; lectura de que los tipos
    importan `AppointmentStatus` desde `src/lib/admin/types.ts`.

### 4. Lib pura — ocupación (`occupancy.ts`, TDD)

Archivo de implementación: `src/lib/admin/metrics/occupancy.ts` (nuevo).
Archivo de prueba: `src/lib/admin/metrics/__tests__/occupancy.test.ts` (nuevo).

- [ ] 4.1 **RED** — Escribir `occupancy.test.ts` con los casos mínimos de
  `design.md` §5.1: cita dentro del rango; cita que cruza medianoche; cita que
  cruza el borde del rango con **prorrateo exacto** (`max(start, rangeStart)` /
  `min(end, rangeEnd)`); día sin `business_hours` → capacidad 0; rango que cruza
  meses; numerador > capacidad → **clamp a 100**; `NaN` → 0; capacidad 0 → 0 %;
  dos bloques de `business_hours` el mismo día se suman; `day_of_week` 0 =
  domingo. Fixtures de instantes UTC fijos con expectativas locales exactas.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/occupancy.test.ts`
    → falla (módulo inexistente).
- [ ] 4.2 **GREEN** — Implementar `occupancy.ts` con `overlapMinutes(startAt,
  endAt, range)`, `capacityMinutesForProvider(businessHours, providerId, range)`,
  `clampOccupancyPct(value)` y `computeOccupancy({ appointments, businessHours,
  providerId?, range })`. Iterar días clínicos desde `range.start` sumando 24 h
  hasta `range.end` (exclusive), `getUTCDay()` sobre la medianoche local para el
  `day_of_week`.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/occupancy.test.ts`
    → pasa.
- [ ] 4.3 **TRIANGULATE** — Cubrir los casos negativos que protegen el contrato:
  cita con `status` `cancelled` / `rescheduled` / `no_show` **no** suma al
  numerador; cita que termina exactamente en `range.start` o empieza exactamente
  en `range.end` aporta 0 (semiabierto); rango de longitud cero → 0.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/occupancy.test.ts`
    → sigue en verde con los casos nuevos.
- [ ] 4.4 **REFACTOR** — Limpiar nombres y la extracción de minutos/segmentos
  manteniendo la prueba en verde.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/occupancy.test.ts`
    → sigue en verde.

### 5. Lib pura — no-show (`no-show.ts`, TDD)

Archivo de implementación: `src/lib/admin/metrics/no-show.ts` (nuevo).
Archivo de prueba: `src/lib/admin/metrics/__tests__/no-show.test.ts` (nuevo).

- [ ] 5.1 **RED** — Escribir `no-show.test.ts`: `no_show` / `attended` →
  `no_show / (no_show + attended)`; sin `no_show` → 0 %; sin `no_show` ni
  `attended` → `null` (denominador cero, **nunca** 0); `cancelled` fuera de
  numerador y denominador; conteo por proveedor vs agregado; cita fuera del rango
  no cuenta.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/no-show.test.ts`
    → falla.
- [ ] 5.2 **GREEN** — Implementar `computeNoShow({ appointments, providerId?,
  range })` → `{ noShowCount, attendedCount, noShowRatePct: number | null }`,
  contando solo citas cuyo intervalo solape el rango.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/no-show.test.ts`
    → pasa.
- [ ] 5.3 **TRIANGULATE/REFACTOR** — Añadir rango sin datos → `null` y rango con
  solo `attended` → 0 %; limpiar sin cambiar el contrato.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/no-show.test.ts`
    → sigue en verde.

### 6. Lib pura — agregado y desglose (`aggregate.ts`, TDD)

Archivo de implementación: `src/lib/admin/metrics/aggregate.ts` (nuevo).
Archivo de prueba: `src/lib/admin/metrics/__tests__/aggregate.test.ts` (nuevo).

- [ ] 6.1 **RED** — Escribir `aggregate.test.ts`: agregado = `Σ ocupados / Σ
  capacidad` (**no** promedio de porcentajes por proveedor); desglose por
  proveedor; proveedor con solo horario → 0 %; proveedor con solo citas y sin
  horario → 0 % (capacidad 0); unión de ids citas ∪ `business_hours`; sin ids →
  `providers: []`; `totalAppointments` (sin filtrar status) y `cancelledCount`.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/aggregate.test.ts`
    → falla.
- [ ] 6.2 **GREEN** — Implementar `computeMetrics({ appointments,
  businessHours, providers?, range }): MetricsResult`, reutilizando
  `computeOccupancy` y `computeNoShow`, con clamp agregado a `[0, 100]`.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/aggregate.test.ts`
    → pasa.
- [ ] 6.3 **TRIANGULATE** — Estado vacío (sin citas ni horario) → `occupancyPct
  0`, `noShowRatePct null`, `providers: []`; y `clamp` cuando un proveedor infla
  el agregado por datos sucios de `business_hours`.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/aggregate.test.ts`
    → sigue en verde con los casos nuevos.
- [ ] 6.4 **REFACTOR** — Limpiar la construcción de la unión de ids y el mapeo a
  `MetricsResult`; prueba en verde.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/aggregate.test.ts`
    → sigue en verde.

### 7. Lib pura — resolución de rango (`range.ts`, TDD)

Archivo de implementación: `src/lib/admin/metrics/range.ts` (nuevo).
Archivo de prueba: `src/lib/admin/metrics/__tests__/range.test.ts` (nuevo).

- [ ] 7.1 **RED** — Escribir `range.test.ts` para `resolveRange(params, now)`:
  semana empieza **lunes** a medianoche local y termina el lunes siguiente
  (`[start, end)`); mes = `clinicMonthRangeUtc(año, mes actuales)`; custom
  `[from 00:00, to+1d 00:00)` vía `clinicDateRangeUtc`; custom incompleto o
  inválido → **fallback `month`**; default = `month`; límites cerca de medianoche
  UTC sin desplazar la ventana. `now` explícito (nunca reloj real).
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/range.test.ts`
    → falla.
- [ ] 7.2 **GREEN** — Implementar `resolveRange(params: { preset?, from?, to? },
  now: Date): { preset: MetricsPreset; range: ClinicRange }` reutilizando
  `clinicMonthRangeUtc` de `src/lib/admin/timezone.ts` y `clinicDateRangeUtc` de
  2.2; la semana se calcula desde el día clínico de `now` (0 = domingo) sin usar
  la fecha UTC del servidor.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/range.test.ts`
    → pasa.
- [ ] 7.3 **TRIANGULATE/REFACTOR** — Añadir semana que cruza el fin de mes y
  custom con `from > to` → fallback; limpiar sin cambiar el contrato.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/range.test.ts`
    → sigue en verde.

### 8. Lib pura — estampado de transición (`transitions.ts`, TDD)

Archivo de implementación: `src/lib/admin/metrics/transitions.ts` (nuevo).
Archivo de prueba: `src/lib/admin/metrics/__tests__/transitions.test.ts` (nuevo).

- [ ] 8.1 **RED** — Escribir `transitions.test.ts`: `confirmed` → `{ confirmed_at:
  <ISO exacto> }`; `cancelled` → `cancelled_at`; `no_show` → `no_show_at`;
  `requested` / `pending` / `attended` / `rescheduled` → `{}`.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/transitions.test.ts`
    → falla.
- [ ] 8.2 **GREEN** — Implementar `transitions.ts` con `TransitionStamp`,
  `TRANSITION_COLUMN_BY_STATUS` y `buildTransitionStamp(status, at)` (ISO vía
  `at.toISOString()`, `{}` si el status no es estampable).
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/transitions.test.ts`
    → pasa.
- [ ] 8.3 **TRIANGULATE/REFACTOR** — Verificar que el `at` recibido se usa tal
  cual (no `new Date()` interno); limpiar sin cambiar el contrato.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/transitions.test.ts`
    → sigue en verde.

### 9. Barril de la librería

- [ ] 9.1 Crear `src/lib/admin/metrics/index.ts` que re-exporte la superficie
  pública de `types`, `occupancy`, `no-show`, `aggregate`, `range` y
  `transitions` (barril de import estable para el loader y el panel).
  - Verificación: `npm run typecheck` → sin errores; el barril no exporta nada
    de I/O.

### 10. Escritores de `appointments.status` (TDD, mismo `UPDATE`)

Archivos de implementación: `src/lib/citas/appointment-status.ts` y
`src/lib/admin/appointments.ts` (modificar).
Archivos de prueba: `src/lib/citas/__tests__/appointment-status.test.ts` y
`src/lib/admin/__tests__/appointments.test.ts` (extender).

- [ ] 10.1 **RED** — Extender `src/lib/citas/__tests__/appointment-status.test.ts`
  (patrón de query encadenable ya existente): el payload de `.update` incluye
  `confirmed_at` / `cancelled_at` igual al `occurredAt` ISO; sigue devolviendo
  `ineligible_status` / `not_found` sin escribir. Extender
  `src/lib/admin/__tests__/appointments.test.ts`: `updateAppointment` estampa
  **solo** cuando el `status` cambia; **no** reescribe el instante si el status es
  el mismo; `createAppointment` con status estampable escribe la columna; con
  `requested` no agrega columnas.
  - Verificación:
    `npx vitest run src/lib/citas/__tests__/appointment-status.test.ts src/lib/admin/__tests__/appointments.test.ts`
    → falla.
- [ ] 10.2 **GREEN** — En `src/lib/citas/appointment-status.ts`
  (`transitionAppointmentFromReminder`) agregar
  `...buildTransitionStamp(input.to, input.occurredAt)` al `.update` existente
  (una sola sentencia; `input.to` es `'confirmed' | 'cancelled'`).
  - Verificación: `npx vitest run src/lib/citas/__tests__/appointment-status.test.ts`
    → pasa.
- [ ] 10.3 **GREEN** — En `src/lib/admin/appointments.ts`, `updateAppointment`
  lee el `status` actual (`select('status')`, lectura) y solo agrega el estampado
  si cambió: `.update({ ...parsed, ...stamp })` en una sola sentencia.
  `createAppointment` incluye `...buildTransitionStamp(payload.status, new Date())`
  en el `INSERT` si el status inicial es estampable (el default `requested` no
  estampa y la reserva pública no cambia).
  - Verificación: `npx vitest run src/lib/admin/__tests__/appointments.test.ts`
    → pasa.
- [ ] 10.4 **TRIANGULATE** — Confirmar que sin cambio de status **no** se agrega
  ninguna columna de transición (no se reescribe el histórico) y que
  `cancelled → confirmed` reestampa `confirmed_at` sin tocar `cancelled_at`.
  - Verificación:
    `npx vitest run src/lib/citas/__tests__/appointment-status.test.ts src/lib/admin/__tests__/appointments.test.ts`
    → sigue en verde.
- [ ] 10.5 **REFACTOR** — Limpiar la construcción del payload de update/insert
  manteniendo las pruebas en verde.
  - Verificación:
    `npx vitest run src/lib/citas/__tests__/appointment-status.test.ts src/lib/admin/__tests__/appointments.test.ts`
    → sigue en verde.

### 11. Verificación de Fase 1

- [ ] 11.1 Ejecutar la suite de la librería pura y los escritores:
  `npx vitest run src/lib/admin/metrics/__tests__ src/lib/admin/__tests__/timezone.test.ts src/lib/citas/__tests__/appointment-status.test.ts src/lib/admin/__tests__/appointments.test.ts`
  → todo en verde.
- [ ] 11.2 Ejecutar el typecheck: `npm run typecheck` → sin errores.
- [ ] 11.3 Verificación estructural de 1.1–1.3 (columnas nullable, sin índice,
  enum intacto) y lectura cruzada de que todo cálculo de fecha/ventana usa
  `America/Mexico_City` (`clinic-time.ts` / `timezone.ts`), nunca UTC del
  servidor.

---

## Fase 2 — Panel en el dashboard (PR apilado sobre Fase 1)

### 12. Loader de métricas (TDD)

Archivo de implementación: `src/lib/admin/metrics/loader.ts` (nuevo).
Archivo de prueba: `src/lib/admin/metrics/__tests__/loader.test.ts` (nuevo).

- [ ] 12.1 **RED** — Escribir `loader.test.ts` (patrón `vi.mock` de
  `getSupabaseAdmin` de `appointment-status.test.ts`): la consulta de citas usa
  el predicado de solape semiabierto `.lt('start_at', endIso).gt('end_at',
  startIso)`; **una sola** llamada por tabla (sin N+1); join manual por lote a
  `providers` con la unión de ids de citas y `business_hours`; contrato
  `isSupabaseConfigured: false` sin configuración y `isConfiguredButUnavailable:
  true` cuando el cliente lanza (nunca lanza hacia el server component).
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/loader.test.ts`
    → falla.
- [ ] 12.2 **GREEN** — Implementar `getDashboardMetrics(params, now?)` con las
  **2 lecturas base** en `Promise.all` (citas del rango: `id, provider_id,
  start_at, end_at, status`; `business_hours`: `id, provider_id, day_of_week,
  start_time, end_time`) + join a `providers`; llama a `computeMetrics` y
  devuelve `DashboardMetricsView` con `preset`, `rangeLabel` (es-MX,
  `America/Mexico_City`), `range` ISO y `metrics: MetricsResult | null`.
  Contrato `isSupabaseConfigured` / `isConfiguredButUnavailable` de
  `src/lib/wcc-payments.ts`.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/loader.test.ts`
    → pasa.
- [ ] 12.3 **TRIANGULATE** — Rango sin citas y sin capacidad → `metrics: null`
  (dispara estado vacío); proveedor en `business_hours` sin citas conserva su
  nombre mediante el join por lote.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/loader.test.ts`
    → sigue en verde.
- [ ] 12.4 **REFACTOR** — Limpiar el mapeo de filas y el armado del
  `rangeLabel`; prueba en verde.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/loader.test.ts`
    → sigue en verde.

### 13. Selector de rango

Archivo: `app/(admin)/dashboard/components/MetricsRangeSelector.tsx` (nuevo,
`'use client'`).

- [ ] 13.1 Implementar el selector con presets **Esta semana / Este mes / Rango
  personalizado** (botones) y `input type="date"` de `from` / `to`; actualiza la
  URL con `useRouter().push` / `useSearchParams` usando `preset`, `from`, `to`.
  - Verificación: `npm run typecheck` → sin errores; lectura de que no mantiene
    estado de rango en memoria (todo va por URL).
- [ ] 13.2 Cubrir el selector dentro de `app/(admin)/dashboard/page.test.tsx`
  (tarea 15.1); si se le agrega lógica propia (validación de fechas, deshabilitar
  "Aplicar" con rango inválido), mover la cobertura a
  `app/(admin)/dashboard/components/MetricsRangeSelector.test.tsx`.
  - Verificación: `npx vitest run "app/(admin)/dashboard/page.test.tsx"` → pasa
    (o el test de componente, si se separó).
- [ ] 13.3 Verificar que el rango personalizado incompleto no rompe la página:
  el servidor cae al default `month` (tarea 7.2).
  - Verificación: caso incluido en `page.test.tsx` con `from`/`to` parciales →
    renderiza el rango de mes.

### 14. Sección de métricas (cards, desglose y estados)

Archivos: `app/(admin)/dashboard/components/MetricsSection.tsx` (nuevo, server
presentacional) y `app/(admin)/dashboard/loading.tsx` (nuevo, estado de carga
de la ruta).

- [ ] 14.1 Implementar `MetricsSection({ view })` con las **4 cards** en
  `grid gap-3 sm:grid-cols-2 lg:grid-cols-4` y el markup de
  `app/(admin)/accounts-receivable/page.tsx:157-170`: **Ocupación %**, **Tasa de
  no-show %** (o "No disponible" cuando `noShowRatePct === null`), **Citas
  totales** y **Cancelaciones**. Porcentajes con `Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 1 })`; nunca fechas crudas.
  - Verificación: `npm run typecheck` → sin errores; lectura del markup contra
    el patrón de cards de `accounts-receivable`.
- [ ] 14.2 Implementar el **desglose por proveedor** (tabla o lista de cards)
  a partir de `metrics.providers`; si `providers: []`, mostrar solo el agregado
  (fallback) sin una tabla vacía inválida.
  - Verificación: `npm run typecheck` → sin errores; caso cubierto en 15.1.
- [ ] 14.3 Implementar los estados: `metrics === null` → `EmptyState` de
  `src/components/admin/EmptyState.tsx`; `isConfiguredButUnavailable` → aviso de
  degradación. Crear `app/(admin)/dashboard/loading.tsx` con `LoadingState` de
  `src/components/admin/LoadingState.tsx` para el estado de carga de la ruta
  (`force-dynamic`). *Nota: `loading.tsx` es un archivo aditivo de UI no listado
  en `design.md` §4; satisface el estado de carga exigido y no modifica ningún
  archivo del diseño.*
  - Verificación: `npx vitest run "app/(admin)/dashboard/page.test.tsx"` → cubre
    `EmptyState`, "No disponible" y el aviso de degradación; `npm run typecheck`
    → sin errores.
- [ ] 14.4 Verificar que no se renderizan valores inválidos ni porcentajes
  negativos en ningún estado (vacío, degradado, con datos).
  - Verificación: aserciones negativas en `page.test.tsx` (no aparece un
    porcentaje negativo ni `null` crudo).

### 15. Página del dashboard (TDD)

Archivo de implementación: `app/(admin)/dashboard/page.tsx` (modificar).
Archivo de prueba: `app/(admin)/dashboard/page.test.tsx` (nuevo).

- [ ] 15.1 **RED** — Escribir `page.test.tsx` (patrón `render(await Page({...}))`
  de `app/(admin)/whatsapp-command-center/appointments/page.test.tsx`, con
  `getDashboardMetrics` y `next/navigation` mockeados): muestra las 4 cards, el
  desglose por proveedor, "No disponible" cuando `noShowRatePct` es `null`,
  `EmptyState` cuando `metrics === null` y el aviso de degradación.
  - Verificación: `npx vitest run "app/(admin)/dashboard/page.test.tsx"` → falla.
- [ ] 15.2 **GREEN** — Convertir `app/(admin)/dashboard/page.tsx` en server
  component `async` que conserva `export const dynamic = 'force-dynamic'` y el
  título/descripción actuales; lee `searchParams` como
  `Promise<{ preset?; from?; to? }>` (patrón Next 15), llama a
  `getDashboardMetrics(params ?? {})` y renderiza `<MetricsRangeSelector>` +
  `<MetricsSection view={view} />` **arriba** de la rejilla de enlaces existente.
  - Verificación: `npx vitest run "app/(admin)/dashboard/page.test.tsx"` → pasa.
- [ ] 15.3 **TRIANGULATE** — Rango vacío → estado vacío sin valores inválidos;
  cambio de preset en `searchParams` → la sección refleja las nuevas métricas;
  rango personalizado con `from`/`to` → usa la ventana personalizada.
  - Verificación: `npx vitest run "app/(admin)/dashboard/page.test.tsx"` → sigue
    en verde.
- [ ] 15.4 **REFACTOR** — Limpiar la composición de la página y las props;
  prueba en verde.
  - Verificación: `npx vitest run "app/(admin)/dashboard/page.test.tsx"` → sigue
    en verde.

### 16. Verificación de Fase 2

- [ ] 16.1 Ejecutar las pruebas focales:
  `npx vitest run src/lib/admin/metrics/__tests__/loader.test.ts "app/(admin)/dashboard/page.test.tsx"`
  → todo en verde.
- [ ] 16.2 Ejecutar el typecheck: `npm run typecheck` → sin errores.
- [ ] 16.3 Verificación manual (no hay DB en CI): con datos reales, confirmar
  que el panel muestra las 4 cards, el desglose por proveedor y que el selector
  recalcula al cambiar el rango; registrar la evidencia en el PR.

---

## Fase 3 — Tendencia y serie (PR apilado sobre Fase 2)

### 17. `range.ts` extendido — periodo anterior y buckets (TDD)

Archivo de implementación: `src/lib/admin/metrics/range.ts` (modificar).
Archivo de prueba: `src/lib/admin/metrics/__tests__/range.test.ts` (extender).

- [ ] 17.1 **RED** — Extender `range.test.ts`: `previousRangeOf('month', range)`
  → mes calendario inmediatamente anterior; `previousRangeOf('week', range)` →
  mismo rango menos 7 días (semana anterior); `previousRangeOf('custom', range)`
  → periodo inmediatamente anterior de **igual duración**; `bucketRange` →
  sub-rangos **diarios** si el rango ≤ 31 días y **semanales** (recortados al
  rango) si es mayor, alineados a días clínicos.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/range.test.ts`
    → falla.
- [ ] 17.2 **GREEN** — Implementar `previousRangeOf(preset, range)` y
  `bucketRange(preset, range)` reutilizando la aritmética clínica ya existente
  (sin nuevas consultas ni reloj implícito).
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/range.test.ts`
    → pasa.
- [ ] 17.3 **TRIANGULATE/REFACTOR** — Buckets de un rango que cruza meses y
  `previousRangeOf('custom')` de duración impar; limpiar sin cambiar el
  contrato.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/range.test.ts`
    → sigue en verde.

### 18. `trend.ts` — comparación y serie (TDD)

Archivo de implementación: `src/lib/admin/metrics/trend.ts` (nuevo).
Archivo de prueba: `src/lib/admin/metrics/__tests__/trend.test.ts` (nuevo).

- [ ] 18.1 **RED** — Escribir `trend.test.ts`: comparación mes contra mes y
  semana contra semana anterior; custom contra el periodo anterior de igual
  duración; `previous` = `null` cuando el periodo anterior no tiene citas **ni**
  capacidad (nunca una caída); serie con `computeMetrics` por bucket, en memoria,
  sobre el mismo conjunto de citas.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/trend.test.ts`
    → falla.
- [ ] 18.2 **GREEN** — Implementar `computeTrend({ preset, range,
  previousRange, appointments, previousAppointments, businessHours, providers })`
  → `MetricsTrend { current, previous: MetricsResult | null, previousRange,
  series }`. La variación se deja al panel (`current − previous` solo si ambos
  son numéricos).
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/trend.test.ts`
    → pasa.
- [ ] 18.3 **TRIANGULATE** — `previous === null` no se presenta como aumento ni
  caída; `noShowRatePct === null` en alguno de los periodos → sin variación.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/trend.test.ts`
    → sigue en verde.
- [ ] 18.4 **REFACTOR** — Limpiar el armado de la serie y las etiquetas de
  bucket; prueba en verde.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/trend.test.ts`
    → sigue en verde.

### 19. `loader.ts` extendido — lectura del periodo anterior

Archivo: `src/lib/admin/metrics/loader.ts` (modificar).

- [ ] 19.1 **RED** — Extender `loader.test.ts`: se agrega **una** lectura de
  citas del `previousRange` reutilizando `business_hours` y `providers` ya
  cargados; el conteo total es **2 lecturas de citas + 1 de `business_hours` + 1
  de `providers`**, sin importar el número de buckets (sin N+1).
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/loader.test.ts`
    → falla.
- [ ] 19.2 **GREEN** — Extender `getDashboardMetrics` y `DashboardMetricsView`
  para incluir la tendencia (`computeTrend`), manteniendo las constantes de
  consulta y el contrato de degradación.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/loader.test.ts`
    → pasa.
- [ ] 19.3 **TRIANGULATE/REFACTOR** — Periodo anterior sin datos → tendencia "no
  disponible"; limpiar el armado del `previousRange`; prueba en verde.
  - Verificación: `npx vitest run src/lib/admin/metrics/__tests__/loader.test.ts`
    → sigue en verde.

### 20. Panel de tendencia (extender `MetricsSection`)

Archivos: `app/(admin)/dashboard/components/MetricsSection.tsx` y
`app/(admin)/dashboard/page.test.tsx` (modificar).

- [ ] 20.1 **GREEN** — Extender `MetricsSection` con el bloque de tendencia:
  variación (flecha/etiqueta) contra el periodo anterior y la serie simple (una
  barra por bucket con ocupación % / no-show %), rotulada en
  `America/Mexico_City`; cuando `previous === null`, mostrar "comparación no
  disponible" (nunca caída/aumento).
  - Verificación: `npm run typecheck` → sin errores.
- [ ] 20.2 **RED/GREEN** — Extender `page.test.tsx`: caso de tendencia
  disponible (variación y serie) y caso de "comparación no disponible" con
  `previous: null`.
  - Verificación: `npx vitest run "app/(admin)/dashboard/page.test.tsx"` → pasa.
- [ ] 20.3 **TRIANGULATE/REFACTOR** — `noShowRatePct === null` en el periodo
  actual o anterior → sin variación de no-show pero sí de ocupación; limpiar el
  render; prueba en verde.
  - Verificación: `npx vitest run "app/(admin)/dashboard/page.test.tsx"` → sigue
    en verde.

### 21. Verificación de Fase 3

- [ ] 21.1 Ejecutar las pruebas focales de la fase:
  `npx vitest run src/lib/admin/metrics/__tests__/range.test.ts src/lib/admin/metrics/__tests__/trend.test.ts src/lib/admin/metrics/__tests__/loader.test.ts "app/(admin)/dashboard/page.test.tsx"`
  → todo en verde.
- [ ] 21.2 Ejecutar la suite completa de cierre: `npm run test` → todo en verde
  (o registrar cualquier fallo preexistente ajeno al cambio).
- [ ] 21.3 Ejecutar el typecheck: `npm run typecheck` → sin errores.
- [ ] 21.4 Verificación manual de la tendencia con datos reales (semana contra
  semana, mes contra mes, custom contra periodo anterior) y de la serie; anotar
  la evidencia en el PR.

---

## Workload forecast

- **Tareas:** **68 checkboxes** distribuidas en 3 fases / 21 secciones de
  verificación (Fase 1: 33; Fase 2: 18; Fase 3: 17).
- **Archivos estimados:** **~29 archivos únicos** (22 nuevos, 7 modificados),
  contando cada archivo una sola vez aunque una fase lo extienda:
  - **Fase 1 (20):** 14 nuevos —
    `supabase/migrations/0019_appointment_transition_columns.sql`,
    `supabase/migrations/down/0019_appointment_transition_columns.down.sql`,
    `src/lib/admin/metrics/types.ts`, `occupancy.ts`, `no-show.ts`,
    `aggregate.ts`, `range.ts`, `transitions.ts`, `index.ts` y sus 5 tests en
    `src/lib/admin/metrics/__tests__/`; 6 modificados —
    `src/lib/admin/timezone.ts` (+ su test), `src/lib/citas/appointment-status.ts`
    (+ su test), `src/lib/admin/appointments.ts` (+ su test).
  - **Fase 2 (7):** 6 nuevos — `src/lib/admin/metrics/loader.ts` (+ test),
    `app/(admin)/dashboard/components/MetricsRangeSelector.tsx`,
    `app/(admin)/dashboard/components/MetricsSection.tsx`,
    `app/(admin)/dashboard/page.test.tsx`, `app/(admin)/dashboard/loading.tsx`;
    1 modificado — `app/(admin)/dashboard/page.tsx`.
  - **Fase 3 (8):** 2 nuevos — `src/lib/admin/metrics/trend.ts` (+ test); 6
    modificados — `range.ts` (+ test), `loader.ts` (+ test),
    `MetricsSection.tsx`, `page.test.tsx`.
- **Tamaño de diff aproximado por rebanado (PR):**
  - **Fase 1 (base sobre `main`): ~1,300–1,900 líneas.** Es la rebanada más
    grande: lib pura ~450–650, suites exhaustivas ~600–900, migración + `down`
    ~25, `timezone.ts` + escritores y sus tests ~150–250. **Riesgo de tamaño de
    review: alto** (supera con holgura el umbral de ~400 líneas de `chained-pr`);
    es el precio de dejar toda la aritmética probada antes de tocar la UI.
  - **Fase 2 (apilada sobre Fase 1): ~450–700 líneas.** Loader + test ~300–430,
    página/selector/sección ~250–350, `loading.tsx` ~10. **Riesgo: medio-alto.**
  - **Fase 3 (apilada sobre Fase 2): ~250–400 líneas.** `range`/`trend` + tests
    ~240–360, panel ~60–100. **Riesgo: medio.**
- **Riesgo de runner:** no hay runner de migraciones en `npm test`; la migración
  `0019` se verifica de forma estructural (tareas 1.1–1.3). `npm run lint` no
  existe en `package.json` (no se lista como comando de verificación aquí).
- **Riesgo de dependencia operativa:** la tasa de no-show depende de que el admin
  capture `no_show` / `attended` (documentado en `proposal.md`); no bloquea el
  Apply.
- **Dependencia entre PRs:** Fase 2 requiere Fase 1 para `src/lib/admin/metrics/*`
  y `clinicDateRangeUtc`; Fase 3 requiere Fase 2 para el `loader.ts` y
  `MetricsSection.tsx` ya existentes.

## Decision needed before apply

**Decision needed before apply: No.**

Las **3 fases con PRs apilados ya están decididas** (Fase 1 base sobre `main` →
Fase 2 apilada sobre Fase 1 → Fase 3 apilada sobre Fase 2) y no requieren una
decisión nueva. `design.md` §6 declara **cero open questions**: el default del
selector queda fijado en `month`, el rango personalizado viaja por
`searchParams` y el desglose por proveedor cae a agregado cuando no hay ids. La
captura manual de `no_show` / `attended` es un riesgo operativo documentado, no
una pregunta de diseño.

Único punto que el `Apply` debe conocer **(no bloquea)**: se agrega
`app/(admin)/dashboard/loading.tsx` (estado de carga de la ruta) como archivo
aditivo de UI no listado en `design.md` §4, requerido por el estado de carga del
panel; no modifica ningún archivo del diseño y es trivialmente reversible.
