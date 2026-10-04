# Feature: eve-stage-7-remove-legacy (issue #37)

Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/37
Worktree: eve-migration-stage-7-remove-legacy-whatsapp-age
Rama: eliumontoya/eve-migration-stage-7-remove-legacy-whatsapp-age
Base para PR: main (decisión del usuario 2026-11; el issue decía feat/eve-migration pero quedó obsoleto — el historial reciente mergea directo a main)
Cambio OpenSpec: (por crear) 2026-11-eve-stage-7-remove-legacy
Persistencia: este archivo + espejo Engram odd/eve-stage-7-remove-legacy/tasks

## Decisiones del usuario (2026-11)

1. **Webhook**: `app/api/whatsapp/webhook/route.ts` se reescribe como forwarder delgado a
   `/eve/v1/whatsapp` (siempre reenvía tras verificar firma). Sin rama legacy, sin fallback,
   sin `WHATSAPP_EVE_ENABLED` en código. La URL de Meta no cambia; `vercel env rm` es acción
   del operador (documentar en runbook).
2. **Conservar lo vivo**: no borrar nada con importadores activos. KEEP: `flows/` core
   (flow-engine, flow-control, registry, types, definitions — chat web), `ai/whatsapp-intent-classifier`
   (chat web), `whatsapp/onboarding-flag.ts` (crons), `observability/whatsapp-ai.ts` (WCC +
   webhook), `observability/debug-logger.ts` (flow-control), `whatsapp/client|normalize|store|signature`
   (eve-escalation, webhook, crons), `whatsapp/eve-escalation.ts` (Eve tools).
3. **DELETE (pipeline WhatsApp legacy real, sin importadores activos)**:
   - `src/lib/whatsapp/orchestrator.ts`, `inbound-service.ts`, `escalation.ts`, `onboarding-context.ts`
   - `src/lib/flows/onboarding-answers.ts`, `onboarding-eligibility.ts`, `onboarding-urgency.ts`
   - `src/lib/ai/whatsapp-inbound-agent.ts` + `whatsapp-llm-provider.ts` (extraer antes el tipo
     compartido `WhatsAppInboundIntent`)
   - `src/lib/whatsapp/eve-flag.ts` + flag del webhook
   - tests legacy-only asociados
4. Nota de riesgo: `reminder-reply-acceptance.test.ts` importa `orchestrator.isFlowSessionActive`
   — refactorizar/stub antes de borrar orchestrator.

## Tareas

- [x] Explore: mapa de dependencias legacy vs vivo (gentle-ai-explore, evidencia path:line) — hecho, ver decisión de scope arriba
- [x] OpenSpec: crear cambio (proposal, spec deltas, design, tasks) según convención del repo — 6 artefactos en openspec/changes/eve-stage-7-remove-legacy/; deltas: eve-framework (4 REMOVED, 2 MODIFIED, 1 ADDED), whatsapp-inbound-automation (8 REMOVED, 1 ADDED), flow-engine (2 REMOVED, 3 MODIFIED, 1 ADDED); correcciones del writer: store.ts también consume WhatsAppInboundAgentDecision (Pick), y fases 3↔6 acopladas para build verde
- [x] Extraer tipo compartido `WhatsAppInboundIntent` a módulo chico; actualizar importers — hecho por writer: src/lib/whatsapp/inbound-decision.ts (7 tipos incl. WhatsAppInboundAgentDecision); importers re-apuntados (store, eve-escalation, intent-classifier); bridge temporal en whatsapp-inbound-agent.ts; tsc 0 / suite verde
- [x] Borrar pipeline legacy WhatsApp: orchestrator, inbound-service, escalation, onboarding-context + tests legacy-only; refactorizar reminder-reply-acceptance.test.ts — hecho por writer: helpers isFlowSessionActive/isFlowExpired reubicados en flows/flow-engine.ts (TDD RED→GREEN); webhook reenvía incondicionalmente a /eve/v1/whatsapp (502 en fallo); 9 archivos borrados; tsc 0 / 1392 tests OK
  - Nota: writer retuvo y re-apuntó orchestrator-flow-session.test.ts (cubre helpers reubicados que se conservan)
  - Hallazgo nuevo: citas/reminder-reply.ts, reminder-reply-service.ts, reminder-reply-flag.ts quedaron huérfanos (su único llamador era inbound-service); decisión del usuario: conservarlos y crear issue de follow-up para evaluar detección estructurada de respuestas vía herramienta Eve — creado: https://github.com/proyecto-polaris-ia/medica-app/issues/114
- [x] Borrar flows/onboarding-answers|eligibility|urgency + sus tests (fase 4) — writer: 3 módulos + 3 tests borrados; grep previo sin importadores vivos; core flows/definitions intactos; tsc 0 / 1339 tests
- [x] Borrar ai/whatsapp-inbound-agent + whatsapp-llm-provider + tests; revisar deps npm (fase 5) — writer: agente + provider + test borrados; web chat consume inbound-decision directo (sin bridge); @ai-sdk/openai removida; `ai` se conserva (peer no-opcional de eve@0.52.2); tsc 0 / 1334 tests / build OK
- [x] Webhook Eve-only: route.ts final, eve-flag.ts borrado, route.test.ts reescrito, .env.local.example limpio (fase 6) — writer: contrato siempre-reenvía con observabilidad estructurada (webhook.accepted/failed + forwardingTarget:'eve'), TDD RED 2 fallas → GREEN 14/14; eve-flag.ts + test borrados (sin importadores); env fuera: WHATSAPP_EVE_ENABLED, WHATSAPP_FLOW_ENGINE_ENABLED, WHATSAPP_AGENT_LLM_API_STYLE (sin lector); tsc 0 / 1339 tests
  - Comentarios huérfanos a eve-flag corregidos inline por el orquestador (reminder-reply-flag, su test, onboarding-flag)
- [x] Docs: 6 documentos actualizados (fase 7) — writer: architecture.md (webhook Eve-only, tipos compartidos, flow engine solo web-chat, sin flags), README (agente Eve + sección Configuración), flow-engine.md (ownership web chat), whatsapp-agent-architecture.md reducido a stub (~50 líneas, describía pipeline borrado), eve-runbook.md reescrito en español (rollback git revert + redeploy, vercel env rm como paso de operador no bloqueante, registros webhook.accepted/failed), migration plan §12 con checklist ejecutado y 8 correcciones al plan original; grep sin referencias accidentales a módulos borrados
  - Nota: runbook estaba en inglés; ahora en español de México (convención del repo)
  - Staleness preexistente fuera de scope, no tocado: booking-agent.ts planeado en architecture.md §2; JSON FlowState ilustrativo en flow-engine.md
- [ ] Verificación final: suite completa + tsc --noEmit + build (gentle-ai-verify)
- [ ] Revisión nativa (gentle_review inspect → ciclo) y cierre

## Evidencia de commits

(registrar por tarea)

## Fuera de alcance

- Migrar chat web al agente Eve (issue futuro; hoy el chat web usa el flow engine vivo).
- Cambios en Meta (URL del webhook no se toca) y `vercel env rm WHATSAPP_EVE_ENABLED` (acción del operador).
- Deploy a producción y monitoreo post-deploy.
