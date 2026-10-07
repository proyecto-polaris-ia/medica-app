# Design: Separate Mora as a Declared Eve Subagent

**Change**: `separate-mora-agent` · **Issue**: [#140](https://github.com/proyecto-polaris-ia/medica-app/issues/140) (Phase 0 + Phase 1)

## 1. Phase 0 spike — what was validated against `eve@0.52.2` (installed)

All evidence below was gathered against `node_modules/eve` (0.52.2), not generic docs. Commands run in this repository: `eve build`, `eve info`, `npx tsc --noEmit` with/without shim.

| Claim from issue #140 | Result |
|---|---|
| Declared subagents at `agent/subagents/<id>/agent.ts` (required `description`) | ✅ Confirmed. Probe subagent compiled; `eve info` reported `Subagents 1 subagent`, `Diagnostics 0 errors, 0 warnings`. |
| Parent delegates via `ctx.agent(...)` | ❌ Not the real API. Every subagent is lowered to a model-visible tool named after the directory (`mora`) with schema `{ message, agentId?, outputSchema? }`. The built-in `agent` tool (root-copy delegation) is separate and root-only. |
| `defineDynamic` with `session.started` / `turn.started` | ✅ Exported from `eve` (`dist/src/public/index.d.ts`); supported for subagent visibility. `step.started` is NOT supported for subagent visibility (only for model resolution — which Eva already uses). |
| Multi-root workspace (`agents/<name>/agent/`) | ⚠️ Not validated and not needed. Rejected for this change (keeps single runtime, single deploy). |
| `moduleResolution: "node"` + shim required | ❌ Outdated. `tsconfig.json` already uses `"bundler"`; real types resolve. The shim is what *breaks* typing: it shadows the real `eve` module and forces `@ts-expect-error` in `agent/agent.ts`. Without the shim, `tsc --noEmit` passes (only that directive needs removal). |
| Upgrade Eve needed | ❌ No. 0.52.2 already exposes everything required. |

Additional constraints confirmed from the installed package:

- Subagent = its own agent root: owns instructions, tools, skills; **channels and schedules are root-only** → Mora can never bind or send on WhatsApp directly. Matches the hard constraint "Eva is the only WhatsApp-bound agent".
- Child runs as a durable background task; result returns to the parent tool loop; child parks and can be continued via `agentId`.
- **Child sessions run on internal runtime paths: `ctx.session.auth.current` and `.initiator` are `null`; `ctx.session.parent` exposes only `{ callId, rootSessionId, sessionId, turn }` (no auth attributes).** This is the central design constraint (§4).
- Hooks are observe-only (cannot inject model context) but can persist events to a database. `subagent.called` / `subagent.completed` are part of the runtime stream vocabulary hooks can subscribe to.

## 2. Topology decision (issue §4.1 options)

| Option | Verdict | Reason |
|---|---|---|
| A. Same agent + tools (status quo, #67 Approach 1) | Rejected | Does not deliver the separation the client asked for; `instructions.md` keeps growing. |
| **B. Declared subagents of Eva** | **Chosen** | Validated on the installed version; one WhatsApp binding preserved; separate prompt/tools/skills/observability per agent; runtime and deploy stay single; smallest change that satisfies the issue. |
| C. Multi-root workspace agents | Rejected (now) | Re-structures the repo; routing and channel binding get riskier; validated only as a future option if a second conversational root is ever needed. |
| D. Separate deployments | Rejected | Highest operating cost; no precedent in the repo; no requirement demands process isolation. |

Resulting topology: **Eva = root agent bound to WhatsApp (front door). Mora = declared subagent `agent/subagents/mora/`, reached only by delegation from Eva. Clara and Nora are NOT subagents in this change** (they are admin/jobs-facing; their future forms are Phase 2–3 decisions).

## 3. Mora subagent shape

```
agent/subagents/mora/
├── agent.ts                 # defineAgent, description, step.started dynamic model (same provider as Eva)
├── instructions.md          # collections role + guardrails (moved from Eva)
├── tools/
│   ├── get-patient-balance.ts
│   ├── list-overdue-balances.ts
│   └── register-payment-intent.ts
└── skills/
    └── payment-collection.md
```

- Static declaration (no `defineDynamic` visibility gate): collections availability is not session-conditional. Eva's own `step.started` dynamic-model pattern is replicated inside Mora's definition (the model resolver runs per step; `session.id` is the child's session id, so the OpenCode session header stays correct).
- `description` (required) is what Eva's model reads to decide delegation; it must state the collections scope crisply (balances, overdue plans, payment intent, escalation).
- Delegation uses free-form result (Mora's reply text relayed by Eva). `outputSchema` is deliberately not used in Phase 1: the parent must relay a patient-facing message, and structured output would add a translation step without a consumer. Revisit if the admin surface needs structured delegation outcomes.
- The three tools move verbatim except for identity resolution (§4). Their Supabase access, balance engine reuse (`getPatientReceivableSummary`, `ELIGIBLE_PLAN_STATUSES`), and refusal messages are unchanged.

## 4. Trusted identity across the delegation boundary (the core problem)

### Problem

Mora's tools enforce "verified contact before balance disclosure" via `requireTrustedWhatsAppPhone(ctx)` reading `ctx.session.auth.current/initiator.attributes.trustedPatientPhone`. In a child session both are `null` (internal runtime path). Options considered:

| Option | Verdict |
|---|---|
| Pass the phone in the delegation `message` and let Mora's tools accept it as tool input | **Rejected.** The phone becomes model-mediated text; a patient could steer Eva/Mora toward another patient's phone. Breaks the backend guardrail principle (identity must derive from the channel, never from chat). |
| Keep the balance tools on Eva and have Mora only draft replies | Rejected. Eva would fetch amounts (model decides when), Mora loses its tool surface; fails the issue's acceptance criteria for Mora. |
| Wrap/override the `mora` subagent tool with an authored root tool | Rejected. eve rejects static collisions between subagent names and authored tools; overriding the *built-in* `agent` tool does not affect declared subagent lowering. |
| **Root hook persists a server-side binding at delegation time; child tools resolve identity via parent lineage** | **Chosen.** |

### Chosen mechanism

1. **Root hook** (`agent/hooks/delegation-identity.ts`) subscribes to `subagent.called` for the `mora` subagent. At that moment the hook runs on the root session, where `ctx.session.auth` still carries the channel-derived `trustedPatientPhone` (injected by `buildTrustedContactAuth` from the WhatsApp message — unchanged code).
2. The hook persists a binding row: `child_session_id` (from the event's `childSessionId`), `trusted_patient_phone`, `created_at` — in a small Supabase table (migration `00xx_agent_delegation_bindings`), with a TTL/cleanup rule (e.g. rows valid for 1 hour; opportunistic delete on lookup).
3. **Mora's tools** resolve identity in order:
   1. `ctx.session.auth` trusted phone (root/direct context — keeps the tools usable from Eva directly and in tests);
   2. `ctx.session.parent` → child session id → binding lookup (subagent context);
   3. refusal with the existing security message.
4. The model never sees or transports the phone. Prompt-injection cannot mint identity: a binding exists only when the framework observed a real delegation from an authenticated root session.

### Named risks

- **Hook/child race**: the child's first tool call could theoretically run before the hook's insert commits. Mitigation: bounded retry (e.g. 3 attempts, short backoff) in the binding lookup before refusing. The child always spends at least one LLM turn before its first tool call, so the window is wide in practice.
- **Binding misuse**: keys are framework-generated session ids, not model text; TTL keeps the table negligible.
- **Hook failure**: if the hook cannot persist (DB down), delegation degrades safely — child tools refuse with the security message; no balance is disclosed. Failure path is tested.

## 5. Eva instructions after extraction

- Remove: "Guardrails de colecciones / Mora" block and "Cobranza y Mora" section (they move to Mora's `instructions.md`).
- Add: a short delegation contract — payments/balance/arrears intent → delegate to `mora` passing the patient's message; relay Mora's reply verbatim in tone; never state amounts; booking/availability/FAQ continue as today.
- Eva keeps: booking, availability, catalog, knowledge, onboarding, escalation, reminder-reply, `trusted-contact-context` (root-side auth construction stays in the root channel path).

## 6. Testing strategy

- **Unit (no Supabase):** binding lookup order, refusal on missing/expired binding, hook extraction of `trustedPatientPhone` from auth attributes, delegation instruction presence in Eva's instructions (string/structural checks), subagent manifest contains the three tools + skill (assert via compiled manifests from `eve build` if available; else file-structure checks).
- **Data suites (`npm run test:local` against local Supabase):** binding table round-trip + TTL cleanup; payment tools still resolve the correct patient through the binding path; refusal when unbound.
- **Guardrail regression (RED-first):** balance never derived from chat text; unverified/other-patient phone in chat yields refusal; no booking tools inside Mora's manifest; register-payment-intent still writes only to `payment_intents`.
- **Repo checks:** `npx tsc --noEmit` (must pass with shim removed), `npm run build`, and `eve build` green.

## 7. Migration / rollout

- Single deploy: subagent compiles into the same eve app; webhook and channel binding untouched.
- Rollback = revert the merge commit; no schema beyond an additive table (safe to keep).
- Operator notes (post-merge): verify `eve info` shows `Subagents 1 subagent` on production build; observe `subagent.called`/`subagent.completed` in agent runs for a live delegation.

## 8. Open questions resolved

1. Topology → B (§2).
2. Mora shares the WhatsApp number, reached only via Eva (§2, §3).
3. How Mora's session identity is preserved → free-form delegation result relayed by Eva; child parks and can be continued with `agentId` if a follow-up turn needs more collections detail (§3).
4. Operational surface → existing WCC payments + agent runs traces; no new UI in this change.
5. Eve upgrade → none required (§1).
6. Reconciliation with #67 → guardrails/tools preserved; topology superseded; `mora-agent` spec updated by delta (proposal §Reconciliation).
