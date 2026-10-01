# Proposal: Planes de tratamiento (Fase 2 del expediente)

## Intent

Construir los planes de tratamiento del expediente dental: el documento en el que
el staff acuerda en consultorio el monto del tratamiento con el paciente. Es el
puente entre la Fase 1 (diagnóstico / `clinical-record`, ya integrada) y la Fase 3
(pagos/morosidad). El problema que resuelve es la ausencia de una representación
persistente del acuerdo económico del tratamiento — qué se hará, a qué precio y en
qué estado — que hoy no existe en el esquema.

Regla de dominio innegociable: los montos los define el staff en consultorio, nunca
el LLM. Los montos en `treatment_plans` son el acuerdo interno; la exposición por
WhatsApp se gobierna después (Fase 4 Mora) y únicamente para planes aceptados. Se
respeta el guardrail "no precios definitivos por WhatsApp".

## Scope

### In Scope

- Migración idempotente `0015` con dos tablas nuevas:
  - `treatment_plans`: `patient_id` FK, `provider_id` FK, `clinical_visit_id` FK
    nullable, `name`, `status` (enum `draft/presented/accepted/in_progress/completed/cancelled`),
    `total_amount numeric(12,2)` MXN, `accepted_at timestamptz NULL`, `notes`,
    `created_by`, timestamps.
  - `treatment_plan_items`: `treatment_plan_id` FK cascade, `description`,
    `service_id` FK nullable, `tooth` (FDI) nullable, `quantity int default 1`,
    `unit_price numeric(12,2)`, `status` (enum `pending/done`), timestamps.
  - RLS activa (patrón Fase 1: `REVOKE ALL ON TABLE ... FROM anon`) y migración `down`.
- Cálculo de `total_amount` como snapshot: recálculo automático solo mientras
  `status = 'draft'`; en estados posteriores, cambios de ítems requieren transición
  explícita de estado (volver a `draft`) o nueva versión.
- `accepted_at timestamptz NULL` llenado en la transición a `accepted`, preparando
  la Fase 3 sin inventar un modelo de pagos.
- Nueva pestaña "Plan de tratamiento" en el expediente del paciente.
- API CRUD autenticada para planes e ítems (rutas anidadas bajo
  `app/api/admin/patients/[id]/treatment-plans`).
- Capa de datos `src/lib/admin/treatment-plans.ts` con validadores en `validate.ts`
  y tipos en `types.ts`.
- Pruebas unitarias (Vitest) de la capa de datos, siguiendo el estilo de
  `clinical-visits.test.ts`.

### Out of Scope

- Pagos / abonos / morosidad (Fase 3).
- Recordatorios y cobranza (Fase 4).
- Odontograma (representación gráfica por diente).
- PDF/impresión del presupuesto (evaluar después).
- `due_date` y cualquier campo de pagos; se difieren a Fase 3 cuando se defina el
  modelo de pagos.
- Cualquier modificación a `travelhub-app` (regla crítica: copiar + adaptar, nunca editar).

## Capabilities

> Esta sección es el CONTRATO entre proposal y specs.
> El agente sdd-spec la lee para saber qué archivos de spec crear o actualizar.

### New Capabilities

- `treatment-plans`: CRUD de planes de tratamiento y sus ítems; semántica de
  `total_amount` como snapshot (recálculo solo en `draft`); estados del plan
  (`draft/presented/accepted/in_progress/completed/cancelled`) y de ítem
  (`pending/done`); `accepted_at` en la aceptación; y la pestaña "Plan de
  tratamiento" en el expediente. Spec completa en
  `openspec/changes/treatment-plans/specs/treatment-plans/spec.md` durante la fase
  de specs y archivada en `openspec/specs/treatment-plans/spec.md`.

### Modified Capabilities

- `patient-record-summary`: el requerimiento de organización en pestañas del
  expediente ("Datos, Historia, Consultas y Citas") gana una pestaña "Planes" /
  "Plan de tratamiento". Es un cambio a nivel de spec (la enumeración de pestañas es
  un comportamiento observable), no solo de implementación.

## Approach

