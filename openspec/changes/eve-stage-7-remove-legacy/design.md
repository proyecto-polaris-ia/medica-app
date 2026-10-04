# Design: Eve Migration Stage 7 — Remove Legacy WhatsApp Agent

## Context

Stage 6 routes WhatsApp traffic to Eve behind `WHATSAPP_EVE_ENABLED`. Stage 7
makes Eve the only path and deletes the legacy pipeline. The dominant constraint
is **build-green ordering**: every step must leave `npx tsc --noEmit`,
`npm run test`, and `npm run build` passing, because the branch is deployed and
reviewed incrementally.

Dependency analysis (path:line evidence gathered during exploration) shows the
issue's blanket "delete `src/lib/flows/`" is wrong. Live importers:

| Module | Live importer |
|---|---|
| `flows/flow-engine`, `flow-control`, `registry`, `types`, `definitions` | `src/lib/web-chat/web-inbound-service.ts` |
| `ai/whatsapp-intent-classifier.ts` | `src/lib/web-chat/web-inbound-service.ts` |
| `whatsapp/onboarding-flag.ts` | crons `send-onboarding-nudge`, `appointment-reminders` |
| `observability/whatsapp-ai.ts` | `src/lib/wcc-dashboard.ts`, webhook route |
| `observability/debug-logger.ts` | `flows/flow-control.ts` |
| `whatsapp/client|normalize|store|signature` | `eve-escalation`, webhook, crons |
| `whatsapp/eve-escalation.ts` | Eve tools `escalate-to-human`, `register-payment-intent` |

## Decisions

### D1 — Extract shared types before deleting the legacy agent

`whatsapp-inbound-agent.ts` is both the deleted reasoning module and the source
of two live types:

- `WhatsAppInboundIntent` — imported by `eve-escalation.ts`,
  `whatsapp-intent-classifier.ts` (web chat), and (deleted) `escalation.ts`.
- `WhatsAppInboundAgentDecision` — `store.ts` derives `WhatsAppStoreDecision`
  with a `Pick<>` over it. **This is the real blocker**, not only
  `WhatsAppInboundIntent`; the parent's summary named only the intent type.

Create `src/lib/whatsapp/inbound-decision.ts` exporting the intent union and the
minimal decision shape `store.ts` consumes (`intent`, `confidence`, `summary`,
`citedKnowledgeIds`, `citedToolCallIds`, `dynamicToolResults?`,
`providerDiagnostics?`). Re-point the live importers, verify, then delete the
legacy module.

### D2 — Relocate `isFlowSessionActive` before deleting the orchestrator

`src/lib/citas/__tests__/reminder-reply-acceptance.test.ts` imports
`isFlowSessionActive` from `orchestrator.ts`. The function is pure
(`flowState != null && name !== 'complete' && !isFlowExpired`). Relocate
`isFlowSessionActive`/`isFlowExpired` to a live flow module (`flows/flow-control.ts`
or a sibling `flows/session.ts`) so the acceptance test keeps asserting real
behavior, then re-point the test import. Stubbing the test is the fallback only if
relocation changes web chat behavior.

### D3 — Webhook rewrite is Eve-only, no fallback

Rewrite `app/api/whatsapp/webhook/route.ts` to verify the signature, parse the
payload, emit the typing indicator and observability records, and always
`fetch('/eve/v1/whatsapp')` with the raw body. On forward failure return an error
status and log it; do **not** fall back. `GET` (Meta verification) is unchanged.
Delete `eve-flag.ts` and update `route.test.ts` to the always-forward contract.
`WHATSAPP_EVE_ENABLED` survives only as a Vercel variable until the operator runs
`vercel env rm`.

### D4 — Flag and env cleanup

`WHATSAPP_FLOW_ENGINE_ENABLED` is read only by the deleted `inbound-service.ts`.
Remove it from `.env.local.example`, `architecture.md`,
`docs/whatsapp-agent-architecture.md`, `docs/flow-engine.md`, and the specs
(this change). Keep `WHATSAPP_AGENT_LLM_API_KEY|MODEL|BASE_URL` because
`agent/agent.ts` reads them; `WHATSAPP_AGENT_LLM_API_STYLE` is a removal
candidate after the legacy provider is gone.

### D5 — npm dependency review

`@ai-sdk/openai` has no importer; remove it. `ai` has no direct importer but may
be a peer/transitive requirement of `eve`; verify with `npm ls ai` and remove
only if `eve` does not require it. Do not mutate `@ai-sdk/openai-compatible`,
which `agent/agent.ts` uses.

