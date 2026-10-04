# Proposal: Eve Migration Stage 7 — Remove Legacy WhatsApp Agent

**Issue**: [#37 — Stage 7: Remove Legacy WhatsApp Agent Code](https://github.com/proyecto-polaris-ia/medica-app/issues/37)
**Base branch**: `main` (the issue's `feat/eve-migration` base is obsolete; recent history merges directly to `main`)

## Why

Stage 7 closes the WhatsApp agent migration to the Vercel Eve framework. Eve has
been stable in production since Stage 6, so the legacy agent is now duplicated
functionality: it runs a parallel orchestrator, LLM provider, onboarding
conversation, and feature flags that no longer serve WhatsApp traffic.

Removing the legacy pipeline:

- eliminates a second, untested-by-default conversation path;
- removes the `WHATSAPP_EVE_ENABLED` routing switch and the legacy fallback;
- reduces maintenance surface (one agent runtime, one set of specs, one set of
  docs) and reduces future onboarding cost;
- removes a stale LLM provider dependency path (`whatsapp-llm-provider.ts`).

The issue's suggested deletion list ("delete `src/lib/flows/`") is **rejected**.
Dependency analysis (below) shows the Flow Engine core and several
`src/lib/whatsapp/*` modules still have active importers.

## What Changes

### 1. Webhook becomes a thin Eve-only forwarder

`app/api/whatsapp/webhook/route.ts` is rewritten to: verify the Meta signature,
parse the payload, emit the typing indicator and observability record, then
**always** `POST` the raw body to `/eve/v1/whatsapp`. There is no legacy branch,
no fallback, and no `WHATSAPP_EVE_ENABLED` read in code. The Meta webhook URL is
unchanged. Removing the Vercel env var (`vercel env rm WHATSAPP_EVE_ENABLED`) is
an operator action documented in `docs/eve-runbook.md`.

### 2. Delete the legacy WhatsApp pipeline (zero active importers)

- `src/lib/whatsapp/orchestrator.ts`, `inbound-service.ts`, `escalation.ts`,
  `onboarding-context.ts`
- `src/lib/flows/onboarding-answers.ts`, `onboarding-eligibility.ts`,
  `onboarding-urgency.ts`
- `src/lib/ai/whatsapp-inbound-agent.ts`, `src/lib/ai/whatsapp-llm-provider.ts`
- `src/lib/whatsapp/eve-flag.ts` and its tests
- legacy-only tests (`orchestrator-*`, `inbound-service-*`,
  `onboarding-context`, `onboarding-*`, `whatsapp-inbound-agent`)

### 3. Keep everything with active importers

- `src/lib/flows/` core — `flow-engine`, `flow-control`, `registry`, `types`,
  `definitions` (used by web chat through `app/api/web-chat/message/route.ts` →
  `src/lib/web-chat/web-inbound-service.ts`).
- `src/lib/ai/whatsapp-intent-classifier.ts` — web chat.
- `src/lib/whatsapp/onboarding-flag.ts` — crons `send-onboarding-nudge` and
  `appointment-reminders`.
- `src/lib/observability/whatsapp-ai.ts` — WhatsApp Command Center and webhook.
- `src/lib/observability/debug-logger.ts` — `flows/flow-control.ts`.
- `src/lib/whatsapp/client.ts`, `normalize.ts`, `store.ts`, `signature.ts` —
  `eve-escalation`, webhook, crons.
- `src/lib/whatsapp/eve-escalation.ts` — Eve tools `escalate-to-human` and
  `register-payment-intent`.

### 4. Shared type extraction (prerequisite)

`WhatsAppInboundIntent` and the decision shape consumed by the live store
(``WhatsAppStoreDecision`` picks `WhatsAppInboundAgentDecision` fields) are
extracted to a small shared module before deleting `whatsapp-inbound-agent.ts`.
Live type-only importers are `eve-escalation.ts`, `store.ts`, and
`whatsapp-intent-classifier.ts` (web chat).

### 5. Test refactor (prerequisite)

`src/lib/citas/__tests__/reminder-reply-acceptance.test.ts` imports
`orchestrator.isFlowSessionActive`. The pure helper is relocated to a live flow
module and the test re-pointed before the orchestrator is deleted.

### 6. Flags, env, docs, and specs

- `WHATSAPP_EVE_ENABLED`: removed from code and `.env.local.example`; operator
  removal documented.
- `WHATSAPP_FLOW_ENGINE_ENABLED`: only referenced by the deleted
  `inbound-service.ts`; removed from `.env.local.example`, `architecture.md`,
  `docs/whatsapp-agent-architecture.md`, `docs/flow-engine.md`, and the specs.
- `WHATSAPP_AGENT_LLM_*`: retained — `agent/agent.ts` (Eve) reads `API_KEY`,
  `BASE_URL`, and `MODEL`. `WHATSAPP_AGENT_LLM_API_STYLE` is a removal candidate.
- Docs updated: `architecture.md`, `README.md`, `docs/flow-engine.md`,
  `docs/whatsapp-agent-architecture.md`, `docs/eve-runbook.md`,
  `docs/eve/eve-migration-plan.md` (Stage 7 checklist).
- npm dependency re-check: `@ai-sdk/openai` (no importer) and `ai` are reviewed;
  `ai` is removed only if it is not a required peer of `eve`.

## Impact

- **Capabilities affected**
  - `eve-framework`: webhook forwarding becomes always-on; the routing flag, the
    legacy fallback, and the superseded stage non-interference constraints are
    removed; observability and runbook are updated.
  - `whatsapp-inbound-automation`: legacy decisioning/orchestration requirements
    and the WhatsApp Flow Engine integration are removed. Storage, transport,
    privacy, escalation, and knowledge requirements remain.
  - `flow-engine`: the feature-flag and WhatsApp reminder-reply precedence
    requirements are removed; the engine remains the deterministic runtime for
    web chat.
- **Database**: no migrations, no RLS changes.
- **Meta**: webhook URL and verification token unchanged.
- **Crons**: `appointment-reminders` and `send-onboarding-nudge` remain active;
  `appointment-reminder-reply` and `whatsapp-onboarding` specs still describe
  their behavior.
- **Risk**: transitive regressions in web chat, crons, WhatsApp Command Center,
  and `eve-escalation`. Mitigated by the ordered, build-green deletion strategy
  in `design.md`.
- **Out of scope**: migrating web chat to Eve; Meta configuration changes;
  deployment and post-deploy monitoring.

## Rollback Plan

Rollback is `git revert` of the Stage 7 merge commit followed by a redeploy.
Because the Meta webhook URL is unchanged, no Meta configuration or data
migration is required. `WHATSAPP_EVE_ENABLED` was deleted by an operator
(`vercel env rm`); restoring it is only necessary if rolling back to Stage 6 code
that still reads it.
