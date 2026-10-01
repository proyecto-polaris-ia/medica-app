# Exploration: issue #67 — Fase 4, agente "Mora" de recordatorios y cobro

## Current State

The codebase already contains Fase 1 (clinical record), Fase 2 (`treatment_plans`, migration `0015`), and Fase 3 (`payments`, migration `0016` + the `accounts-receivable` balance engine). The WhatsApp inbound agent has been migrated to Vercel **Eve** (`agent/`), running behind a feature flag (`WHATSAPP_EVE_ENABLED`) alongside the legacy pipeline. Eve currently has a single agent ("Eva") with 9 tools, 3 skills, and one WhatsApp channel. There is **no** collections/arrears agent, **no** proactive outbound scheduler, and **no** payment-intent storage. Balance computation already exists in `src/lib/admin/accounts-receivable.ts` and is exposed to the admin UI via `/api/admin/accounts-receivable`.

## Affected Areas

- `agent/agent.ts` — Eve agent config (`defineAgent`); the pattern Mora would replicate or extend.
- `agent/instructions.md` — system prompt + guardrails for Eva; Mora needs its own collections guardrails.
- `agent/tools/*.ts` — 9 tools; Mora adds 4 (`get-patient-balance`, `list-overdue-balances`, `register-payment-intent`, `send-payment-reminder`).
- `agent/skills/*.md` — 3 skills; Mora adds `payment-collection.md`.
- `agent/channels/whatsapp.ts` + `agent/trusted-contact-context.ts` — channel + trusted sender identity; Mora reuses `requireTrustedWhatsAppPhone`.
- `src/lib/admin/accounts-receivable.ts` — the balance engine Mora's read tools wrap.
- `supabase/migrations/0015_treatment_plans.sql`, `0016_payments.sql`, `0006_whatsapp_inbound_command_center.sql` — schema for balances and escalations.
- `app/api/whatsapp/webhook/route.ts` — inbound routing (Eve vs legacy); where agent-vs-agent routing would be added.
- `src/lib/whatsapp/client.ts` — `sendWhatsAppTextMessage`; the only outbound primitive (no template support).
- `app/(admin)/accounts-receivable/` and `app/(admin)/whatsapp-command-center/` — admin surfaces for reminders/escalated balances.

## Approaches

1. **Same Eve agent + new tools/skills (extend Eva into Eva+Mora behavior)**
   - Pros: zero routing change; reuses `agent/channels/whatsapp.ts` + trusted contact unchanged; matches existing stage-by-stage SDD pattern; `accounts-receivable` is a drop-in read source.
   - Cons: one instructions.md becomes long; collections vs agenda guardrails co-exist in one prompt; no clean separation of concerns.
   - Effort: Low-Medium.

2. **Separate "Mora" agent with its own `agent/` module, sharing the WhatsApp number, routed at the webhook**
   - Pros: clean guardrail isolation; independent instructions/limits; mirrors "analogous to Eve" framing in the issue.
   - Cons: no precedent for a second agent binding the same WhatsApp route/number in this repo; requires webhook-level routing logic that doesn't exist today; higher risk of double-binding `/eve/v1/*`.
   - Effort: High.

3. **Eve subagent for collections**
   - Pros: Eve docs claim native subagent support (`docs/eve/eve-migration-plan.md` §6.5, §4.3); separation with shared channel.
   - Cons: **unexercised in this codebase** — no `agent/subagents/` dir, no subagent API shim in `agent/eve-shim.d.ts`, no tests; relying on it is speculative.
   - Effort: High (unvalidated against the actual Eve 0.52.x runtime).

## Recommendation

Start with **Approach 1** (same agent + 4 new tools + `payment-collection.md` + a collections guardrail section in `instructions.md`) because it is the lowest-risk path that satisfies every in-scope capability and directly reuses the proven balance engine. Keep the **open decision (a)** explicit: Approach 2/3 are viable follow-ups once subagent support is validated against the installed Eve runtime. For outbound, favor **Vercel cron** hitting a new API route that reads `listAccountsReceivable` and calls `sendWhatsAppTextMessage`, because `vercel.json` is already the deploy config and no Postgres scheduler (`pg_cron`) exists.