## Ordered deletion strategy (build green at each step)

1. **Shared-type extraction** (D1): add `inbound-decision.ts`, re-point
   `eve-escalation.ts`, `store.ts`, `whatsapp-intent-classifier.ts`.
   Verify: `npx tsc --noEmit && npm run test`.
2. **Legacy pipeline deletion**: delete `orchestrator.ts`, `inbound-service.ts`,
   `escalation.ts`, `onboarding-context.ts` and legacy-only tests; relocate
   `isFlowSessionActive` (D2) and re-point `reminder-reply-acceptance.test.ts`.
   The webhook still has its legacy branch but that branch's module is gone —
   therefore step 5 (webhook rewrite) must land in the **same work unit** as this
   deletion, or the webhook temporarily imports a missing module. Order within
   the unit: relocate helper → rewrite webhook → delete pipeline.
   Verify: `npx tsc --noEmit && npm run test`.
3. **Flows onboarding deletion**: delete `onboarding-answers.ts`,
   `onboarding-eligibility.ts`, `onboarding-urgency.ts` and their tests. Core
   `flows/` and the onboarding flow definition/registry entry stay.
   Verify: `npx tsc --noEmit && npm run test`.
4. **AI deletion**: delete `whatsapp-inbound-agent.ts`,
   `whatsapp-llm-provider.ts` and their tests; run the npm dependency review (D5).
   Verify: `npx tsc --noEmit && npm run test`.
5. **Webhook + flag removal** (D3/D4): delete `eve-flag.ts`, rewrite
   `route.ts`/`route.test.ts`, clean `.env.local.example` and the docs flag
   references. Verify: `npx tsc --noEmit && npm run test`.
6. **Docs**: update `architecture.md`, `README.md`, `docs/flow-engine.md`,
   `docs/whatsapp-agent-architecture.md`, `docs/eve-runbook.md`,
   `docs/eve/eve-migration-plan.md` (Stage 7 checklist).
7. **Final verification**: `npm run test`, `npx tsc --noEmit`, `npm run build`.

Steps 2 and 5 are coupled (see step 2); the implementer may land them as one
reviewable work unit.

## Test strategy

- Strict TDD per `openspec/config.yaml`. For each deletion, the RED is the
  compile/test failure introduced by removing the symbol; the GREEN is the
  re-pointed live consumer passing.
- Behavior-level tests that must stay green: `reminder-reply-acceptance`,
  `eve-escalation`, `onboarding-flag`, web-chat flow tests, cron route tests,
  `whatsapp-ai`/WCC.
- Legacy-only tests are deleted with their subject; do not rewrite them.
- Webhook contract test is rewritten to assert always-forward, signature-before-
  forward, forward-failure surfacing, and no legacy invocation.
- Final gate: `npm run test && npx tsc --noEmit && npm run build`.

## Risk analysis

- **Web chat** — depends on `flows/` core and `whatsapp-intent-classifier`. Guard
  with the web-chat unit tests; do not delete any `flows/` file without an
  importer check.
- **Crons** — `appointment-reminders` and `send-onboarding-nudge` depend on
  `onboarding-flag.ts`, `store.ts`, and `client.ts`. Keep these; run the cron
  route tests. Reminder-reply *recognition* was legacy-pipeline-owned; after
  deletion the accepted replies are handled by Eve (see `appointment-reminder-reply`
  spec for the retained contract). This behavioral shift is the highest product
  risk and must be reviewed.
- **WhatsApp Command Center** — `wcc-dashboard.ts` depends on
  `observability/whatsapp-ai.ts`; keep it and run WCC-related tests.
- **`eve-escalation` transitive deps** — pulls `store.ts`, `client.ts`,
  `normalize.ts` types. Guard with `eve-escalation.test.ts`; the shared-type
  extraction must preserve `WhatsAppStoreDecision`.
- **Spec staleness** — `whatsapp-onboarding` still describes the removed
  onboarding conversation while the nudge cron remains. Flagged as follow-up.
- **Rollback safety** — Meta URL unchanged; `git revert` + redeploy restores the
  Stage 6 tree.

## Non-goals

- Migrating web chat to the Eve agent (future issue; web chat keeps the Flow
  Engine).
- Changing the Meta webhook URL or verification configuration.
- `vercel env rm WHATSAPP_EVE_ENABLED` in code/CI (operator action).
- Production deploy and post-deploy monitoring.
