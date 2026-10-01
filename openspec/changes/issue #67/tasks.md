# Tasks: Fase 4 — "Mora" payments & arrears agent over WhatsApp (issue #67)

Implements the `mora-agent` delta spec (10 requirements, 26 scenarios) per `design.md`. Strict TDD is active
(`config.yaml` `apply.tdd: true`): every task is written as RED (failing test first) → GREEN (make it pass) →
REFACTOR (clean up) where the design's testing strategy calls for it. Every applicable threat-matrix guardrail
becomes an explicit RED test before its production task. The 5 RED-first guardrail tests are:

1. Non-accepted plans excluded from balance (spec "Balance Inquiry", scenario 4).
2. No balance without trusted phone (spec "Verified Contact Before Balance Disclosure").
3. No PII leak from `list-overdue-balances` (design Decision-3 supporting decision: patient-scoped, never staff-wide).
4. Unauthorized cron → 401 (design threat-matrix guardrail 1).
5. `register-payment-intent` writes no `payments` row (spec "Payment Intent Registration and Escalation", "No money movement").

No changes to `agent/agent.ts` (tools are auto-discovered), `agent/channels/whatsapp.ts`,
`agent/trusted-contact-context.ts`, `app/api/whatsapp/webhook/route.ts`, or the `whatsapp_intents` enum
(design Decision 1/3 "no changes" list). Do NOT touch `/Volumes/Data Coding/Desarrollo/AI-workspace/travelhub-app`.

---

## Phase 1: Schema / Migration (Foundation)

- [x] 1.1 Create `supabase/migrations/0017_payment_intents_reminders.sql` — `payment_intents` table (`patient_id` FK → `patients`, `treatment_plan_id` FK → `treatment_plans` on delete set null, `whatsapp_contact_id` FK → `whatsapp_contacts`, `intent_source` CHECK `('whatsapp','manual')`, `amount numeric(12,2)` CHECK null-or->0, `commitment_text`, `method` CHECK `('cash','card','transfer','other')`, `status` CHECK `('pending','confirmed','fulfilled','cancelled')` default `'pending'`, `notes`, `created_at`, `updated_at`) and `payment_reminders` table (`patient_id`, `treatment_plan_id`, `contact_id`, `reminder_key text not null unique`, `template_name` default `'recordatorio_pago'`, `status` CHECK `('scheduled','sent','skipped','failed')`, `dry_run boolean not null default true`, `balance_at_send numeric(12,2)`, `provider_message_id`, `sent_at`, `error`, timestamps). Add indexes `(patient_id, created_at desc)` + `(status)` on both tables, RLS `enable` + `force`, `revoke all ... from anon/authenticated`, `grant select, insert, update, delete ... to authenticated`, and `*_admin_all` policies for `authenticated` — mirroring the `0006_whatsapp_inbound_command_center.sql` pattern exactly. Verify: `npm run test` (existing suite stays green) + review the file against design §Schema (design.md lines 310-348). Depends: —.

## Phase 2: Data layers + unit tests (RED → GREEN)

