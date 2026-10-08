# Feature: agregar-campo-requiere-factura (issue #184)

**Issue:** https://github.com/proyecto-polaris-ia/medica-app/issues/184
**Branch:** `eliumontoya/agregar-campo-requiere-factura-al-registrar-pago` (worktree del mismo nombre)
**Creado:** 2026-10-05

## Alcance

Checkbox opcional "Requiere factura" en el formulario de registro de pagos del
expediente del paciente. Default desmarcado, persiste `requires_invoice`
(boolean, default false) en `payments`, se muestra en el historial con badge
amarillo, se resetea tras registrar un pago exitoso. Create-only: la marca no es
editable vía PATCH. Fuera de alcance: filtro de historial e integración con
sistema de facturación externo.

## Tareas

1. [x] Explorar código actual (formulario de pagos, API, esquema, tipos, tests).
2. [x] Redactar change OpenSpec (proposal, specs, design, tasks) — capacidades `admin-panel` + `payments`.
3. [x] Apply: migración 0024 (+down), tipos, servicio, API POST/GET, formulario, historial, estado. Test-first RED/GREEN por fase.
4. [x] Verify: `gentle-ai-verify` independiente → **PASS** (`test:local` 1732 tests, `test` 1474 passed/258 skipped, `tsc --noEmit` limpio, `lint` 0 errores/25 warnings preexistentes). 6/6 criterios de aceptación.
5. [x] Archive change + commits de unidad de trabajo.
6. [ ] Crear PR (decisión del usuario).

## Evidencia (commits)

- `ec113bb` — docs(openspec): specify requires-invoice payment field change
- `0fe54b7` — feat(payments): persist requires_invoice flag on payment records
- `f4ed24b` — feat(admin): add requires-invoice checkbox and history badge to payment form
- `f0df08c` — docs(openspec): mark requires-invoice tasks complete
- Archive + promoción de deltas a `openspec/specs/{payments,admin-panel}/spec.md`
  (escenarios preexistentes restaurados tras detectar sustitución incompleta del
  delta MODIFIED).

## Notas

- Revisión nativa (RDD): START regresó consent `declined_this_candidate` sin
  crear linaje; el usuario decidió continuar sin revisión nativa, apoyado en el
  PASS del verificador independiente.
- Flake ambiental conocido: `nora/apply.local.test.ts` hook timeout por
  contención de advisory lock; re-run tras `db reset` pasa (no es regresión).