Extender el patrón ya consolidado en Fase 1 (clinical-record) sin introducir
arquitectura nueva:

1. **Migración** `supabase/migrations/0015_treatment_plans.sql` (y su
   `down/0015_treatment_plans.down.sql`): `CREATE TABLE IF NOT EXISTS`,
   `DROP CONSTRAINT IF EXISTS`, `CREATE INDEX IF NOT EXISTS`, enums con
   `CREATE TYPE ... IF NOT EXISTS` dentro de bloque `DO $$`, y RLS con
   `REVOKE ALL ON TABLE ... FROM anon`. Reversión ordenada: índices → tablas → tipos.
2. **Capa de datos** `src/lib/admin/treatment-plans.ts`: funciones
   `list/create/update/delete` de planes e ítems usando `getSupabaseAdmin()`
   (service role, server-side only), mapeo `snake_case → camelCase`, `SELECT_COLUMNS`
   explícito. El recálculo de `total_amount` se ejecuta en esta capa SOLO cuando
   `status = 'draft'`; en otros estados la capa rechaza mutaciones de ítems que
   alterarían el total (deben revertir a `draft` o crear nueva versión).
3. **Tipos y validación** en `types.ts` y `validate.ts`: validar `quantity`
   (entero positivo), `unit_price` (numérico no negativo), estado del plan e ítem
   (dentro del enum) y notación FDI `tooth` (formato válido o null si no aplica).
4. **API** anidada: `GET/POST /api/admin/patients/[id]/treatment-plans`,
   `GET/PATCH/DELETE /api/admin/patients/[id]/treatment-plans/[planId]`, e ítems
   anidados bajo `[planId]/items`. Autenticación con `requireUser()` +
   `handleAdminRequest()`; códigos 200/201/204 y errores 400/401/404/500.
5. **UI**: nueva pestaña `plans` en `PatientRecordTabs.tsx` (etiqueta
   "Plan de tratamiento"), componente `TreatmentPlansTab.tsx` y formulario
   `TreatmentPlanForm.tsx` (cabecera + ítems). La página
   `app/(admin)/patients/[id]/page.tsx` carga los planes y propaga callbacks
   `on*Changed`.

Decisiones de diseño recomendadas por exploration, incorporadas:

- `total_amount` almacenado como snapshot que representa lo aceptado por el
  paciente; recálculo automático SOLO en `draft`.
- `accepted_at timestamptz NULL` ahora; `due_date`/pagos diferidos a Fase 3.
- `unit_price` es un valor independiente por ítem (el catálogo `services` no tiene
  precio, solo `name` + `duration_minutes`); `service_id` es referencia descriptiva
  opcional.
