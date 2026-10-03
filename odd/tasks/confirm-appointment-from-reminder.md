# Feature: Confirmación de cita en un toque desde el recordatorio (issue #87)

## Contexto

- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/87
- Worktree aislado: `.worktrees/medica-app/feat-citas-confirmaci-n-de-cita-en-un-toque-desd`
- Rama: `eliumontoya/feat-citas-confirmaci-n-de-cita-en-un-toque-desd`
- Alcance decidido por el usuario: **Fases 1 + 2 + 3 completas** (confirmación simple, cancelación desde recordatorio, coexistencia con flow engine).
- Ciclo SDD completo (skill sdd-completo-issue) con fallback de subagentes: sdd-{phase} no existen → gentle-ai-explore / gentle-ai-worker / gentle-ai-verify.

## Tareas

1. [ ] SDD Explore — mapear webhook, orquestador, flow engine, recordatorios
2. [x] SDD Propose — propuesta en `openspec/changes/confirm-appointment-from-reminder/`
3. [x] SDD Spec — specs RFC 2119 + Given/When/Then
4. [x] SDD Design — decisiones técnicas con rutas concretas
5. [x] SDD Tasks — plan con forecast
6. [ ] SDD Apply — implementación TDD
7. [ ] SDD Verify — tests + typecheck + build
8. [ ] SDD Archive
9. [ ] Commit, push y PR (cierra #87)

## Evidencia

- SDD Spec: 3 archivos de delta en `openspec/changes/confirm-appointment-from-reminder/specs/` (nueva capacidad `appointment-reminder-reply`; modificadas `flow-engine` y `whatsapp-inbound-automation`), todos los requisitos con escenarios Given/When/Then.
- SDD Design: `openspec/changes/confirm-appointment-from-reminder/design.md` con 10 decisiones técnicas, rutas concretas, contratos de funciones, query de elegibilidad, formato de `notes`, flag `WHATSAPP_REMINDER_REPLY_ENABLED` y plan de pruebas mapeado a escenarios.
- SDD Tasks: `openspec/changes/confirm-appointment-from-reminder/tasks.md` con 31 checkboxes en 6 fases de verificación, TDD estricto (cada implementación precedida por su RED), matriz de cobertura de los 14 requisitos y Workload Forecast (≥400 líneas: `Decision needed before apply: Yes`).
- SDD Apply (parte A, Fases 1–2, TDD estricto): creados `src/lib/citas/reminder-reply.ts` (clasificación pura + elegibilidad/rastro), `src/lib/citas/reminder-reply-messages.ts` (plantillas deterministas es-MX con fecha/hora reales) y `src/lib/citas/appointment-status.ts` (transición guardada status-only con rastro en `appointments.notes`). Tests nuevos: `src/lib/citas/__tests__/reminder-reply.test.ts` (36), `src/lib/citas/__tests__/reminder-reply-messages.test.ts` (7), `src/lib/citas/__tests__/appointment-status.test.ts` (8) y `src/lib/citas/__tests__/reminder-reply-service.test.ts` (13): **64/64 en verde**. RED observado por tarea (módulo/función inexistente) y GREEN tras implementar; verificaciones `npm run test -- <archivo>` por cada tarea. Checkboxes 1.1–1.5 y 2.1–2.7 marcados `[x]`.
- SDD Apply (parte B, R10 + Fase 3 parcial, TDD estricto): **R10** — arreglada la cancelación repetida sobre cita ya `cancelled` en `src/lib/citas/reminder-reply-service.ts`: para intenciones de cancelación la query de elegibilidad añade `cancelled` y, sin candidato elegible, se reconoce la cita ya cancelada dentro de la ventana + teléfono (helper local `isWithinReminderWindowAndPhone`) y se devuelve un no-op manejado (`outcome: 'already'`, `needsHuman: false`) **sin** transición ni escalación nueva; enmienda documentada en `design.md` §3/§7. RED→GREEN en `src/lib/citas/__tests__/reminder-reply-service.test.ts` (13→17 pruebas: 2 fallando antes del fix). **Fase 3 3.3–3.4** — exportados `FLOW_TIMEOUT_MINUTES`, `isFlowExpired(flowState, now = new Date())` y `isFlowSessionActive(flowState, now)` desde `src/lib/whatsapp/orchestrator.ts`; RED→GREEN en `src/lib/whatsapp/__tests__/orchestrator-flow-session.test.ts` (8/8). Regresión: `npm run test --` sobre las 6 suites de citas/whatsapp tocadas → **77/77 en verde**. **Bloqueos reportados al padre:** (1) `src/lib/citas/reminder-reply-flag.ts` y su prueba (tareas 3.1/3.2 y design §8) no están en las superficies de edición autorizadas de esta parte → pendiente de autorización; (2) `.env.local.example` (tarea 5.1) bloqueado por la política de seguridad del harness (ruta sensible). Checkboxes 3.3–3.4 marcados `[x]`; 3.1–3.2 y 3.5–3.7 sin ejecutar.
- SDD Apply (parte B2, Fase 3 restante 3.1/3.2/3.5/3.6/3.7, TDD estricto): **3.1/3.2** creados `src/lib/citas/reminder-reply-flag.ts` (`isReminderReplyEnabled(rawValue?)`; única lectura de `WHATSAPP_REMINDER_REPLY_ENABLED`, `true|1|yes` tras `trim().toLowerCase()`, default off) y `src/lib/citas/__tests__/reminder-reply-flag.test.ts` (5/5); RED observado = `Cannot find module '@/lib/citas/reminder-reply-flag'`. **3.5/3.6** cableado el pre-chequeo `processReminderReplyHook` en `src/lib/whatsapp/inbound-service.ts::processWhatsAppInboundEvent` después de `loadConversationContext`/`loadConversationHistory` y antes del branch `isFlowEngineEnabled()`, con guardas `isReminderReplyEnabled()` → `messageType === 'text'` → `body` → `!isFlowSessionActive(conversation.flowState ?? null, new Date())`; `handled:true` corto-circuita (acuse `sendAndPersist` + `updateConversationSummary` + `markInboundMessageProcessed` `responded`/`escalated`, sin llamar a `orchestrate`), `handled:false` sigue el pipeline. Test `src/lib/whatsapp/__tests__/inbound-service-reminder-reply.test.ts` (11/11) con orquestador y servicio mockeados; RED observado 5 fallando/4 pasando (gancho inexistente). **3.7** triangulación: flag apagado → regresión al pipeline normal; sesión activa gana (aceptación #87 «coexistencia con flow engine activo»); sesión `complete`/expirada no bloquea; mensaje no-texto no entra; duplicado por ledger no repite transición ni acuse. Verificación exigida: `npm run test -- …5 archivos…` → **42/42 en verde**; suite completa `npm run test` → **938/938 (113 archivos)**; `npx tsc --noEmit` → sin errores. Checkboxes 3.1, 3.2, 3.5, 3.6, 3.7 marcados `[x]`; 5.1 (`.env.local.example`) queda para el padre.
