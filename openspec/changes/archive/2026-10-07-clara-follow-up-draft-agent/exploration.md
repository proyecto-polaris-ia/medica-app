# Exploración — clara-follow-up-draft-agent (issue #148)

Fase: sdd-explore (delegada a gentle-ai-explore). Gate: **Ready for Proposal: Yes**.

## 1. `src/lib/admin/follow-up/` (lista diaria, ya implementada)
- `config.ts` — umbrales configurables (`NO_SHOW_WINDOW_DAYS`, `STALLED_TREATMENT_DAYS`, `INACTIVE_PATIENT_DAYS`, `UNANSWERED_QUOTE_DAYS`, `FOLLOW_UP_REASON_PRIORITY`).
- `rules.ts:11-53` — `FollowUpReason`, `FollowUpCandidate`, `FollowUpPlan`; reglas puras: `isRecoverableNoShow` (:69, 90d + sin cita posterior no cancelada), `isStalledTreatmentPlan` (:96, 45d, fallback `plan.createdAt`), `isInactivePatient` (:125, 6m, cita futura excluye); `daysBetween` (:59).
- `follow-up.ts` — capa de datos: `currentRoundDate` (:179, día calendario `America/Mexico_City` vía `clinicDayKey`), `listDailyFollowUpCases` (:190, lecturas masivas agrupadas en memoria), `loadFollowUpContactsForRound` (:267), `markFollowUpContact` (:290).
- `draft.ts:14` — `FOLLOW_UP_TEMPLATE_NAME = 'seguimiento_paciente'`, `MAX_DRAFT_LENGTH = 600` (:17), `TEMPLATES` por motivo (:65-74), `validateFollowUpDraftText` (:101, regex de precios/términos clínicos/presión), `buildFollowUpDraft` (:130) — determinista, sin LLM ni I/O.
- `drafts.ts` — tabla `follow_up_message_drafts`: `createFollowUpDraft` (upsert idempotente por `dedupKey = follow-up-draft:<patientId>:<roundDate>`, :109-141), approve/reject solo desde `draft` (:152-189), `claimFollowUpDraftForSend` (claim atómico `approved→sending`, :192), `markFollowUpDraftSent`/:211, `markFollowUpDraftSentFailed`/:241.
- `types.ts:37-59` — `FollowUpDraftStatus = draft|approved|rejected|sent|sent_failed`, `FollowUpDraft`, `FollowUpCase`, `FollowUpContact`. Estado en tablas Supabase: `follow_up_contacts` (migración 0019), `follow_up_message_drafts` (migración 0020; test `migration-0020.test.ts`).

## 2. Spec `follow-up` (16 req / 48 escenarios)
`openspec/specs/follow-up/spec.md`. Requirements: 4 segmentos (no-show, tratamiento inconcluso, inactivo, presupuesto sin respuesta), dedup por paciente con prioridad motivo, determinismo/umbrales configurables, exclusión por ronda, página protegida, marcar contactado, descartar, enlace a wizard, RLS de `follow_up_contacts`, **Generación de borrador determinista** ("El LLM no participa", plantilla), **Aprobación humana explícita** (`draft→approved/rejected→sent/sent_failed`, sin cron), **Envío solo tras aprobación por transporte existente** (HSM, idempotente, outbound en `whatsapp_messages`), tono y guardrails. ⚠️ Fase 2 de #148 introducirá LLM de redacción — la spec actual **obliga** redacción determinista por plantilla; el cambio OpenSpec deberá modificar estos requirements.