## Risks

- Meta outbound policy: proactive reminders are business-initiated and require approved **templates/HSM**; `sendWhatsAppTextMessage` only sends free-form text. This is the single largest external risk.
- No cron infrastructure exists today — the scheduler is greenfield.
- `whatsapp_intents.intent_type` is a closed `CHECK` enum (migration `0006` line 74) with no balance/payment value; adding a Mora intent requires a migration.
- Subagent support is documented but unvalidated in this codebase; betting the design on it is speculative.
- Balance must reuse `ELIGIBLE_PLAN_STATUSES` (`accepted`/`in_progress`/`completed`) and non-voided payments only, or Mora could leak non-accepted amounts (violates the core guardrail).

## Ready for Proposal

Yes. The proposal can be written with high confidence. Resolve the three open decisions in `design` (agent topology, outbound mechanism, intent storage) using the evidence captured below.

---

## Key Findings (evidence)

### 1. Eve agent structure & subagents

- `agent/agent.ts` (36 lines): `defineAgent` with `defineDynamic` model (`createOpenCodeProvider`), `limits.sessionTimeoutMs: 1800000`. No subagent config.
- `agent/instructions.md` (53 lines): "Eva" system prompt with the 5 clinical guardrails, tool guidance, and skills section.
- `agent/tools/*.ts` (9 files): each `import { defineTool } from "eve/tools"` + a `zod` `inputSchema` + `execute`. They wrap deterministic logic from `@/lib/booking/*` and `@/lib/admin/*` via `getSupabaseAdmin()` (e.g. `resolve-patient.ts` lines 4-9, `book-appointment.ts` lines 6-12). **Write tools receive a second `ctx: TrustedContactToolContext` argument** (`escalate-to-human.ts` line 23, `book-appointment.ts` line 107).
- `agent/skills/*.md`: `booking-flow.md`, `clinical-escalation.md`, `knowledge-answers.md`.
- `agent/channels/whatsapp.ts` (77 lines): `chatSdkChannel` from `eve/channels/chat-sdk`, WhatsApp adapter + `createMemoryState`, `streaming: false`, exports `{ bot, channel, send }`; handlers pass `buildTrustedContactAuth`/`buildTrustedContactSendPayload`.
- `agent/eve-shim.d.ts` (61 lines): type shims for `eve`, `eve/tools`, `eve/channels/chat-sdk`, `@chat-adapter/*`, `chat`. Declares only `defineAgent`, `defineTool`, `chatSdkChannel` — **no subagent API**.
- **Subagents: NOT implemented.** `agent/subagents/` does not exist (verified). `docs/eve/eve-migration-plan.md` documents them as optional/native: line 107 (`agent/subagents/` — "Subagentes especializados (opcional)"), lines 184-187 (a `clinical-review` subagent example), and §6.5 lines 781-783 ("Eve soporta subagentes nativamente"). `openspec/specs/eve-framework/spec.md` never mentions subagents.

### 2. Payment/balance data flow

- `supabase/migrations/0015_treatment_plans.sql`: `treatment_plans` (lines 18-32; `status` enum `draft/presented/accepted/in_progress/completed/cancelled`, `total_amount numeric(12,2)`, `accepted_at`, `provider_id NOT NULL`) and `treatment_plan_items` (lines 34-47).
- `supabase/migrations/0016_payments.sql`: `payments` (lines 12-31; `amount numeric(12,2) CHECK (>0)`, `method` enum `cash/card/transfer/other`, `paid_at`, `treatment_plan_id FK SET NULL`, `voided_at`/`voided_by`/`void_reason`).
- `src/lib/admin/accounts-receivable.ts`:
  - `ELIGIBLE_PLAN_STATUSES = ['accepted','in_progress','completed']` (lines 10-14).
  - `buildSummary` (lines 89-149): `balance = Σ eligible plan total − Σ non-voided payments`; per-plan `balance`, `baseDate = accepted_at ?? created_at`, `isPastDue = balanceCents > 0 && daysPastDue > thresholdDays` (line 133).
  - `getPatientReceivableSummary(patientId, { thresholdDays })` (line 190) → `PatientReceivableSummary`.
  - `listAccountsReceivable({ thresholdDays })` (line 262) → all patients, `.filter(row => row.balance > 0)` (line 293), sorted desc.
