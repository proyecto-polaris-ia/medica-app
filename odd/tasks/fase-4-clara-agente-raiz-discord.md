# Fase 4: Clara como agente raíz + canal Discord

Issue: #161 | Change: `fase-4-clara-agente-raiz-discord` | Branch: `fase-4-crear-clara-como-agente-ra-z-canal-discor`

Flujo SDD: explore → propose → spec → design → tasks → apply → verify → archive → PR

## Tareas

- [x] Explore: exploración delegada completada (reporte en openspec/changes/fase-4-clara-agente-raiz-discord/exploration.md)
- [ ] Propose: proposal.md
- [ ] Spec: specs por capability
- [ ] Design: design.md
- [ ] Tasks: tasks.md + forecast de carga
- [ ] Apply: implementación (delegada a worker)
- [ ] Verify: tests + typecheck + lint + build + eve build/info
- [ ] Archive: mover change a openspec/changes/archive/
- [ ] PR: push + pull request (con confirmación del usuario)

## Notas

- Worktree aislado ya creado; node_modules instalándose.
- Decisiones de proposal pendientes: tools de escritura (mark/dismiss) como acciones deterministas con auth fail-closed; allowlist CLARA_DISCORD_*; env vars del servicio eve-clara.