- [x] 2.1 (RED) Write `src/lib/payments/__tests__/payment-intents.test.ts` — mock `@/lib/supabase/server` with the query-builder pattern from `src/lib/admin/__tests__/accounts-receivable.test.ts` (read-only pattern reference); assert `createPaymentIntent({patientId, treatmentPlanId?, amount?, commitmentText?, notes?, source})` inserts into `payment_intents` with the exact columns and that **no `payments` table is ever touched**. Verify: `npm run test -- src/lib/payments/__tests__/payment-intents.test.ts` fails RED (module missing). Depends: 1.1.
- [x] 2.2 (GREEN) Create `src/lib/payments/payment-intents.ts` — export `createPaymentIntent` (typed input, `insert({...})` into `payment_intents` via `getSupabaseAdmin()`, throw on error, return the row). Verify: `npm run test -- src/lib/payments/__tests__/payment-intents.test.ts` passes GREEN. Depends: 2.1.
- [x] 2.3 (RED) Write `src/lib/whatsapp/__tests__/client-template.test.ts` — with fetch injection (mirror the `client.ts` `fetchImpl` contract); assert `sendWhatsAppTemplateMessage` POSTs `type: "template"` with `template: { name: 'recordatorio_pago', language: { code: 'es_MX' }, components: [{ type: 'body', parameters: [{ type: 'text', text }] }] }` and returns `{ ok: false, skipped: true }` when `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` are absent. Verify: `npm run test -- src/lib/whatsapp/__tests__/client-template.test.ts` fails RED (export missing). Depends: —.
- [x] 2.4 (GREEN) Modify `src/lib/whatsapp/client.ts` — add `WhatsAppSendTemplateInput` type and `sendWhatsAppTemplateMessage(input, fetchImpl = fetch)` mirroring `sendWhatsAppTextMessage` (same credential resolution, error contract, and `WhatsAppSendResult` return). Verify: `npm run test -- src/lib/whatsapp/__tests__/client-template.test.ts` passes GREEN + `npm run test -- src/lib/whatsapp` (existing whatsapp tests stay green). Depends: 2.3.
- [x] 2.5 (RED) Write `src/lib/payments/__tests__/send-payment-reminder.test.ts` — with mocked `getSupabaseAdmin` and mocked `sendWhatsAppTemplateMessage`; assert: (a) `reminder_key` = `patient:{id}:plan:{planId}:{periodKey}` dedupes (second call with same key → `{ sent: false, skipped: true }`, no send); (b) `dryRun: true` persists a `payment_reminders` row with `dry_run=true` and never calls the send primitive; (c) selection excludes rows with `balance <= 0`, no `phone_e164`, and `opt_in_status = 'opted_out'`. Verify: `npm run test -- src/lib/payments/__tests__/send-payment-reminder.test.ts` fails RED (module missing). Depends: 2.4.
- [x] 2.6 (GREEN) Create `src/lib/payments/send-payment-reminder.ts` — export `sendPaymentReminder(input: SendPaymentReminderInput): Promise<SendPaymentReminderResult>` (build `reminderKey`, skip if key exists, dry-run persist or real `sendWhatsAppTemplateMessage('recordatorio_pago', body params name/balance/days)` then persist `payment_reminders` row + outbound record), plus a pure selection helper over `listAccountsReceivable` rows (past-due plan present, `phone_e164` set, contact not opted-out). Verify: `npm run test -- src/lib/payments/__tests__/send-payment-reminder.test.ts` passes GREEN. Depends: 2.5, 2.4.
- [x] 2.7 (RED) Write `src/lib/wcc-payments.test.ts` — mirror the `wcc-escalations.ts` shape (`isSupabaseConfigured` / `isConfiguredButUnavailable` / rows / page); assert `getWccPaymentsQueue()` reads `payment_intents` (joined patient + contact identity + amount + status) and `getWccRemindersQueue()` reads `payment_reminders` (patient + template + status + `dry_run` + `sent_at`). Verify: `npm run test -- src/lib/wcc-payments.test.ts` fails RED (module missing). Depends: 1.1.
- [x] 2.8 (GREEN) Create `src/lib/wcc-payments.ts` — admin data layer following `src/lib/wcc-escalations.ts` (read-only pattern) and `src/lib/wcc-client.ts`: `getWccPaymentsQueue({page})` + `getWccRemindersQueue({page})`, each returning `isSupabaseConfigured`, `isConfiguredButUnavailable`, paginated rows, `totalCount`/`totalPages`; degrade to empty state when Supabase is unconfigured. Verify: `npm run test -- src/lib/wcc-payments.test.ts` passes GREEN. Depends: 2.7.

## Phase 3: Agent tools (RED → GREEN)