- Types in `src/lib/admin/types.ts`: `PlanBalance` (327-338), `PatientReceivableSummary` (340-349), `AccountsReceivableRow` (351-355), `Payment` (290-305).
- This is the **exact** engine Mora's `get-patient-balance` (per-patient) and `list-overdue-balances` (list) tools should wrap.

### 3. WhatsApp channel routing & trusted contact

- Inbound routing: `app/api/whatsapp/webhook/route.ts` — signature verify (line 26), then `isEveWhatsAppEnabled(WHATSAPP_EVE_ENABLED)` (line 38) → `forwardToEve` (lines 50-73) proxies to `/eve/v1/whatsapp` (mounted by `withEve` in `next.config.mjs` line 1); else `handleLegacy` (line 75). **Routing is Eve-vs-legacy only; there is no agent-vs-agent routing.**
- Legacy intent types: `src/lib/ai/whatsapp-inbound-agent.ts` lines 5-13 (`inquiry, book_appointment, check_availability, reschedule_request, cancel_request, support, handoff, unknown`), mirrored in `src/types.ts` line 5 and the `whatsapp_intents.intent_type` CHECK (migration `0006` line 74). The legacy orchestrator routes on these (`src/lib/whatsapp/orchestrator.ts` lines 170-188).
- Trusted contact identity: `agent/trusted-contact-context.ts`:
  - `getTrustedPatientPhone` (lines 80-84) reads phone from raw `from`/author.userId/threadId.
  - `buildTrustedContactAuth` (lines 111-129): auth with `trustedPatientPhone`, `principalId = phone`, `principalType: whatsapp_contact`.
  - `selectPatientPhone` (149-166) / `requireTrustedWhatsAppPhone` (168-175): the lock used by `resolve-patient`, `book-appointment`, `escalate-to-human`.
  - DB: `whatsapp_contacts.linked_patient_id` + `resolve_whatsapp_contact_patient_id(phone)` SQL fn (migration `0006` lines 145-151) + trigger `set_whatsapp_contact_linked_patient` (lines 153-179).
- **Mora MUST reuse `requireTrustedWhatsAppPhone` to verify sender identity before revealing any balance.**

### 4. Outbound / scheduled messaging

- **No cron anywhere.** `vercel.json` contains only `{ "framework": "nextjs" }`. Migrations `0001`-`0016` have no `pg_cron`/scheduled job. A repo-wide grep for `cron`/`scheduled`/`pg_cron` matches only `rescheduled` (appointment status) and the npm `scheduler` package — nothing scheduling-related.
- Outbound primitive: `src/lib/whatsapp/client.ts` `sendWhatsAppTextMessage` (lines 41-106) posts `type: text` to Meta Cloud API. **No template/HSM support.**
- The proactive reminder hook is greenfield: Vercel cron (new API route + `vercel.json` `crons`) or `pg_cron`, neither present today.

### 5. Admin UI

