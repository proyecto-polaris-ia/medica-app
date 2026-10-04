# Feature: eve-reminder-reply — Detección estructurada de respuestas a recordatorios en Eve

Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/114
Decisión: **Opción A** — reintegrar el pipeline huérfano de reminder-reply como
herramienta dedicada de Eve (decisión del usuario, sesión actual).

## Rationale (Opción A vs B)

- `reminder-reply-service.ts` ya fue diseñado para Eve: usa `eve-escalation`,
  nunca envía WhatsApps; la clasificación y el envío los maneja el agente.
- Los guardrails de dominio (ambigüedad clínica → escalación, no diagnosticar)
  ya viven de forma determinista en `CLINICAL_AMBIGUITY`.
- La spec activa `appointment-reminder-reply` describe exactamente este
  comportamiento (ventana 36 h, transición acotada, rastro auditable);
  archivarla (Opción B) tiraría un requisito aprobado.
- Eve hoy responde conversacionalmente pero no tiene detección estructurada de
  `CONFIRMO`/`CANCELO` con transición de estado garantizada.

## Alcance

- OpenSpec change: `openspec/changes/eve-reminder-reply-tool/`
- Nuevo tool: `agent/tools/handle-reminder-reply.ts` (patrón `escalate-to-human`).
- Instrucciones: regla de precedencia en `agent/instructions.md`.
- Tests: `tests/agent/tools/handle-reminder-reply.test.ts`.
- Flag: se conserva `WHATSAPP_REMINDER_REPLY_ENABLED` como kill switch de rollout
  (lectura movida al tool; default off).

## Tareas

- [x] Cambio OpenSpec completo (proposal, spec delta, design, tasks, state.yaml).
- [x] Tool `handle-reminder-reply` con contrato `{ success, handled, outcome, responseText, needsHuman }`.
- [x] Instrucciones de Eve: precedencia del tool sobre respuesta conversacional/otras tools.
- [x] Tests del tool (mock del servicio; teléfono no confiable; flag off; error de I/O) — 7 tests, RED→GREEN.
- [x] Suites existentes de reminder-reply en verde (90/90 con la suite nueva; typecheck y lint limpios).
- [ ] verify-report del change OpenSpec.

## Evidencia de commits

- `c733d97` feat(eve): expose deterministic reminder-reply handling as agent tool (código + tests + spec delta).
- `ee8e1bc` docs(openspec): add verify-report for eve-reminder-reply-tool.
- `8ce334d` chore(openspec): mark eve-reminder-reply-tool phases complete.

## Cierre

- PR: https://github.com/proyecto-polaris-ia/medica-app/pull/124 (type:feature, Closes #114).
- Comentario de decisión en el issue: https://github.com/proyecto-polaris-ia/medica-app/issues/114#issuecomment-5984341944.
- `test:local`: 8 fallas deterministas pre-existentes en `main` (patient-files, storage 42P10 en commit base `ac224f6`) + timeouts de hooks por contención; ajenas a esta rama.
- Pendiente post-merge: archivar el change OpenSpec a `openspec/changes/archive/`.
- Archivado local: change movido a `openspec/changes/archive/2026-12-eve-reminder-reply-tool/` (state.yaml removido por convención) y delta materializado en `openspec/specs/appointment-reminder-reply/spec.md` (12 → 13 requisitos). Merge de PR #124 verificado: CI en verde incl. `test-local-db` (las fallas locales de patient-files eran ambientales del storage local).
