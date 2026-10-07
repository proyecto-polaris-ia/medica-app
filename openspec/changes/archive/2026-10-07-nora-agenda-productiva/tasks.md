# Tasks: nora-agenda-productiva

Convención de estado: `[ ]` pendiente · `[x]` completo. TDD activo
(`openspec/config.yaml` → `apply.tdd: true`): cada fase escribe primero el test
que falla (RED), implementa lo mínimo (GREEN) y triangula bordes.

## 0. Artefactos SDD (completado)

- [x] 0.1 `proposal.md` — alcance de las dos fases, non-goals y plan de reversión.
- [x] 0.2 `specs/nora-agent/spec.md` — delta `ADDED` con 8 requisitos y 41 escenarios en español.
- [x] 0.3 `design.md` — decisión "capacidad determinista con UI, no agente LLM" con alternativas descartadas, modelo de datos, algoritmo, migración y pruebas.
- [x] 0.4 `tasks.md` — plan por fases.
- [x] 0.5 Commit de artefactos SDD (work unit; lo ejecuta el orquestador).

## 1. Fase 1 — Indicadores de agenda productiva (PR apilado 1)

### 1.1 Núcleo puro de huecos (RED → GREEN)

- [x] 1.1.1 RED: `src/lib/admin/nora/__tests__/gaps.test.ts` con los escenarios de "Detección determinista de huecos" (hueco entre dos citas, día lleno, cancelada no ocupa, ventanas solapadas se unen, tramo bajo el mínimo, cita que cruza el borde). Capturar el fallo observado.
- [x] 1.1.2 GREEN: `src/lib/admin/nora/types.ts` (`NoraGap`, `NORA_MIN_GAP_MINUTES`) y `src/lib/admin/nora/gaps.ts` (`computeGaps`): unir ventanas de `business_hours`, restar citas con `status NOT IN ('cancelled','rescheduled')` (semántica de `0004_agenda_functions.sql`), filtrar por mínimo y ordenar por `(providerId, startAt)`. Reutilizar `overlapsRange`, `capacityMinutesForProvider` y `clinicDayKey`; no duplicar aritmética.
- [x] 1.1.3 TRIANGULATE: bordes de medianoche y límites de ventana en `America/Mexico_City`; rango que cruza mes; ventanas que se tocan (no solo solapan); sin `business_hours`. Mantener verde.

### 1.2 Loader de Nora (reuso de métricas + degradación)

- [x] 1.2.1 RED: `src/lib/admin/nora/__tests__/loader.test.ts` (Supabase mockeado): la ocupación/no-show iguala la del motor de `dashboard-metrics`; `isSupabaseConfigured=false` → vista no disponible; fallo de lectura → `isConfiguredButUnavailable` sin lanzar; rango sin datos → estado vacío.
- [x] 1.2.2 GREEN: `src/lib/admin/nora/loader.ts` (`getNoraView`) reutilizando `resolveRange`, `computeMetrics`, `computeGaps` y el contrato de degradación de `src/lib/admin/metrics/loader.ts`. Lecturas agregadas en `Promise.all` (citas, `business_hours`, `providers`, `services`); sin N+1.
- [x] 1.2.3 TRIANGULATE: fallo intermitente de una sola lectura, rango `custom` inválido, proveedor sin `business_hours`.

### 1.3 Sección Nora en el panel

- [x] 1.3.1 RED: extender `app/(admin)/dashboard/page.test.tsx` con huecos y minutos improductivos por proveedor/día, estado vacío y aviso de degradación; conservar los tests de métricas y de la rejilla existente.
- [x] 1.3.2 GREEN: `app/(admin)/dashboard/components/NoraSection.tsx` (server component) y montarlo en `app/(admin)/dashboard/page.tsx` resolviendo `getNoraView(params)` en paralelo con `getDashboardMetrics(params)`, con los mismos `searchParams`. Reutilizar `MetricsRangeSelector` y `EmptyState` sin cambios.
- [x] 1.3.3 TRIANGULATE: cambio de rango recalcula; `metrics === null` no rompe la sección; sin valores `null`/`undefined`/negativos.

### 1.4 Verificación de la Fase 1

- [x] 1.4.1 `npx tsc --noEmit` y `npm run build` verdes.
- [x] 1.4.2 `npm run test` (suite unitaria) verde.
- [x] 1.4.3 Commits por unidad revisable (máx. 400 líneas por PR): (a) lib pura + tests, (b) loader + tests, (c) sección de panel + tests.

## 2. Fase 2 — Sugerencias de reacomodo con confirmación humana (PR apilado 2)

### 2.1 Migración aditiva

- [x] 2.1.1 Crear `supabase/migrations/<timestamp>_nora_reschedule_suggestions.sql` (timestamp UTC al momento de crearla; convención de `architecture.md` §4): tabla `nora_reschedule_suggestions` con `status text CHECK`, `reason_code text CHECK`, `decided_by`, `decided_at`, índices `(status, created_at)` y `(appointment_id, created_at)`, trigger `set_updated_at`, RLS `ENABLE`/`FORCE`, `REVOKE anon`/`GRANT authenticated`, policy `admin_all` (patrón idempotente de `0018_appointment_reminders.sql`). **No** tocar el enum `appointment_status`.
- [x] 2.1.2 Crear `supabase/migrations/down/<timestamp>_nora_reschedule_suggestions.down.sql` con `DROP TABLE IF EXISTS public.nora_reschedule_suggestions;`.
- [x] 2.1.3 `supabase start` + `supabase db reset` aplican las migraciones desde cero sin error.