- Accounts receivable: `app/(admin)/accounts-receivable/page.tsx` (client) fetches `/api/admin/accounts-receivable?thresholdDays=30` (`THRESHOLD_DAYS = 30`, line 10). Route `app/api/admin/accounts-receivable/route.ts` (`requireUser()` + `listAccountsReceivable`). Shows `balance`, `pastDuePlans`.
- WhatsApp Command Center: `app/(admin)/whatsapp-command-center/layout.tsx` nav (Dashboard, Contactos, Conversaciones, Escalaciones, Knowledge — lines 4-10). Escalations page `app/(admin)/whatsapp-command-center/escalations/page.tsx` (server component reading `getWccEscalationsQueue`). Data layer `src/lib/wcc-escalations.ts` (plus `wcc-dashboard.ts`, `wcc-conversations.ts`, `wcc-contacts.ts`, `wcc-knowledge.ts`, `wcc-client.ts`).
- **Extension points:** a new WCC section for "sent reminders" and "escalated balances" (mirroring the `wcc-escalations` pattern), or augmenting the accounts-receivable page. No reminder table exists today.

### 6. Escalation / payment-intent storage

- `whatsapp_escalations` (migration `0006` lines 84-99): `reason`, `priority` (`low/normal/high/urgent`), `status` (`open/acknowledged/resolved/canceled`), `summary`, `assigned_to`, `message_id`, `intent_id`. **No amount/plan columns.**
- Escalation write path: `src/lib/whatsapp/eve-escalation.ts` `createEveWhatsAppEscalation` (lines 107-192) persists a synthetic inbound event + intent + escalation and sends a human alert via `sendWhatsAppTextMessage`; `store.ts` `createWhatsAppEscalation` (lines 130-135) is the raw insert.
- `payments` (migration `0016`) is the *actual* ledger for manual payments (Fase 3) — not a place for "intent to pay".
- **No `payment_intents` table exists.** Open decision: new table (with `patient_id`, `treatment_plan_id?`, `amount?`, `status`, timestamps) vs reuse `whatsapp_escalations` + a note. Reuse is quick (proven flow, surfaced in WCC, sends human alert) but lacks structured amount/plan; a new table is cleaner but needs a migration + UI + data layer.

### 7. Contradictions / constraints vs the issue's assumptions

- **`whatsapp_intents.intent_type` closed enum** (migration `0006` line 74) has no balance/payment value; a Mora intent requires an enum-extension migration.
- **Proactive messaging is template-gated** by Meta; the current send primitive is free-form text only — the issue's "outbound via cron" assumption underweights this.
- **Balance eligibility**: `accounts-receivable` only counts `accepted`/`in_progress`/`completed` plans and non-voided payments. Mora must reuse this exact eligibility so it never quotes non-accepted amounts (issue guardrail).
- **Naming slip in prior docs**: `openspec/changes/archive/2026-09-29-treatment-plans/design.md` line 52 and its proposal refer to "Fase 3 (mora)"; the real sequence is Fase 3 = payments/delinquency (archived `2026-09-30-payments-delinquency`) and Fase 4 = Mora. The issue's own description is consistent with the code.
- **Config vs preflight**: `openspec/config.yaml` line 2 says `artifact_store: hybrid`, but this session's parent-confirmed preflight pins `openspec` (files only). Files-only was followed.

## Open Decisions (with evidence)

- **(a) Mora topology** — separate agent vs subagent vs same-agent tools.
  - Evidence for same-agent tools: zero routing change; `accounts-receivable` is drop-in; the stage-by-stage SDD precedent (`eve-stage-1..6`). No second channel/route binding needed.
  - Evidence for subagent: documented native in `docs/eve/eve-migration-plan.md` (§6.5, lines 107, 184-187) but **unexercised** — no `agent/subagents/`, no shim, no tests.
  - Evidence for separate agent: cleanest guardrails, but no precedent for two agents on one WhatsApp number/route in this repo.
- **(b) Outbound mechanism** — Vercel cron vs `pg_cron`.
  - Evidence: neither exists; `vercel.json` minimal; `sendWhatsAppTextMessage` is the only send primitive; Meta template/HSM policy is a hard gate.
- **(c) Payment-intent storage** — new `payment_intents` table vs reuse `whatsapp_escalations` + note.
  - Evidence: escalation flow (`whatsapp_escalations` + `createEveWhatsAppEscalation`) is proven and already surfaced in WCC + human alert, but lacks structured amount/plan; the `intent_type` enum has no payment value (migration `0006` line 74).
