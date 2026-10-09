# Feature: ux-truncar-notas-evolucion

Issue #182 — Truncar textos largos en notas de evolución con botón "Ver más".
Change OpenSpec: `openspec/changes/ux-truncar-notas-evolucion/`
Branch: `eliumontoya/ux-truncar-textos-largos-en-notas-de-evoluci-n-c` (worktree aislado, ya creado)

## Tasks

- [x] 0. Artefactos OpenSpec: proposal, delta spec (clinical-record), design, tasks
- [x] 1. TDD: ExpandableText (RED test → GREEN implementación) — delegado a gentle-ai-worker
- [x] 2. Integración en PatientVisitsTab (5 campos, Subjetivo sin tocar) — delegado
- [x] 3. Verificación: tsc, lint, test, build — delegado a gentle-ai-verify
- [x] 4. Work-unit commits convencionales
- [x] 5. Archive OpenSpec + merge delta en specs/clinical-record

## Evidence

- `537f689` feat(admin): truncate long SOAP note texts with ExpandableText (Closes #182)
- `dd512b3` docs(openspec): record ux-truncar-notas-evolucion SDD artifacts and verification
- Native review: lineage `review-3abdcebea04396e0`, lente review-reliability, estado **approved**, autoridad consumida (`burned`); 4 hallazgos informativos no bloqueantes
- Verificación: tsc, lint, `npm test` (1810 passed), `npm run build` — PASS

- PR: https://github.com/proyecto-polaris-ia/medica-app/pull/215