- [x] 3.1 (RED) Write `tests/agent/tools/get-patient-balance.test.ts` — mock `@/lib/supabase/server` with query-builder queues (pattern from `src/lib/admin/__tests__/accounts-receivable.test.ts`, read-only) so eligibility filtering is exercised end-to-end. Assert: (a) guardrail 2 — `execute({}, ctx)` without `trustedPatientPhone` returns `{ success: false, error }` and never queries; (b) guardrail 1 — a `draft`/`presented`/`cancelled` plan is excluded from the quoted balance while `accepted|in_progress|completed` plans are summed; (c) balance is `0` (nothing owed) and credit case surfaces `creditAmount`; (d) the returned `balance` equals `getPatientReceivableSummary` output (amount originates from DB, never from inputs). Verify: `npm run test -- tests/agent/tools/get-patient-balance.test.ts` fails RED (tool missing). Depends: —.
- [x] 3.2 (GREEN) Create `agent/tools/get-patient-balance.ts` — `defineTool` + zod input `{ thresholdDays?: number }` (default 30 via `parseThresholdDays`); `execute(input, ctx: TrustedContactToolContext)`: `requireTrustedWhatsAppPhone(ctx, SECURITY_REFUSAL)` → `findPatientByTrustedPhone` (read-only, no create) → `getPatientReceivableSummary(patient.id, { thresholdDays })` → return `{ success, patientFound, patientName, balance, totalEligibleAmount, paidAmount, creditAmount, lastPaymentAt, planBalances[], message }` per design §Tool 1. Spanish de México messages, warm tone; mirror `agent/tools/list-my-appointments.ts` (read-only pattern). Verify: `npm run test -- tests/agent/tools/get-patient-balance.test.ts` passes GREEN. Depends: 3.1.
- [x] 3.3 (RED) Write `tests/agent/tools/list-overdue-balances.test.ts` — assert: (a) guardrail 3 — the tool returns ONLY the trusted caller's own `isPastDue` plans; a fixture with two patients' overdue plans must never surface the other patient's rows; (b) untrusted ctx → `{ success: false, error }`; (c) zero-balance / not-past-due plans excluded. Verify: `npm run test -- tests/agent/tools/list-overdue-balances.test.ts` fails RED (tool missing). Depends: —.
- [x] 3.4 (GREEN) Create `agent/tools/list-overdue-balances.ts` — `defineTool` + zod `{ thresholdDays? }`; same trusted-phone → patient → `getPatientReceivableSummary` flow, then `planBalances.filter(p => p.isPastDue)`; return `{ success, patientFound, overduePlans[], message }`. NEVER call `listAccountsReceivable` (staff-wide, PII leak — admin API only). Verify: `npm run test -- tests/agent/tools/list-overdue-balances.test.ts` passes GREEN. Depends: 3.3.
- [x] 3.5 (RED) Write `tests/agent/tools/register-payment-intent.test.ts` — mock `@/lib/supabase/server` (query-builder queues for `treatment_plans` + `payment_intents`) and mock `@/lib/whatsapp/eve-escalation` (`createEveWhatsAppEscalation`); assert: (a) guardrail 5 — `register-payment-intent` inserts a `payment_intents` row AND **never touches the `payments` table**; (b) `createEveWhatsAppEscalation` called with `{ patientPhone, reason: 'payment_intent', summary, intent: 'support' }`; (c) `treatmentPlanName` resolving to a `draft`/`presented` plan is rejected (`treatment_plan_id: null` + note); (d) no trusted phone → `{ success: false, error }`, no inserts. Verify: `npm run test -- tests/agent/tools/register-payment-intent.test.ts` fails RED (tool missing). Depends: 2.2.
- [x] 3.6 (GREEN) Create `agent/tools/register-payment-intent.ts` — `defineTool` + zod input per design §Tool 3 (`amount?`, `treatmentPlanName?`, `commitment?`, `method?`, `notes?`, `trustedContactSource`, `trustedPatientPhone`); `execute`: `selectPatientPhone(input, msg, ctx)` → `findPatientByTrustedPhone` (read-only) → `resolveEligiblePlan(patient.id, name)` (only `accepted|in_progress|completed`; ambiguous → null + note) → `createPaymentIntent({ patientId, treatmentPlanId: planId, amount, commitmentText: commitment, notes, source: 'whatsapp' })` → `createEveWhatsAppEscalation({ patientPhone, reason: 'payment_intent', summary, intent: 'support' })` → return `{ success, intent: { id, status: 'pending' }, escalation: { id, created }, humanAlert, message }`. No money movement, no payment links, never marks anything paid. Verify: `npm run test -- tests/agent/tools/register-payment-intent.test.ts` passes GREEN. Depends: 3.5, 2.2.

## Phase 4: Skill + instructions (agent behavior)

