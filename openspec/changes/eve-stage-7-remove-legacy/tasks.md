# Tasks: Eve Migration Stage 7 — Remove Legacy WhatsApp Agent

Each phase ends with its verification commands and is completable in one session.
Check a box only after its verification is observed green.

## 1. OpenSpec artifacts

- [x] 1.1 Create `openspec/changes/eve-stage-7-remove-legacy/proposal.md`.
- [x] 1.2 Create the three delta specs (`eve-framework`, `whatsapp-inbound-automation`, `flow-engine`).
- [x] 1.3 Create `design.md` and `tasks.md`.
- [x] 1.4 Reconcile the plan with `odd/tasks/eve-stage-7-remove-legacy.md` and the issue scope; record the rejected `src/lib/flows/` deletion with evidence.

Verification: `npx tsc --noEmit && npm run test` (unchanged tree: both green).

## 2. Shared-type extraction (prerequisite)

- [x] 2.1 Add `src/lib/whatsapp/inbound-decision.ts` exporting `WhatsAppInboundIntent` and the decision shape `store.ts` picks over.
- [x] 2.2 Re-point `src/lib/whatsapp/eve-escalation.ts`, `src/lib/whatsapp/store.ts`, and `src/lib/ai/whatsapp-intent-classifier.ts` to the shared module.
- [x] 2.3 Keep `whatsapp-inbound-agent.ts` re-exporting the shared types temporarily so nothing else breaks.

Verification: `npx tsc --noEmit && npm run test`.

## 3. Delete the legacy WhatsApp pipeline + refactor the reminder-reply test

- [x] 3.1 Relocate `isFlowSessionActive`/`isFlowExpired` to a live flow module and re-point `src/lib/citas/__tests__/reminder-reply-acceptance.test.ts`.
- [x] 3.2 Decouple `app/api/whatsapp/webhook/route.ts` from `inbound-service` (drop the legacy branch/import so it forwards unconditionally); full flag/observability rewrite lands in phase 6.
- [x] 3.3 Delete `src/lib/whatsapp/orchestrator.ts`, `inbound-service.ts`, `escalation.ts`, `onboarding-context.ts`.
- [x] 3.4 Delete legacy-only tests: `orchestrator-onboarding`, `inbound-service`, `inbound-service-onboarding`, `inbound-service-reminder-reply`, `onboarding-context`. `orchestrator-flow-session` was retained and re-pointed to `@/lib/flows/flow-engine` because it covers the relocated (kept) helpers.

Verification: `npx tsc --noEmit && npm run test`.

## 4. Delete flows onboarding modules

- [x] 4.1 Delete `src/lib/flows/onboarding-answers.ts`, `onboarding-eligibility.ts`, `onboarding-urgency.ts`.
- [x] 4.2 Delete their tests (`onboarding-answers`, `onboarding-eligibility`, `onboarding-urgency`).
- [x] 4.3 Confirm `flows/flow-engine|flow-control|registry|types|definitions` and the onboarding flow definition/registry entry are untouched.

Verification: `npx tsc --noEmit && npm run test`.

## 5. Delete AI inbound agent + LLM provider + npm dependency review

- [x] 5.1 Delete `src/lib/ai/whatsapp-inbound-agent.ts` and `src/lib/ai/whatsapp-llm-provider.ts` (shared types already extracted).
- [x] 5.2 Delete `src/lib/ai/__tests__/whatsapp-inbound-agent.test.ts` and any legacy-only AI tests.
- [x] 5.3 Run `npm ls ai @ai-sdk/openai`; remove `@ai-sdk/openai` (no importer) and remove `ai` only if `eve` does not require it as a peer.
- [x] 5.4 Confirm `@ai-sdk/openai-compatible` stays (`agent/agent.ts`).

Verification: `npx tsc --noEmit && npm run test`.

## 6. Webhook Eve-only rewrite + flag removal + env/spec cleanup

- [x] 6.1 Finalize `app/api/whatsapp/webhook/route.ts`: signature verify → parse → typing indicator → always `POST` to `/eve/v1/whatsapp`; no fallback; error status on forward failure.
- [x] 6.2 Rewrite `app/api/whatsapp/webhook/route.test.ts` to the always-forward contract (signature-before-forward, forward-failure surfacing, no legacy invocation, `GET` verification unchanged).
- [x] 6.3 Delete `src/lib/whatsapp/eve-flag.ts` and `src/lib/whatsapp/__tests__/eve-flag.test.ts`.
- [x] 6.4 Remove `WHATSAPP_EVE_ENABLED` and `WHATSAPP_FLOW_ENGINE_ENABLED` from `.env.local.example`; keep `WHATSAPP_AGENT_LLM_API_KEY|MODEL|BASE_URL`; evaluate removing `WHATSAPP_AGENT_LLM_API_STYLE`.
- [x] 6.5 Remove the flag references from the specs merged by this change (the deltas) and any remaining code comment.

Verification: `npx tsc --noEmit && npm run test`.

## 7. Documentation update

- [x] 7.1 `architecture.md`: remove the Flow Engine feature-flag and legacy-path sections; describe the Eve-only webhook.
- [x] 7.2 `README.md`: update the WhatsApp agent description and env list.
- [x] 7.3 `docs/flow-engine.md`: remove the WhatsApp feature-flag/rollback sections; state web chat ownership.
- [x] 7.4 `docs/whatsapp-agent-architecture.md`: remove legacy pipeline and flag sections.
- [x] 7.5 `docs/eve-runbook.md`: document Eve-only forwarding, `git revert` + redeploy rollback, `vercel env rm WHATSAPP_EVE_ENABLED` operator step, unchanged Meta URL, monitoring.
- [x] 7.6 `docs/eve/eve-migration-plan.md`: check off the Stage 7 checklist and correct the "delete `src/lib/flows/`" instruction.

Verification: `npx tsc --noEmit && npm run test`.

## 8. Final verification

- [ ] 8.1 Run the full suite.
- [ ] 8.2 Run the type check.
- [ ] 8.3 Run the production build.

Verification:
- `npm run test`
- `npx tsc --noEmit`
- `npm run build`
