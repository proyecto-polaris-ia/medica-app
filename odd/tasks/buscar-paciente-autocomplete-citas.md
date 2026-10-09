# Feature: buscar-paciente-autocomplete-citas (issue #169)

Reemplazar el `<select>` de paciente en la lista de citas `/appointments`
por búsqueda con autocomplete progresivo (`GET /api/admin/patients?q=`),
mediante componente reutilizable `<PatientSearchInput>`.

- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/169
- PR: https://github.com/proyecto-polaris-ia/medica-app/pull/210
- Worktree: `.worktrees/medica-app/cambiar-filtro-de-paciente-en-lista-de-citas-de`
- Branch: `eliumontoya/cambiar-filtro-de-paciente-en-lista-de-citas-de`
- Persistencia SDD: openspec → archive `2026-10-08-buscar-paciente-autocomplete-citas/`

## Tasks

- [x] T1: Exploración (gentle-ai-explore) — página, endpoint, convenciones.
- [x] T2: Artefactos OpenSpec (proposal/spec/design/tasks) — 7 reqs, 24 escenarios, D1–D20.
- [x] T3: Implementación test-first de `PatientSearchInput` + integración.
- [x] T4: Verificación — vitest 1669/0 fallos, tsc OK, lint 0 errores, build OK.
- [x] T5: Archive + commit + push + PR #210 (Closes #169).

## Evidencia

- RED: componente `Failed to resolve import ../PatientSearchInput`; página 8 failed | 61 passed.
- GREEN: componente 23 passed (28 con bordes 2.8); página 69 → 72 (triangulate 3.7).
- Commits: `12e9f3e` componente, `8ee4b2c` integración, `f18f2d1` artefactos, `e66ccce` archive + baseline spec `admin-appointments`.
- Review RDD: declinada por el usuario en el sobre de consentimiento (scoped al candidato); entrega por política ordinaria.
- Notas: `ilike` no ignora acentos (limitación conocida); techo 20 sugerencias; unificación futura con `src/components/booking/PatientSearch.tsx` (#167).