- [x] 4.1 Create `agent/skills/payment-collection.md` — procedure in Spanish de México (neutral/professional), following the structure of `agent/skills/clinical-escalation.md` (read-only pattern): (1) intent detection — balance question → use `get-patient-balance`; arrears summary → `list-overdue-balances`; intent-to-pay / discount / waiver / dispute / new-price request → `register-payment-intent` + escalate; (2) reveal balances ONLY from tool output, never from the prompt; (3) guardrails: no new-price quoting, no negotiation, no discounts/waivers, no payment links, no money movement; (4) escalation templates for dispute vs intent-to-pay with DB-derived balance as context; (5) tone: warm, professional, no pressure or shame. Verify: `npm run test` (suite stays green; content only) + review against spec requirements 6-9. Depends: 3.6.
- [x] 4.2 Modify `agent/instructions.md` — add a `## Colecciones / Mora` guardrail section (delegating procedure to `payment-collection.md`, mirroring how `clinical-escalation` is structured): balance-vs-new-price distinction (DB-derived balances of `accepted|in_progress|completed` plans MAY be stated; new prices / non-accepted plans / invented amounts NEVER), tool guidance for the 3 new tools, verified-contact rule before any balance reveal, and no-negotiation rule. Also add the `payment-collection.md` pointer under the `## Skills` list. Verify: `npm run test` + `npx tsc --noEmit` (docs only; suite stays green). Depends: 4.1.

## Phase 5: Cron route + outbound wiring

- [ ] 5.1 (RED) Write `app/api/cron/payment-reminders/route.test.ts` — with env stubbing (`CRON_SECRET`, `MORA_REMINDERS_ENABLED`, `MORA_REMINDERS_DRY_RUN`) and mocked `sendPaymentReminder` / `listAccountsReceivable`; assert: (a) guardrail 4 — request without `Authorization: Bearer <CRON_SECRET>` (or wrong secret) → 401 and NO work performed (no selection, no sends); (b) `MORA_REMINDERS_ENABLED` falsy → 200 `{ skipped: true }`, no sends; (c) enabled + dry-run → 200 with `{ sent: 0, skipped, dryRun: true }` and dry-run rows persisted. Verify: `npm run test -- app/api/cron/payment-reminders/route.test.ts` fails RED (route missing). Depends: 2.6.
- [ ] 5.2 (GREEN) Create `app/api/cron/payment-reminders/route.ts` — `export const dynamic = 'force-dynamic'`; `POST`: reject 401 unless `Authorization: Bearer` matches `CRON_SECRET`; skip (200 `{ skipped: true }`) when `MORA_REMINDERS_ENABLED` is falsy; else `listAccountsReceivable({ thresholdDays })` → filter `pastDuePlans.length > 0 && patientPhoneE164 && contact not opted_out` → per patient/plan compute weekly `periodKey` + `reminderKey` → skip existing keys → `MORA_REMINDERS_DRY_RUN` (default `true`) persists dry-run rows / else `sendPaymentReminder` → 200 `{ sent, skipped, dryRun }`. Read flags from env (Vercel project / local env config — no repo file). Verify: `npm run test -- app/api/cron/payment-reminders/route.test.ts` passes GREEN. Depends: 5.1, 2.6.
- [ ] 5.3 Modify `vercel.json` — add `"crons": [{ "path": "/api/cron/payment-reminders", "schedule": "0 15 * * *" }]` (09:00 `America/Mexico_City`, UTC-6 fixed — design Decision 2). Verify: `npm run build` (route compiles; crons entry validated at deploy) + entry matches design §Decision 2. Depends: 5.2.

## Phase 6: Admin UI (WhatsApp Command Center)

- [ ] 6.1 Create `app/(admin)/whatsapp-command-center/payments/page.tsx` — server component, `export const dynamic = 'force-dynamic'`; two sections via `getWccPaymentsQueue()` + `getWccRemindersQueue()` from `src/lib/wcc-payments.ts`: "Intenciones de pago" (patient identity, DB-derived amount, status, created time) and "Recordatorios" (patient, template, status, `dry_run` badge, `sent_at`); reuse `WccEmptyState` / `WccNotice` from `app/(admin)/whatsapp-command-center/components.tsx` (read-only) and `formatRelativeTime` from `src/lib/date-format.ts` (read-only); mirror `app/(admin)/whatsapp-command-center/escalations/page.tsx` (read-only pattern). Spanish de México UI copy. Verify: `npx tsc --noEmit` + `npm run build`. Depends: 2.8.
- [ ] 6.2 Modify `app/(admin)/whatsapp-command-center/layout.tsx` — add nav entry `{ href: '/whatsapp-command-center/payments', label: 'Pagos' }` to the `wccNav` array. Verify: `npm run build` + `npx tsc --noEmit`. Depends: 6.1.

