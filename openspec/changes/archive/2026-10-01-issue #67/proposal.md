# Change: Fase 4 — "Mora" payments & arrears agent over WhatsApp

## Summary

Add a second, collections-focused WhatsApp agent ("Mora") analogous to Eve. Mora answers "how much do I owe?" and sends proactive overdue-balance reminders, sourcing every amount from the database (never from the prompt) and escalating disputes, waivers, and payment intent to a human. No payment gateway: Mora informs and registers intent; real payment stays manual (Fase 3).

## Problem

With payments registered (Fase 3) and the balance engine already present (`src/lib/admin/accounts-receivable.ts`), there is no agent that surfaces outstanding balances to patients or proactively chases arrears. Jorge still chases overdue accounts by hand. Eve currently only handles agenda/FAQ; she has no balance tools, no collections guardrails, no outbound reminder scheduler, and no place to record a patient's intent to pay.

## Goals

- Expose four Mora tools: `get-patient-balance`, `list-overdue-balances`, `register-payment-intent`, `send-payment-reminder`, all wrapping the existing `accounts-receivable` engine.
- Add a `payment-collection.md` skill plus a collections guardrail section in the agent instructions (Spanish de México, warm and professional).
- Add a proactive outbound reminder path (scheduler + send) for overdue balances.
- Route payments/arrears intent to Mora within the WhatsApp channel, alongside Eve (agenda/FAQ).
- Enforce the collections guardrails in the backend, not just the prompt: no invented amounts, no new-price quoting, no negotiation, no money movement, sender identity verified before any balance is revealed.

## Non-goals

- Payment gateway, payment links, automatic reconciliation, or moving money.
- Negotiating amounts, applying discounts/waivers, or resolving disputes automatically — these escalate to a human.
- Quoting new prices or prices for non-accepted treatment plans.
- Invoicing or fiscal administration.
- Replacing the manual payment ledger (`payments`, Fase 3) with "intent to pay".

## Approach

High level: extend the existing Eve agent with the four Mora tools and the collections skill/instructions (reuse the proven trusted-contact lock and the `accounts-receivable` balance engine), and add a greenfield scheduled outbound path. Client-facing copy and code comments stay Spanish de México; identifiers and SDD artifacts stay English.

The three open design decisions from exploration are carried into the design phase with these recommendations:

### (a) Agent topology — recommendation: same Eve agent + new tools/skills (Approach 1)

**Recommendation:** extend the existing Eve agent (Approach 1) rather than build a separate agent or rely on subagents.

**Rationale:** zero routing change; `accounts-receivable` is a drop-in read source; `requireTrustedWhatsAppPhone` is reused unchanged; it matches the stage-by-stage SDD precedent. Subagent support is documented (`docs/eve/eve-migration-plan.md` §6.5) but **unexercised** in this codebase (no `agent/subagents/`, no shim API, no tests), so betting on it is speculative. A separate agent binding the same WhatsApp number has no precedent here and risks double-binding the route.

### (b) Outbound mechanism — recommendation: Vercel cron → new API route → `sendWhatsAppTextMessage`

**Recommendation:** Vercel cron hitting a new API route that reads `listAccountsReceivable({ thresholdDays })` and sends via `sendWhatsAppTextMessage`, gated by a feature flag with a dry-run mode.

**Rationale:** `vercel.json` is already the deploy config and no `pg_cron` exists; this is the smallest greenfield addition. **Critical caveat:** proactive reminders are business-initiated and Meta requires approved templates/HSM — `sendWhatsAppTextMessage` only sends free-form text. Frequency and time window (e.g. daily, business hours `America/Mexico_City`) and the template must be resolved in design against Meta policy.

### (c) Payment-intent storage — recommendation: new `payment_intents` table

**Recommendation:** introduce a dedicated `payment_intents` table (with `patient_id`, optional `treatment_plan_id`/`amount`, `status`, timestamps) surfaced in the WhatsApp Command Center, rather than reusing `whatsapp_escalations` + a note.

**Rationale:** `whatsapp_escalations` is proven and already surfaced with a human alert, but lacks structured amount/plan and the closed `whatsapp_intents.intent_type` enum (migration `0006`) has no payment value. A dedicated table is cleaner and mirrors the existing `wcc-escalations` data-layer pattern; it requires one migration plus a data layer and UI. Reuse-with-note is the lower-effort fallback if the design phase wants to defer the migration.

