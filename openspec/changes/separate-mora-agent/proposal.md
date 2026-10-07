# Proposal: Separate Mora as a Declared Eve Subagent (issue #140, Phase 0 + Phase 1)

**Issue**: [#140 — Separación de agentes: Eva, Mora, Clara y Nora](https://github.com/proyecto-polaris-ia/medica-app/issues/140)
**Scope**: Phase 0 (Eve capability spike + topology decision) and Phase 1 (extract Mora out of Eva). Clara (Phase 2), Nora (Phase 3), and the agents panel (Phase 4) are separate future changes.

## Why

Today Eva absorbs the collections behaviors that the client conceives as a separate agent, **Mora** (payments and arrears). Mora currently exists as 3 tools + 1 skill inside Eva (`agent/tools/get-patient-balance.ts`, `list-overdue-balances.ts`, `register-payment-intent.ts`, `agent/skills/payment-collection.md`), a decision made in issue #67 ("Approach 1") because subagent support was unexercised and the type shim did not declare the API.

The spike performed for Phase 0 (2026-10-06) validated the installed `eve@0.52.2` against its bundled docs and real types:

- Declared subagents (`agent/subagents/<id>/agent.ts` with required `description`) are supported and compile: `eve build` passes and `eve info` reports the probe subagent with 0 diagnostics.
- `defineDynamic` is exported from `eve` and supported for subagents at `session.started` / `turn.started`.
- `moduleResolution` is already `"bundler"`; the real types of `eve`, `eve/tools`, `eve/channels/chat-sdk`, `@chat-adapter/*`, and `chat` resolve without the shim. The shim (`agent/eve-shim.d.ts`) is now the *cause* of type blindness: it shadows the real package types and forces the `@ts-expect-error` in `agent/agent.ts`.
- Delegation is not `ctx.agent(...)`: eve lowers each subagent into a model-visible tool with `{ message, agentId?, outputSchema? }`. Channels and schedules are root-only, so Mora can never touch WhatsApp directly — which matches the issue's hard constraint (one WhatsApp binding, Eva as front door).
- **Key constraint discovered**: subagent sessions run on internal runtime paths, so `ctx.session.auth.current` and `.initiator` are `null` in the child, and `ctx.session.parent` exposes only IDs (no auth attributes). Mora's balance tools must therefore resolve the trusted WhatsApp phone through a server-side binding created at the delegation boundary, never through model-supplied text.

Extracting Mora:

- gives collections its own prompt, guardrails, tool surface, and observability (subagent events in traces / agent runs), as the client expects;
- shrinks Eva's `instructions.md` and keeps booking intent uncontaminated by collections rules;
- resolves the #67 debt explicitly instead of leaving a reverted decision ambiguous.

## What Changes

### 1. Remove the type shim; use real Eve types

Delete `agent/eve-shim.d.ts` and the now-obsolete `@ts-expect-error` in `agent/agent.ts`. Under `moduleResolution: "bundler"` the real package types are used end to end. Verified: `npx tsc --noEmit` passes with only that directive to remove.

### 2. Create the Mora subagent (`agent/subagents/mora/`)

- `agent.ts`: static `defineAgent` (no `defineDynamic` needed) with the required `description` and the same dynamic OpenAI-compatible model resolution Eva uses (`step.started` model resolver inside the subagent definition).
- `instructions.md`: collections-specific instructions and guardrails (moved out of Eva's `instructions.md`): DB-derived amounts only, verified-contact-before-balance, no negotiation, no money movement, no payment links, own-patient data only, Spanish de México warm tone.
- `tools/`: move `get-patient-balance.ts`, `list-overdue-balances.ts`, `register-payment-intent.ts` from `agent/tools/` into the subagent. Their identity resolution is adapted to the subagent context (see §4), with refusal behavior preserved.
- `skills/payment-collection.md`: moved from Eva's skills.

### 3. Eva becomes the front door that delegates

- Remove the collections tools and skill from Eva's surface.
- Update `agent/instructions.md`: drop the in-Eva collections sections; add delegation instructions — when the patient expresses a payments/balance/arrears intent, Eva delegates to the `mora` subagent with the patient's message and required context, and relays Mora's reply through the single WhatsApp channel. Eva never states amounts itself.
- Booking, availability, knowledge, onboarding, escalation, and reminder-reply behavior are unchanged.

### 4. Server-side trusted-identity binding across the delegation boundary

The collections tools must keep binding identity to the WhatsApp channel, not to model text. A root hook observes the delegation (`subagent.called`) while the root session still carries the channel-derived auth (`trustedPatientPhone`), and persists a short-lived binding (`childSessionId → trustedPhone`) in Supabase. Mora's tools resolve identity with the priority: (1) `ctx.session.auth` trusted phone (root/direct context, unchanged), (2) parent-lineage lookup of the binding (`ctx.session.parent` → child session id), (3) refusal. A patient must never be able to obtain another patient's balance by typing a phone number in chat; that guardrail is covered by tests.

### 5. Unchanged on purpose

- The outbound payment-reminder path (`src/lib/payments/send-payment-reminder.ts`, cron route, `payment_reminders`) is server-side and does not move.
- The balance engine (`src/lib/admin/accounts-receivable.ts`), `payment_intents` schema, WCC payments views, webhook routing, and the single WhatsApp binding are unchanged.
- No second WhatsApp number/route; no automatic or bulk sends; no travelhub-app changes.

## Capabilities Affected

- `mora-agent` — MODIFIED (intent routing via delegation, identity source strengthening) and ADDED (separated agent surface, delegation observability).
- `eve-framework` — unaffected behaviorally; type-shim removal is an implementation concern, verified by existing checks.

## Out of Scope

- Clara and Nora agent-ization (issue #140 Phases 2–3).
- Agents panel / WCC agent runs surface (Phase 4).
- Second WhatsApp number or channel re-binding.
- Automatic payment reconciliation, payment links, or gateway flows (already out of scope in #67).
- Multi-root-agent workspace layouts (`agents/<name>/agent/`): not validated in the spike and not needed for this topology.

## Reconciliation with #67

Issue #67 (closed, "Approach 1": Mora as tools inside Eva) is partially superseded by this change: the collections behavior keeps every #67 guardrail and the same tools/skill, but it moves to a separate declared subagent with its own instructions and observability. The `mora-agent` spec is updated by delta; the archived #67 change stays as historical record.
