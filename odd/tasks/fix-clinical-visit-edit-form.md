# Feature: fix-clinical-visit-edit-form (Issue #181)

Bug: el formulario de edición de consulta clínica abre vacío en lugar de mostrar
los datos guardados.

## Context
- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/181 (status:approved)
- Worktree: `.worktrees/medica-app/bug-formulario-de-edici-n-de-consulta-cl-nica-ap`
- Branch: `eliumontoya/bug-formulario-de-edici-n-de-consulta-cl-nica-ap`
- Ciclo SDD: `openspec/changes/archive/2026-10-08-fix-clinical-visit-edit-form/`

## Tasks
1. [x] Explorar issue + código (causa raíz: `useState(visitToInput(visit))` de una sola
       vez en componente montado persistentemente por `PatientVisitsTab`)
2. [x] TDD RED: 4 tests de re-render en `ClinicalVisitForm.test.tsx` (fallan sin el fix)
3. [x] TDD GREEN: `useEffect` de resync sobre `[visit]` en `ClinicalVisitForm.tsx`
4. [x] Triangulación: residuos entre aperturas + cambio entre consultas
5. [x] OpenSpec: proposal, design, tasks, delta spec (`clinical-record`)
6. [x] Verify: vitest 7/7, `tsc --noEmit` limpio, lint 0 errors (gentle-ai-verify PASS)
7. [x] Archive: delta promovido a `openspec/specs/clinical-record/spec.md` + verify-report

## Decisiones
- Fix mínimo con `useEffect` (no `key` remount, no formulario no controlado): el padre
  nulifica `editingVisit` en todo cierre, así que `[visit]` cubre todos los ciclos.
- El resync depende de la identidad del objeto `visit`; hoy solo cambia por acción
  explícita del usuario (documentado en design.md).

## Commits
- 6cc0c91 fix(admin): pre-populate clinical visit edit form (#181)