## Capabilities

> Contract for the spec phase. `mora-agent` is the new delta spec named by the issue's acceptance criteria.

- **New:** `mora-agent` — balance read tools, collections skill + instructions with guardrails, proactive reminder, and payment-intent escalation.
- **Modified (provisional):** `whatsapp-inbound-automation` — only if the design introduces a distinct balance/payment intent; under Approach 1 routing is handled by the same agent's tool selection and requires no webhook-level change. If a payment intent is added to the legacy path, the closed `whatsapp_intents.intent_type` enum must be extended by migration.
- **Reused (not modified):** `accounts-receivable` (balance engine), `payments` (ledger), `eve-framework` (agent pattern Mora mirrors).

## Dependencies

- **Fase 2** (`treatment_plans`, migration `0015`) and **Fase 3** (`payments`, migration `0016`) — Mora reads both to compute balances.
- **Stable Eve** (`agent/agent.ts`, `agent/channels/whatsapp.ts`, `agent/trusted-contact-context.ts`) — the pattern and the trusted-contact lock Mora reuses.
- **`src/lib/admin/accounts-receivable.ts`** — the balance engine Mora's read tools wrap; reused as-is with `ELIGIBLE_PLAN_STATUSES` (`accepted`/`in_progress`/`completed`) and non-voided payments only.
- **Meta WhatsApp Cloud API** — template/HSM approval for proactive outbound messaging (external gate).

## Rollback Plan

Mora ships behind a feature flag (mirroring `WHATSAPP_EVE_ENABLED`) so it can be disabled without a redeploy. The outbound cron also sits behind its own flag with a dry-run mode that sends nothing. Rollback is: (1) disable the Mora flag and the cron flag; (2) remove the four tools/skill/instructions section; (3) revert the `payment_intents` migration only after confirming no intents have been written (or keep the table and simply stop writing to it). Since no balance computation is materialized, disabling Mora leaves existing Fase 2/3 data and Eve behavior untouched.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Meta outbound template/HSM gate blocks proactive reminders | High | Feature-flag + dry-run mode; design phase resolves template approval and fallback to human-initiated reminders |
| Greenfield cron: no scheduler infrastructure exists today | Medium | Vercel cron is minimal; keep the job idempotent (dedupe by `whatsapp_message_id`); scope blast radius to one route |
| Closed `whatsapp_intents.intent_type` enum has no balance/payment value | Medium | Under Approach 1 no new intent is required; if one is added, ship the enum-extension migration with the change |
| Balance-eligibility leak (quoting non-accepted amounts) | High | Reuse `ELIGIBLE_PLAN_STATUSES` and non-voided payments exactly as `accounts-receivable` does; read tools return only DB-derived amounts; add tests asserting non-accepted plans are excluded |
| Subagent/unvalidated Eve features leaked into the design | Medium | Approach 1 avoids subagents entirely; re-evaluate only after subagent support is proven against the installed runtime |

## Success Criteria

- [ ] `get-patient-balance` / `list-overdue-balances` read tools return DB-derived amounts with tests; no amount ever passed through the prompt.
- [ ] `payment-collection.md` skill and collections guardrails in the instructions are present and enforced backend-side.
- [ ] Proactive reminder is tested end-to-end (cron + template/HSM where applicable) with a dry-run mode.
- [ ] Disputes, waivers, amount negotiation, and out-of-scope requests escalate to a human via the existing escalation path.
- [ ] `npm run test`, `npm run typecheck` (or `npx tsc --noEmit`), and `npm run build` are green.
- [ ] Delta spec `mora-agent` is written and archived to `openspec/specs/mora-agent/spec.md`.

## Open Decisions (for the design phase)

1. **Agent topology** — same-agent tools (recommended) vs separate agent vs subagent.
2. **Outbound mechanism** — Vercel cron (recommended) vs `pg_cron`; frequency, time window, and Meta template/HSM specifics TBD.
3. **Payment-intent storage** — new `payment_intents` table (recommended) vs reuse `whatsapp_escalations` + note.
