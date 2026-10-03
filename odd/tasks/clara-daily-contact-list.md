# Feature: clara-daily-contact-list (issue #89)

Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/89
Worktree: /Volumes/Data Coding/Desarrollo/AI-workspace/medica-app/.worktrees/medica-app/feat-clara-lista-diaria-de-pacientes-a-contactar
Base branch: main (b717371)

## Decisiones

- Alcance: Fases 1+2+3 completas (decisión del usuario 2026-10-03).
- Entrega: PRs apilados por fase (decisión del usuario 2026-10-03), patrón del issue #87.
- Cambio OpenSpec: `clara-daily-contact-list`.
- Convención fecha/hora (issue #89, comentario del dueño): todo instante nuevo persiste como
  `timestamptz`, presentación en `America/Mexico_City` (`src/lib/admin/clinic-time.ts`).
  Aplica a `contacted_at` y cualquier instante persistido.

## Tareas

- [x] Explore: mapear datos, RLS y rutas para Clara — Ready for Proposal: Yes. RLS: sin roles secretaria/doctor; patrón 0018 (enable+force+revoke+policy admin_all). No existe tabla de drafts ni settings; migración nueva será 0019. "presented hace N días" usa updated_at del plan.
- [x] Propose: proposal.md con capacidades — openspec/changes/clara-daily-contact-list/proposal.md (161 líneas, capability nueva follow-up, sin modificadas)
- [x] Spec: specs por capacidad — specs/follow-up/spec.md: 16 requirements, 48 escenarios. Decisiones: canceladas posteriores no excluyen al no-show; plan in_progress sin visitas usa created_at; presupuestos usan updated_at; ronda = día calendario America/Mexico_City.
- [x] Design: design.md con archivos concretos — 728 líneas, 11 decisiones. Migraciones 0019 (follow_up_contacts, ronda por round_date+UNIQUE) y 0020 (follow_up_message_drafts); aprobación en WCC (whatsapp-command-center/follow-up-drafts); inactivo normalizado a 180 días con constante semántica 6 meses.
- [x] Tasks: tasks.md con forecast — 49 tareas (F1:17, F2:11, F3:15, F4:6), 16/16 requirements trazados, forecast High ~2650-3000 líneas. Lint no existe en el repo (verificación = test + tsc + build). Prerrequisito operativo: plantilla HSM seguimiento_paciente en Meta antes de release Fase 3.
- [ ] Apply Fase 1: reglas de segmentación (TDD) — PR apilado 1
- [ ] Apply Fase 2: página del panel con acciones (TDD) — PR apilado 2
- [ ] Apply Fase 3: borradores de mensaje con aprobación humana (TDD) — PR apilado 3
- [ ] Verify: verificación técnica
- [ ] Archive: sincronizar specs y archivar change
- [ ] PRs apilados: push + crear 3 PRs (el último con `Closes #89`)

## Evidencia

(commits de work-unit por tarea se registran aquí)
