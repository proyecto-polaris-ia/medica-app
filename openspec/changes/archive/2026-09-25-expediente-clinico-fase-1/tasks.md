# Tareas: Expediente Clínico Fase 1

**TDD:** RED → GREEN → REFACTOR. No modificar `travelhub-app`. `assessment` = texto libre (backend solo persiste).

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas estimadas | ~1 100 (migración, tipos, servicios, rutas, UI, tests) |
| Riesgo 400 líneas | High |
| PRs encadenados | Yes |
| Estrategia | auto-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unidad | Objetivo | PR | Prueba enfocada | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Migración + tipos + servicios | PR 1 | `npm run test -- src/lib/admin/__tests__/{medical-history,clinical-visits}.test.ts` | N/A: service-role mockeado | `0013_*`, `types.ts`, `validate.ts`, `patients.ts`, `medical-history.ts`, `clinical-visits.ts` |
| 2 | Rutas API | PR 2 | `npm run test -- app/api/admin/patients/[id]/{medical-history,clinical-visits}/` | N/A: auth mockeado | rutas clinical record + PATCH `[id]/route.ts` |
| 3 | UI tabs + badge | PR 3 | `npm run test -- app/(admin)/patients/[id]/` | N/A: React mocks | `page.tsx` + tabs + badge |

## Phase 1: Foundation (migración + tipos + validadores)

- [x] 1.1 **RED:** `src/lib/admin/__tests__/validate.test.ts` — `parseDate`, `parseSex` (`male|female|other`), `parseStringArray`, `parseStatus`.
- [x] 1.2 **GREEN:** `supabase/migrations/0013_clinical_record.sql` (ficha en `patients`, `patient_medical_history` 1:1, `clinical_visits` SOAP, CHECKs, índices, RLS + `REVOKE ALL FROM anon`) y `down/0013_clinical_record.down.sql`.
- [x] 1.3 **GREEN:** extender `src/lib/admin/types.ts` (`Patient` ficha, `MedicalHistory`, `ClinicalVisit`); validadores en `src/lib/admin/validate.ts`; ampliar `SELECT_COLUMNS`, `mapRow`, `validatePatientInput` en `src/lib/admin/patients.ts`.
- [x] 1.4 **REFACTOR:** verificar `npx tsc --noEmit`.

## Phase 2: Core (servicios)

- [x] 2.1 **RED:** crear `src/lib/admin/__tests__/medical-history.test.ts` — retrieve existente, retrieve sin historia (valores vacíos), UPSERT reemplaza.
- [x] 2.2 **GREEN:** crear `src/lib/admin/medical-history.ts` con `getMedicalHistory` y `upsertMedicalHistory` (UPSERT `patient_id` UNIQUE).
- [x] 2.3 **RED:** crear `src/lib/admin/__tests__/clinical-visits.test.ts` — crear nota, listar descendente, normalizar SOAP vacíos → NULL, update, delete, 404.
- [x] 2.4 **GREEN:** crear `src/lib/admin/clinical-visits.ts` con `list/get/create/update/deleteClinicalVisit`; `subjective` NOT NULL.
- [x] 2.5 **REFACTOR:** verificar `npm run test` y `npx tsc --noEmit`.

## Phase 3: Integration (rutas API)

- [x] 3.1 **RED:** crear `app/api/admin/patients/[id]/medical-history/route.test.ts` — 401, GET existente, GET sin historia, PUT reemplaza.
- [x] 3.2 **GREEN:** crear `app/api/admin/patients/[id]/medical-history/route.ts` (GET/PUT con `requireUser` + `handleAdminRequest`).
- [x] 3.3 **RED:** pruebas para `clinical-visits/route.ts` (GET descendente, POST, 401) y `[visitId]/route.ts` (GET, PATCH, DELETE, 404).
- [x] 3.4 **GREEN:** crear `app/api/admin/patients/[id]/clinical-visits/route.ts` (GET/POST) y `.../[visitId]/route.ts` (GET/PATCH/DELETE).
- [x] 3.5 **RED:** ampliar `app/api/admin/patients/[id]/route.test.ts` — PATCH ficha, 400 sex inválido.
- [x] 3.6 **GREEN:** extender PATCH en `app/api/admin/patients/[id]/route.ts`.
- [x] 3.7 **REFACTOR:** verificar `npm run test`.

## Phase 4: UI (tabs + badge)

- [x] 4.1 **RED:** render test de `app/(admin)/patients/[id]/page.tsx` — tabs Datos/Historia/Consultas/Citas; badge rojo con alergias/condiciones; placeholders en campos vacíos.
- [x] 4.2 **GREEN:** modificar `page.tsx` con tabs; crear componentes (Datos editable, Historia GET/PUT, Consultas CRUD, Citas reutiliza `/record`); badge rojo condicional.
- [x] 4.3 **REFACTOR:** verificar `npm run build` y regresión `/record`.

## Phase 5: Cleanup

- [x] 5.1 Ejecutar `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [x] 5.2 Confirmar migración aplica y revierte (`supabase db reset`).
