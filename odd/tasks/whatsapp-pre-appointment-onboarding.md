# Feature: whatsapp-pre-appointment-onboarding (issue #90)

Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/90
Worktree: .worktrees/medica-app/feat-whatsapp-onboarding-pre-cita-datos-generale
Branch: eliumontoya/feat-whatsapp-onboarding-pre-cita-datos-generale
OpenSpec change: whatsapp-pre-appointment-onboarding
Persistence mode: openspec (config.yaml, artifact_store hybrid)

## Alcance decidido por el usuario
- SDD completo + implementación, Fases 1–3 completas.
- Entrega: PRs apilados por fase (patrón establecido en issues #88/#89/#91).
- RDD activo: revisión nativa por slice/fase antes de cada PR.

## Tareas

### Exploración
- [x] gentle-ai-explore: mapa de flow engine, medical-history, resolve-patient, trusted-contact-context, recordatorios, MedicalHistoryBadge, tools de escalación.

## Hallazgos clave de exploración (task musjtwx6-1-ham4)
1. FlowEngine puro (`src/lib/flows/flow-engine.ts`); estado en `whatsapp_conversations.flow_state` (`store.ts:107,196`); persistido por `inbound-service.ts:392-396`. Registry hoy vive dentro de `book-appointment.flow.ts`.
2. `FlowResult.action` es union cerrado (`types.ts:63`) + switch hardcodeado en orchestrator → nueva acción de onboarding requiere types + orchestrator + registry.
3. `patient_medical_history` (migración 0013) no tiene campo de provenance → migración nueva (timestamp snake_case) para marcar autoreporte. `upsertMedicalHistory` es full-replace → escritura única atómica al confirmar encaja.
4. Contacto verificado: `requireTrustedWhatsAppPhone()` (`trusted-contact-context.ts:168-175`) + `selectPatientPhone`; `resolve-patient` devuelve `isNew` y `email` (señales Fases 1–2).
5. Escalación: `escalate-to-human` → `createEveWhatsAppEscalation`; conversación pasa a `status: 'escalated'` (`inbound-service.ts:467-486`); no existe estado "paused" de flow → pausar = limpiar flow_state tras escalar.
6. Recordatorios (#86) ya merged: `src/lib/citas/send-appointment-reminder.ts`; plantilla HSM congelada → nudge como mensaje/plantilla separada; `detectTopicChange` y `flowNames` en `flow-control.ts` hardcodean booking → extender.
7. `MedicalHistoryBadge` es advertencia condicional → badge de onboarding como componente hermano en `PatientRecordTabs.tsx`.
8. `FlowState.entities` solo escalares → listas van en `metadata` o string serializado parseado por el determinista.
9. Tests: flow engine puro sin mocks (`src/lib/flows/__tests__/`); mocks de `getSupabaseAdmin` con vi.mock (`src/lib/admin/__tests__/medical-history.test.ts`); inbound con options inyectadas (`inbound-service-reminder-reply.test.ts`).

### Fases SDD
- [ ] proposal.md (con rollback plan)
- [ ] specs/ (RFC 2119 + Given/When/Then)
- [ ] design.md (rutas concretas, decisiones)
- [ ] tasks.md (forecast, verificación de decisión antes de apply)

### Revisión RDD por fase
- [x] Fase 1: lineage review-4c62be58c351c2de — medium, lente review-reliability, 31 archivos/2869 líneas — **approved**, autoridad quemada (revisión del snapshot code-only del squash 010f84d). 5 hallazgos informativos (R3-clearanswer-contract, R3-escalation-port-unhandled, R3-missing-draft-error-loop, R3-source-unvalidated-cast, R3-summary-restart-data-loss) → registrar como follow-ups.
- [ ] Fase 2: revisión del delta antes de PR 2.
- [ ] Fase 3: revisión del delta antes de PR 3.

### Apply
- [ ] Fase 1: flow onboarding historia clínica básica (paciente nuevo sin medical_history + cita futura) — alergias, medicamentos, condiciones, embarazo, hábitos; resumen + confirmación; escritura atómica; escalación a humano ante urgencia.
- [ ] Fase 2: completado de datos generales (email, contacto faltante) en el mismo flow.
- [ ] Fase 3: nudge en recordatorio de cita + badge onboarding pendiente/completo en panel (extender MedicalHistoryBadge.tsx).

### Verify / Archive / Entrega
- [x] Verify: PASS WITH WARNINGS — 154 archivos/1447 tests, tsc 0, build OK; warnings: sin script lint (ambiental), migraciones revisadas estructuralmente (sin stack local), HSM onboarding_pendiente pendiente en Meta.
- [x] Archive: specs materializadas (whatsapp-onboarding 8 req/18 esc; patient-onboarding-status 4 req/11 esc) + merge de MODIFIED en flow-engine, whatsapp-inbound-automation, clinical-record (escenarios de booking restaurados); change en archive/2026-10-03-whatsapp-pre-appointment-onboarding/.
- [x] Revisión RDD por fase: 3 lineages approved con autoridad quemada (review-4c62be58c351c2de, review-f102564e27a9dbcb, review-c949f9c249ac566c).
- [ ] PRs apilados (P1→main, P2→P1, P3→P2 con Closes #90).

## Guardrails del issue (innegociables)
- No diagnóstico; registrar literal, sin interpretar ni clasificar.
- Urgencia (dolor fuerte, inflamación severa, alergia a anestesia) → escalate-to-human y pausar onboarding.
- Escritura en medical_history solo con contacto verificado del propio paciente.
- Historia por WhatsApp marcada como autoreporte del paciente; el doctor la valida en consulta.

## Evidencia de commits
- db101a2 docs(odd): task file y mapa de exploración (exploración)
- f525bab docs(openspec): propuesta (propose)
- 90760d9 docs(openspec): deltas de specs, 19 req/51 esc (spec)
- bad47c8 docs(openspec): design D1–D12 (design)
- 97f1d54 docs(openspec): tasks, 68 tareas (tasks)
- 5531485 feat(clinical): provenance column source (Apply Fase 1, work unit A/D1) — migración 20261003155627 + down, types, medical-history, tests 10/10, tsc limpio
- 709471e feat(flows): flujo onboarding + registry + advance symmetry (work unit B/D2 D3 D6) — 80 tests flows
- c188f13 docs(odd): evidencia de commits
- 7780ad3 feat(whatsapp): disparador, handlers, urgencia+escalación (work unit C/D4 D5 D7) — 170 tests flows+whatsapp, tsc limpio
- 0c2e7ff test(follow-up): fix preexistente ruta migración 0020→0021 (desbloquea V.1); suite completa 1388 verde

## Notas de contexto (memoria)
- Subagentes sdd-{phase} no existen; usar gentle-ai-explore/worker/verify.
- Worker requiere `## Allowed edit surfaces` como última sección del task.
- lens_context_budget_exceeded es terminal: revisar deltas por fase, nunca el candidato acumulado.
- Migraciones nuevas: supabase/migrations/YYYYMMDDHHMMSS_descripcion_snake_case.sql (numeración secuencial deprecada).