### 2.2 Generador determinista de sugerencias (RED → GREEN)

- [x] 2.2.1 RED: `src/lib/admin/nora/__tests__/suggestions.test.ts` con los escenarios de "Generación de sugerencias de reacomodo": hueco real, sin hueco suficiente, no se inventan horas, `gap_before`/`gap_after`/`gap_between`, lista acotada y orden determinista, cita terminal no movible, cita ya en el hueco no se mueve.
- [x] 2.2.2 GREEN: `src/lib/admin/nora/suggestions.ts` (`computeSuggestions`, `NORA_MAX_SUGGESTIONS`): citas movibles `requested|pending|confirmed`, candidato = hueco del mismo proveedor con `minutes >= serviceDurationMinutes` y `startAt !== appointment.startAt`, razón determinista sobre citas activas, mejor candidato por cita y salida acotada/ordenada. Puro: sin I/O, sin reloj, sin aplicación.
- [x] 2.2.3 TRIANGULATE: empate de candidatos, múltiples proveedores, cero citas movibles, cero huecos, `serviceDurationMinutes` exactamente igual al hueco.

### 2.3 Persistencia idempotente en el loader

- [x] 2.3.1 RED: `src/lib/admin/nora/__tests__/loader.local.test.ts` (contra Supabase local, `npm run test:local`): las sugerencias nuevas se persisten como `proposed`; reejecutar el loader no duplica `(appointment_id, suggested_start_at)`; estado vacío sin datos.
- [x] 2.3.2 GREEN: extender `getNoraView` para persistir sugerencias nuevas de forma idempotente (verificación previa por clave) y leer las `proposed` existentes. Nunca aplicar ni decidir.
- [x] 2.3.3 TRIANGULATE: cita que deja de ser movible entre corridas; hueco que se llena entre corridas.

### 2.4 Ruta de aplicación y ciclo de vida

- [x] 2.4.1 RED: `src/lib/admin/nora/__tests__/apply.local.test.ts` (datos locales): aceptar aplica por `rescheduleAppointment` y marca `applied`; conflicto `23P01` no aplica ni sobrescribe; cita movida desde la propuesta → `expired`; rastro anexado a `appointments.notes` con hora de la clínica; `status` de la cita intacto; sugerencia `expired` no se aplica.
- [x] 2.4.2 GREEN: `src/lib/admin/nora/apply.ts` (`applyAcceptedSuggestion`): guarda optimista `WHERE status='proposed'` → `accepted`; releer y comparar `start_at`/`end_at`; llamar `rescheduleAppointment` (`src/lib/booking/reschedule.ts`); marcar `applied` solo tras éxito; anexar rastro con `clinicTimeLabel` sin sobrescribir `notes`.
- [x] 2.4.3 TRIANGULATE: doble aceptación concurrente (una gana), `invalid_status`, sugerencia inexistente.

### 2.5 Confirmación humana en el panel

- [x] 2.5.1 **Verificar primero** la API de revalidación/cache contra la guía de Next.js que exige `AGENTS.md` (advierte que puede diferir de lo esperado).
- [x] 2.5.2 RED: `app/(admin)/dashboard/__tests__/nora-actions.test.ts`: `requireUser` obligatorio; aceptar/rechazar solo desde `proposed`; rechazar no mueve la cita; sin confirmación ninguna cita se toca.
- [x] 2.5.3 GREEN: `app/(admin)/dashboard/nora-actions.ts` (`'use server'`, `requireUser()`, `decided_by = user.id`, invalidación de la ruta) y `app/(admin)/dashboard/components/NoraSuggestionActions.tsx` (botones Aceptar/Rechazar con resultado aplicada/expirada/conflicto). Mostrar la lista en `NoraSection`.
- [x] 2.5.4 TRIANGULATE: doble click en Aceptar (idempotente), fallo de la aplicación (la fila sigue visible, sin romper la página).

### 2.6 Verificación de la Fase 2

- [x] 2.6.1 `supabase start` + `supabase db reset`, luego `npm run test:local` verde.
- [x] 2.6.2 `npx tsc --noEmit` y `npm run build` verdes.
- [x] 2.6.3 Commits por unidad revisable: (a) migración + down, (b) generador puro + tests, (c) loader/persistencia + tests, (d) aplicación + actions + UI + tests.

## 3. Verificación final del change

- [x] 3.1 `supabase start`
- [x] 3.2 `supabase db reset`
- [x] 3.3 `npm run test:local`
- [x] 3.4 `npx tsc --noEmit`
- [x] 3.5 `npm run build`
- [x] 3.6 `npm run lint` (si aplica al PR)
- [x] 3.7 Revisión de invariantes: enum `appointment_status` intacto; `business_hours` intacto; ninguna cita movida sin confirmación humana; sin rutas WhatsApp para sugerencias.

## 4. Cierre y archivo

- [x] 4.1 Crear `verify-report.md` con el mapeo escenario → evidencia y los checks ejecutados.
- [x] 4.2 Mover `openspec/changes/nora-agenda-productiva/` a `openspec/changes/archive/YYYY-MM-DD-nora-agenda-productiva/` y fusionar el delta `ADDED` en `openspec/specs/nora-agent/spec.md`.
- [x] 4.3 Actualizar `architecture.md` (§3.2 topología: Nora como capacidad admin) si el cierre lo requiere.
- [x] 4.4 Registrar la evidencia de commits por fase y el estado final en `odd/tasks/nora-agenda-productiva.md`.