- Número de migración: `0015`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/0015_treatment_plans.sql` | New | Tablas `treatment_plans` y `treatment_plan_items`, enums de estado, índices, RLS. |
| `supabase/migrations/down/0015_treatment_plans.down.sql` | New | Reversión ordenada de índices, tablas y tipos. |
| `src/lib/admin/types.ts` | Modified | Tipos `TreatmentPlan`, `TreatmentPlanItem`, `TreatmentPlanInput`, `TreatmentPlanItemInput`. |
| `src/lib/admin/validate.ts` | Modified | Validadores de cantidad, precio, estado del plan/ítem y notación FDI. |
| `src/lib/admin/treatment-plans.ts` | New | List/get/create/update/delete de planes e ítems + recálculo de `total_amount` en `draft`. |
| `src/lib/admin/__tests__/treatment-plans.test.ts` | New | Pruebas unitarias con mocks de `getSupabaseAdmin`. |
| `app/api/admin/patients/[id]/treatment-plans/route.ts` | New | `GET` (list) y `POST` (create). |
| `app/api/admin/patients/[id]/treatment-plans/[planId]/route.ts` | New | `GET`, `PATCH`, `DELETE`. |
| `app/api/admin/patients/[id]/treatment-plans/[planId]/items/route.ts` | New | CRUD de ítems (o manejo inline según diseño). |
| `app/(admin)/patients/[id]/page.tsx` | Modified | Carga planes y propaga estado/errores a las pestañas. |
| `src/components/admin/patient-record/PatientRecordTabs.tsx` | Modified | Agrega pestaña `plans` con etiqueta "Plan de tratamiento". |
| `src/components/admin/patient-record/TreatmentPlansTab.tsx` | New | Componente de pestaña. |
| `src/components/admin/patient-record/TreatmentPlanForm.tsx` | New | Formulario de cabecera e ítems. |
| `openspec/changes/treatment-plans/specs/treatment-plans/spec.md` | New | Delta spec `treatment-plans` (fase de specs). |
| `openspec/changes/treatment-plans/specs/patient-record-summary/spec.md` | New | Delta spec `patient-record-summary` (pestaña nueva). |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Mutar ítems después de la aceptación altera el acuerdo económico si no se bloquea en la capa de negocio. | Med | Recálculo solo en `draft`; en estados posteriores la capa rechaza cambios de ítems que alteren el total (requiere volver a `draft` o nueva versión). |
| El catálogo `services` no tiene precio, por lo que no se puede prellenar `unit_price`. | Med | `unit_price` se captura por ítem; validar numérico no negativo; `service_id` solo referencia descriptiva. |
| La notación FDI (`tooth`) es texto libre; riesgo de datos inconsistentes. | Med | Validar formato FDI o permitir null cuando no aplica. |
| Agregar `due_date`/campos de pago prematuramente genera migraciones confusas. | Low | Solo `accepted_at` ahora; pagos diferidos a Fase 3. |
| Atomicidad: enviar plan+ítems en una petición vs. ítems por separado afecta consistencia/UX. | Med | Resolver en diseño; recomendar plan+ítems en una sola petición para crear, endpoints de ítems para editar. |
| Fuga del `service_role` al cliente o consulta directa de tablas con anon. | Low | Seguir patrón Fase 1: `getSupabaseAdmin()` server-side only, `requireUser()` + `handleAdminRequest()`. |

## Rollback Plan

El cambio es puramente aditivo (tablas y enums nuevos; no altera tablas existentes),
por lo que el rollback es limpio y sin pérdida de datos en tablas previas:

1. **Base de datos**: ejecutar `supabase/migrations/down/0015_treatment_plans.down.sql`
   (elimina índices → `treatment_plan_items` → `treatment_plans` → tipos enum en
   orden inverso de dependencia).
2. **Código**: revertir el commit del cambio (git revert) — elimina rutas API,
   capa de datos `treatment-plans.ts`, componentes `TreatmentPlansTab.tsx` /
   `TreatmentPlanForm.tsx` y los cambios en `PatientRecordTabs.tsx`, `types.ts`,
   `validate.ts` y `page.tsx`.
3. **Specs**: el delta spec `treatment-plans` se descarta; el delta de
   `patient-record-summary` se revierte para restablecer la enumeración de pestañas
   anterior.
4. **Verificación**: tras el rollback, `npm run test`, `npm run typecheck` y
   `npm run build` deben quedar verdes y la pestaña "Planes" desaparece del expediente.

No se requiere rollback de datos porque no se modifican tablas ni columnas existentes.

## Dependencies

- Fase 1 `clinical-record` ya integrada: tablas `patients`, `providers`,
  `clinical_visits` (notas SOAP) existentes con RLS.
- Catálogo `services` (`name`, `duration_minutes`) para la referencia opcional
  `service_id`.
- Patrón de capa de datos/admin API ya establecido (`src/lib/admin/*`,
  `app/api/admin/*`).
- Sin dependencias externas nuevas.

## Success Criteria

- [ ] Migración idempotente `0015` con `down` y RLS activa (`REVOKE ALL ... FROM anon`).
- [ ] CRUD autenticado de planes e ítems (401 sin sesión; rutas server-side).
- [ ] `total_amount` consistente al agregar/editar/eliminar ítems mientras el plan
      está en `draft`; snapshot inmutable en estados posteriores.
- [ ] `accepted_at` se llena en la transición a `accepted`.
- [ ] `npm run test`, `npm run typecheck` y `npm run build` en verde.
- [ ] Delta spec nueva `treatment-plans` y delta `patient-record-summary` (pestaña).