## Phase 7: Full verification + cleanup

- [ ] 7.1 Run the full unit suite — `npm run test` (all RED/GREEN tests pass; existing suites stay green). Depends: 1.1-6.2.
- [ ] 7.2 Typecheck — `npx tsc --noEmit` clean. Depends: 7.1.
- [ ] 7.3 Lint — run `npm run lint` if the script exists; the repo currently defines no `lint` script (package.json `scripts`), so if npm errors with "Missing script", record the task as not-applicable and rely on 7.2 + 7.4. Depends: 7.2.
- [ ] 7.4 Build — `npm run build` (Next.js production build incl. cron route + WCC page). Depends: 7.3.
- [ ] 7.5 (OPTIONAL, design table row "Modify (optional)") Modify `src/lib/admin/accounts-receivable.ts` — export `ELIGIBLE_PLAN_STATUSES` (currently module-private, line 10) if the reminder sender should re-assert plan eligibility at the edge; otherwise leave unchanged. Verify: `npm run test -- src/lib/payments` + `npx tsc --noEmit`. Depends: 2.6.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2,000 – 2,400 (additions + deletions, hand-written; no generated files) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Unit 1 → Unit 2 → Unit 3 → Unit 4 (below) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception (single PR with maintainer approval); units remain usable as `stacked-to-main` chained PRs if the user prefers |
| Decision needed before apply | Yes |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High
```

**Decision**: the change spans 15+ files and ~2,000–2,400 changed lines — far over the 400-line review budget.
Delivery strategy is `single-pr`, so a maintainer **`size:exception`** must be granted before `sdd-apply` proceeds,
OR the user may opt into chained PRs instead (see work units). The default recommended option is
**size-exception with the work units applied as one PR** (rollback of any unit is independent — see boundaries
below); if the team prefers small reviews, apply units 1–4 as chained PRs stacked to main in order.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Schema + data layers: migration `0017`, `payment-intents.ts`, `sendWhatsAppTemplateMessage`, `send-payment-reminder.ts`, `wcc-payments.ts` (+ unit tests) | PR 1 | `npm run test -- src/lib/payments src/lib/whatsapp/__tests__/client-template.test.ts src/lib/wcc-payments.test.ts` | N/A — mocked-Supabase unit tests only; no live service required | Revert migration `0017` + delete `src/lib/payments/*` + `src/lib/wcc-payments.ts`; agent and admin surfaces untouched |
| 2 | Agent tools + behavior: `get-patient-balance.ts`, `list-overdue-balances.ts`, `register-payment-intent.ts`, `payment-collection.md`, `instructions.md` (+ guardrail RED tests) | PR 2 | `npm run test -- tests/agent/tools/get-patient-balance.test.ts tests/agent/tools/list-overdue-balances.test.ts tests/agent/tools/register-payment-intent.test.ts` | `npm run whatsapp:simulate` with a trusted-contact fixture (simulator script `scripts/whatsapp-simulate-inbound.mjs` is read-only) | Delete the 3 tools + `agent/skills/payment-collection.md` + revert the instructions section; tables/data layers stay |
| 3 | Cron/outbound: `app/api/cron/payment-reminders/route.ts` (+ auth/dry-run tests), `vercel.json` crons entry | PR 3 | `npm run test -- app/api/cron/payment-reminders/route.test.ts` | `curl -X POST http://localhost:3001/api/cron/payment-reminders -H "Authorization: Bearer $CRON_SECRET"` with `MORA_REMINDERS_DRY_RUN=true` | Set `MORA_REMINDERS_ENABLED=false` + remove the route + remove the `vercel.json` crons entry |
| 4 | Admin UI: `whatsapp-command-center/payments/page.tsx`, nav entry in `layout.tsx` | PR 4 | `npx tsc --noEmit && npm run build` | `npm run dev` then open `http://localhost:3001/whatsapp-command-center/payments` | Delete the payments page + nav entry; no other surface affected |

For `feature-branch-chain` usage: PR #2 base = PR #1 branch, PR #3 base = PR #2 branch, PR #4 base = PR #3 branch
(only the tracker merges to main); if a child PR shows the previous PR's diff, retarget before review.