# Feature: mejorar-metrica-de-deadcode

**Issue**: proyecto-polaris-ia/medica-app#130
**Branch**: `chore/mejorar-metrica-de-deadcode` (worktree `mejorar-metrica-de-deadcode`)
**Modo SDD**: openspec; change archivado en `openspec/changes/archive/2026-10-05-mejorar-metrica-de-deadcode/`

## Resultado

Métrica de deadcode (Knip 6.39.0): **105 → 0 issues**. Verificación PASS WITH
WARNINGS (fallo preexistente ambiental en storage-api/PG17, no atribuible; ver
verify-report.md §6.4 del change archivado).

## Tareas

- [x] Fase 1 — Explore: clasificación de 105 issues (gentle-ai-explore)
- [x] Fase 2 — Propose: proposal.md — commit 1a475c0
- [x] Fase 3 — Spec: specs/code-quality/spec.md (6 req, 17 escenarios) — f0e8bb2
- [x] Fase 4 — Design: design.md (D1–D7) — a326399
- [x] Enmienda spec/proposal (ignoreBinaries, chat dos capas) — eaf49dc
- [x] Fase 5 — Tasks: tasks.md (20 tareas) — 75a9917
- [x] Fase 6 — Apply A: knip.json — 2519116; deps — ad82548; archivos — 22c3d0c; docs — da3ff65
- [x] Fase 6 — Apply B: exports/tipos (105→0) — f199e5c, bc4a400, 00d16a5; docs — 0b4f716
- [x] Fase 6 — Apply C: script knip + CI — 99038a8; docs — b990e8a
- [x] Fase 7 — Verify: verify-report.md PASS WITH WARNINGS — 6596127
- [x] Fase 8 — Archive: spec principal — feaf91b; archive — 50e29bc

## Pendientes / seguimiento

- Fallo preexistente `test:local` (patient-files, storage 42P10 en PG17.11 +
  storage-api 1.71.0): candidato a issue de GitHub, decisión del usuario.
- Push + PR (Closes #130) en curso al cierre de este documento.
