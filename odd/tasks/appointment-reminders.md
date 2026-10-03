# Feature: appointment-reminders (issue #86)

Recordatorios automáticos de citas por WhatsApp (H-24 y día mismo) + visibilidad operativa.

- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/86
- Alcance confirmado por el usuario: Fases 1 + 2 + 3.
- Ciclo: SDD completo (proposal → spec → design → tasks → apply → verify → archive → PR).
- Worktree: feat-citas-recordatorios-autom-ticos-de-citas-po
- Rama: eliumontoya/feat-citas-recordatorios-autom-ticos-de-citas-po
- Cambio OpenSpec: openspec/changes/appointment-reminders/
- Persistencia: openspec (config.yaml, artifact_store: hybrid) + espejo Engram odd/appointment-reminders/tasks

## Tareas

- [x] Explore: mapear patrón payment-reminders y agenda (gentle-ai-explore) — Ready for Proposal: Yes
- [x] Propose: proposal.md — gate Capabilities OK; nota: orden de bodyParameters de la plantilla se congela contra plantilla aprobada en Meta
- [x] Spec: specs/ por capability — 13 requisitos / 33 escenarios; deltas ADDED (net-new); state.yaml actualizado inline
- [x] Design: design.md — 12 secciones; migración 0018; 2 corridas diarias recomendadas (fallback 1 si plan Hobby); alias GET→POST
- [x] Tasks: tasks.md — 30 tareas, forecast alto; decisiones del usuario: 3 PRs encadenados, lint omitido (follow-up)
- [x] Apply slice 3/3: data layer + panel + tab Citas — 846 tests suite completa, tsc limpio — commit 3bbccdd
- [x] Apply: fases 1-3 completadas (3 commits)
- [~] Verify: test + typecheck + build (lint omitido por decisión)
- [ ] Archive: mover cambio a archive, commit, push, PR (Closes #86)

## Evidencia de commits

(registrar por tarea)

## Decisiones

- Decisión de fecha/hora (comentario en issue): todo instante persistido es `timestamptz`, presentación en `America/Mexico_City` (src/lib/admin/clinic-time.ts).
- Plantilla HSM `recordatorio_cita` requiere aprobación en Meta Business (dependencia externa).
- Fuera de alcance: interpretación de respuestas del paciente (#87), cambios a Eva conversacional.
