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
- [x] Apply Fase 1: reglas de segmentación (TDD) — 15 tareas implementadas, 1.13/1.14 SUPERADAS (clinicDayKey ya existe en timezone.ts, decisión C); 41 tests de follow-up verdes, 232 de admin, tsc limpio. Commit: ver evidencia abajo.
- [x] Apply Fase 2: página del panel con acciones (TDD) — commit 856af04: 20 archivos, +1007 líneas; 127 tests verdes, tsc limpio. Desviaciones documentadas: orden 2.9/2.10 antes de 2.4/2.5 (404 depende de getPatient) y test de preselección en ConfirmStep.test.tsx (jsdom).
- [x] Apply Fase 3: borradores de mensaje con aprobación humana (TDD) — commit d2bea90 (24 archivos, +2811 líneas) + corrección 007d806 (60 líneas, claim atómico approved→sending contra R3-race-double-send CRITICAL). 3 desviaciones documentadas (insertFollowUpOutboundMessage fuera de store.ts, guardrails Unicode, createWccClient).
- [x] Verify: verificación técnica — PASS WITH WARNINGS: 1101 tests / 127 archivos, `npx tsc --noEmit` exit 0, `npm run build` exit 0 (rutas `/follow-up` y `/whatsapp-command-center/follow-up-drafts`), migraciones `0019`/`0020` con patrón `0018`, guardrails sin cron/`vercel.json` limpio; warnings no bloqueantes en `verify-report.md` (commit 5cb1d20).
- [x] Archive: sincronizar specs y archivar change — spec materializada en `openspec/specs/follow-up/spec.md` (16 requirements / 48 escenarios, solo se quitó el envoltorio `## ADDED Requirements`); change movido a `openspec/changes/archive/2026-10-03-clara-daily-contact-list/` con `verify-report.md` y `archive-report.md`. Commit b8999fa.
- [x] PRs apilados: push + crear 3 PRs — #106 (fase 1 → main), #108 (fase 2 → rama 1), #109 (fase 3 → rama 2, `Closes #89`); labels `type:feature`. Merge en orden 106→108→109.

## Evidencia

(commits de work-unit por tarea se registran aquí)

- a9140fb docs(openspec): ciclo SDD del change (proposal, spec, design, tasks)
- 7536996 feat(follow-up): reglas de segmentación y capa de datos (fase 1)
- 7329035 docs(odd): cierre de fase 1 en el task file
- Review RDD Fase 1: linaje review-35ad35ead838a7c3 → APROBADO y acknowledgement quemado. Hallazgos informativos: R3-failure-paths-untested, R3-lexicographic-time, R3-redundant-round-filter, R3-tasks-completion-contradiction, R3-unbounded-appointments-read, R3-upsert-overwrite.
- Review RDD Fase 2 (delta vs 7329035; el candidato acumulado excedió lens_context_budget_exceeded → se redujo el alcance): linaje review-c89df4978889e20b → APROBADO y acknowledgement quemado. Hallazgos informativos: R3-catch-all-patient-preselect, R3-no-submit-inflight-guard, R3-note-unbounded, R3-silent-contact-post-failure.
- Review RDD Fase 3 (delta vs 4030f58): linaje review-385006c7ce061f94 → correction_required (R3-race-double-send CRITICAL) → corrección 007d806 (claim atómico, 60 diff lines) → validador dirigido APROBADO → acknowledgement quemado. Hallazgos informativos: R3-draft-actions-error-blind, R3-name-param-guardrail-gap, R3-send-mark-gap, R3-submit-draft-silent-failure, R3-wcc-catch-all-degradation.
- Follow-up adicional: FollowUpDraftStatus (types.ts) no incluye 'sending' ( casteo en mapFollowUpDraftRow); comentario de cabecera de migración 0020 sin actualizar; carrera residual de doble POST si dos peticiones pasan el claim simultáneo (Meta no dedupe).
