# Tasks: separate-mora-agent

## 1. Type shim removal (Phase 0 outcome)

- [ ] 1.1 Delete `agent/eve-shim.d.ts`; remove the `@ts-expect-error` + comment in `agent/agent.ts`.
- [ ] 1.2 Verify `npx tsc --noEmit`, `npm run build`, and `eve build` are green.

## 2. Subagent scaffold

- [ ] 2.1 Create `agent/subagents/mora/agent.ts`: `defineAgent` with required `description`, dynamic model resolver (`step.started`, same OpenAI-compatible provider as Eva), session limits matching Eva.
- [ ] 2.2 Create `agent/subagents/mora/instructions.md`: collections role, guardrails, and tone moved from Eva's instructions (Spanish de México, English identifiers).
- [ ] 2.3 Move `agent/skills/payment-collection.md` → `agent/subagents/mora/skills/payment-collection.md`.
- [ ] 2.4 Validate with `eve info` (Subagents 1 subagent, 0 diagnostics) and `eve build`.

## 3. Delegation identity binding (backend)

- [ ] 3.1 Migration `00xx_agent_delegation_bindings` (+ down): `child_session_id` (unique), `trusted_patient_phone`, `created_at`; TTL-friendly index.
- [ ] 3.2 `src/lib/agent/delegation-bindings.ts`: insert, lookup (with bounded retry), and expired-row cleanup; admin client only.
- [ ] 3.3 Root hook `agent/hooks/delegation-identity.ts`: on `subagent.called` for `mora`, read trusted phone from root `ctx.session.auth` and persist the binding; swallow-and-log on failure (safe degradation).
- [ ] 3.4 Unit tests (RED-first): binding round-trip, retry on missing binding, refusal when unbound/expired, hook extracts phone from auth attributes.

## 4. Move the collections tools

- [ ] 4.1 Move `get-patient-balance.ts`, `list-overdue-balances.ts`, `register-payment-intent.ts` from `agent/tools/` to `agent/subagents/mora/tools/`.
- [ ] 4.2 Adapt identity resolution in the three tools: `ctx.session.auth` → binding lookup via `ctx.session.parent`/child session id → security refusal. Extract the shared resolver into the subagent's lib (reuse `trusted-contact-context` helpers).
- [ ] 4.3 Data-suite tests against local Supabase (`npm run test:local`): delegated identity resolution returns the linked patient's balance; chat-supplied phone never resolves; unbound delegation refuses.

## 5. Eva as front door

- [ ] 5.1 Remove the collections sections from `agent/instructions.md`; add the delegation contract (delegate payments/balance/arrears intent to `mora`; relay reply; never state amounts).
- [ ] 5.2 Structural test: Eva's compiled surface contains no collections tools/skill; `mora` manifest contains exactly the three collections tools + skill and no booking tools.

## 6. Verification and docs

- [ ] 6.1 `npm run test:local` (Supabase local), `npx tsc --noEmit`, `npm run build`, `eve build` all green.
- [ ] 6.2 Update `architecture.md` §3.2 and `docs/eve-runbook.md` (topology: Eva root + Mora subagent; `eve info` expectation; rollback note).
- [ ] 6.3 Update `odd/tasks/separacion-de-agentes.md` evidence; record work-unit commits.
