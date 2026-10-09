# Feature: ensanchar-modal-plan-tratamiento

Issue: [#183](https://github.com/proyecto-polaris-ia/medica-app/issues/183) —
UX: Modal de plan de tratamiento es demasiado estrecho para capturar precios y cantidades.

## Contexto

Worktree aislado: `.worktrees/medica-app/ux-modal-de-plan-de-tratamiento-es-demasiado-est`,
branch `eliumontoya/ux-modal-de-plan-de-tratamiento-es-demasiado-est` (ya creada).

Ciclo SDD/OpenSpec: proposal → spec → design → tasks → apply → verify → archive.

## Tareas

- [x] 1. Exploración completada (gentle-ai-explore, task mv0c3msr-1-9qvg):
  - `FormModal.tsx:16` — `max-w-lg` hardcodeado, sin prop `size`/`className`.
  - 7 call sites en 6 archivos → default `max-w-lg` = backward compatible.
  - `TreatmentPlanForm.tsx:460` tabla `min-w-full` en `overflow-x-auto`; inputs: Diente `w-16` (L492), Cantidad `w-16` (L503), Precio `w-24` (L515).
  - Test existente: `TreatmentPlanForm.test.tsx` (Vitest jsdom + Testing Library).
  - Precedentes: `PatientRecordModal.tsx:44` usa `max-w-4xl`; `TreatmentPlanDetailModal.tsx:121` usa `max-w-2xl`.
- [x] 2. Artefactos SDD creados (gentle-ai-worker, task mv0c9kxy-2-grtg) en
      `openspec/changes/ensanchar-modal-plan-tratamiento/`: proposal, spec delta
      ADDED (capability nueva `admin-ui-modals`, 5 requirements con escenarios),
      design (D1–D6) y tasks por fases. Nota: contenedor real está en
      `FormModal.tsx:20` (no :16).
- [x] 3. Implementación con TDD (gentle-ai-worker, task mv0cgcj1-3-ihax):
  - RED observado: `FormModal.test.tsx` 3 failed/2 passed → GREEN 5 passed.
  - `FormModal.tsx`: prop `size` con mapa typed, default `'md'`.
  - `TreatmentPlanForm.tsx`: `size="xl"`, cantidad `w-24 text-right`, precio
    `w-40 text-right inputMode="decimal"`, Diente intacto.
  - `tsc --noEmit` exit 0; `lint` exit 0 (warnings preexistentes); suite del
    plan 7/7 passed.
- [x] 4. Verificación PASS (gentle-ai-verify, task mv0ckbx0-4-m23x): `npm test`
      1789/1789, `build` exit 0, `tsc` exit 0, `lint` 0 errores, backward
      compat confirmada (6 call sites sin cambios). Reporte:
      `verify-report.md` en el change.
- [x] 5. Archive + commits: change archivado en
      `openspec/changes/archive/2026-10-08-ensanchar-modal-plan-tratamiento/`.
      Commits: `9fde8c6` feat(admin-ui) y `29b7d19` docs(openspec).
- [ ] 6. Push + PR (pendiente de decisión del usuario).

## Evidencia

- (por completar)
