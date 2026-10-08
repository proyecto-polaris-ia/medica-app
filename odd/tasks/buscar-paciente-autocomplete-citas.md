# Feature: buscar-paciente-autocomplete-citas (issue #169)

Reemplazar el `<select>` de paciente en la lista de citas `/appointments`
por búsqueda con autocomplete progresivo (`GET /api/admin/patients?q=`),
mediante componente reutilizable `<PatientSearchInput>`.

- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/169
- Worktree: `.worktrees/medica-app/cambiar-filtro-de-paciente-en-lista-de-citas-de`
- Branch: `eliumontoya/cambiar-filtro-de-paciente-en-lista-de-citas-de`
- Persistencia SDD: openspec → `openspec/changes/buscar-paciente-autocomplete-citas/`

## Tasks

- [ ] T1: Exploración (gentle-ai-explore) — página, endpoint, convenciones.
- [ ] T2: Artefactos OpenSpec (proposal/spec/design/tasks).
- [ ] T3: Implementación test-first de `PatientSearchInput` + integración.
- [ ] T4: Verificación (vitest, tsc, build).
- [ ] T5: Archive + commit + push + PR (Closes #169).

## Evidencia

- (por completar)