## 3. Flujo de borradores actual
- API: `app/api/admin/follow-up/drafts/route.ts` (GET lista WCC, POST genera borrador desde caso de la lista), `drafts/[id]/route.ts` (PATCH approve/reject), `drafts/[id]/send/route.ts` (POST envío); `contacts/route.ts`, `route.ts` (lista diaria).
- Envío: `src/lib/follow-up/send-follow-up-draft.ts` — server-only, exige `approved`, revalida guardrails, usa `sendWhatsAppTemplateMessage` de `src/lib/whatsapp/client.ts` (HSM `es_MX`), asegura `whatsapp_contacts`/`whatsapp_conversations`, inserta outbound idempotente en `whatsapp_messages` (`whatsapp_message_id = providerMessageId ?? follow-up-draft:<draftId>`), marca `sent`/`sent_failed`.
- UI: `app/(admin)/whatsapp-command-center/follow-up-drafts/page.tsx` + `draft-actions.tsx` (Aprobar/Rechazar/Enviar vía fetch); data layer `src/lib/wcc-follow-up-drafts.ts` (degradación a cola vacía si Supabase no responde). **Nota: hoy no hay edición del texto del borrador** — solo aprobar/rechazar/enviar.
- Admin: `app/(admin)/follow-up/page.tsx` → `src/components/admin/follow-up/FollowUpList.tsx` (agrupa por motivo, endpoints `/api/admin/follow-up{,/contacts,/drafts}`) + `FollowUpCaseCard.tsx`.

## 4. Patrones LLM existentes (para reutilizar)
- Eve runtime `agent/`: `agent/agent.ts` (`defineAgent`), `agent/model.ts:1-40` — provider OpenAI-compatible compartido (`createOpenAICompatible` de `@ai-sdk/openai-compatible`, env `WHATSAPP_AGENT_LLM_API_KEY/BASE_URL/MODEL`, default `deepseek-v4-flash`, `defineDynamic` en `step.started`).
- Subagente declarado Mora: `agent/subagents/mora/{agent.ts,instructions.md,tools/,skills/}`; identidad de delegación vía hook `agent/hooks/delegation-identity.ts` + tabla `agent_delegation_bindings`.
- Intent classifier legacy web chat: `src/lib/ai/whatsapp-intent-classifier.ts`. No hay wrapper genérico de "structured output" fuera del framework eve; el resto de la app es determinista.
- Degradación sin keys: patrón WCC (`isSupabaseConfigured`/`isConfiguredButUnavailable`) y guardas de env (`?? ""` en `agent/model.ts`).

## 5. Decisión "sin agente autónomo" (#89)
`openspec/changes/archive/2026-10-03-clara-daily-contact-list/proposal.md:14` ("**Sin agente autónomo y sin envío automático**"), :118 y `design.md:728` lo listan como out-of-scope explícito. Topología vigente (`architecture.md` §3.2): "Clara y Nora NO son subagentes: son capacidades admin/jobs". `openspec/changes/separate-mora-agent/proposal.md` documenta el patrón de subagente declarado y out-of-scope explícito de "Clara agent-ization (Phase 2)". El nuevo cambio deberá elegir/justificar: ¿Clara como subagente eve delegable, o LLM como capability server-side (no subagente)? #148 dice "agente interno admin", lo que sugiere lo segundo; se resuelve en design.md.

## 6. Testing
`architecture.md` §9: `supabase start` + `supabase db reset`, `npm run test:local` (= `SUPABASE_LOCAL=1 vitest run`), aislamiento con `truncateAllTables` + advisory lock (`src/test-utils/local-db.ts`), CI job `test-local-db`. Tests de follow-up: `src/lib/admin/follow-up/__tests__/{rules,draft,drafts,follow-up,migration-0020}.test.ts`, `src/lib/follow-up/__tests__/send-follow-up-draft.test.ts`, `app/api/admin/follow-up/**/route.test.ts`, `app/(admin)/whatsapp-command-center/follow-up-drafts/page.test.tsx`.

## 7. Estado OpenSpec
No existía `openspec/changes/clara-follow-up-draft-agent/`; el change se creó en la fase propose.

## Ready for Proposal: Yes

Datos suficientes. Punto a fijar en design.md (no bloqueante): superficie del agente — capability server-side fuera del runtime eve (recomendable: lista y aprobación son rutas admin, consistente con #89 y architecture.md §3.2) vs subagente declarado eve. El change deberá modificar los requirements de la spec `follow-up` que hoy exigen redacción 100% determinista por plantilla.
