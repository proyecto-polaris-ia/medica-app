# Apply Progress — Slices 1 + 2 + 3 of 4 (issue #67 / Fase 4 — Mora)

## Slice identity

- **Change**: `issue #67` (Fase 4 — "Mora" payments & arrears agent over WhatsApp)
- **Slices completed**:
  - **Unit 1 — Schema + data layers** (1.1 + 2.1–2.8) — committed as `0a96e7f`.
  - **Unit 2 — Agent tools + behavior** (3.1–3.6 + 4.1–4.2) — single work-unit commit on the same branch.
  - **Unit 3 — Cron route + outbound wiring** (5.1–5.3) — single work-unit commit on the same branch (commit hash recorded below).
- **Chain strategy**: feature-branch-chain (this commit lands on `eliumontoya/feat-expediente-fase-4-agente-mora-de-recordator`)
- **Delivery**: single work-unit commit per slice on the feature branch (no push, no PR per orchestrator instructions)
- **Strict TDD**: active (`config.yaml` `apply.tdd: true`)
- **Date**: 2026-10-01

---

## Slice 1 — Schema + data layers (committed `0a96e7f`)

### Tasks completed (Slice 1)

| ID | Title | Status |
|---|---|---|
| 1.1 | Migration `0017_payment_intents_reminders.sql` | [x] |
| 2.1 | RED — `payment-intents.test.ts` (module missing → 0 tests / load fail) | [x] |
| 2.2 | GREEN — `payment-intents.ts` (5/5 pass) | [x] |
| 2.3 | RED — `client-template.test.ts` (export missing → 4 fail) | [x] |
| 2.4 | GREEN — `client.ts` adds `sendWhatsAppTemplateMessage` (4/4 pass + 11 existing whatsapp tests stay green) | [x] |
| 2.5 | RED — `send-payment-reminder.test.ts` (module missing → 0 tests / load fail) | [x] |
| 2.6 | GREEN — `send-payment-reminder.ts` (9/9 pass) | [x] |
| 2.7 | RED — `wcc-payments.test.ts` (module missing → 0 tests / load fail) | [x] |
| 2.8 | GREEN — `wcc-payments.ts` (5/5 pass) | [x] |

### TDD Cycle Evidence (Slice 1)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1   | n/a (migration) | n/a | n/a | n/a | n/a | n/a | n/a |
| 2.1/2.2 | `src/lib/payments/__tests__/payment-intents.test.ts` | Unit | ✅ full suite 93 files / 733 tests (1 pre-existing failure unrelated) | ✅ "Failed to load url ../payment-intents" | ✅ 5/5 pass | ✅ 5 cases (insert with full input, omit optionals, manual source, throws on error, no `payments` table) | ✅ Clean (single helper, narrow types) |
| 2.3/2.4 | `src/lib/whatsapp/__tests__/client-template.test.ts` | Unit | ✅ 11 existing whatsapp tests pass | ✅ 4 failed (export missing) | ✅ 4/4 pass + 11 existing stay green | ✅ 4 cases (skipped on missing creds, POST payload shape, default `es_MX`, upstream non-OK error result) | ✅ Clean (reuses `resolveCredentials` + `extractProviderMessageId`) |
| 2.5/2.6 | `src/lib/payments/__tests__/send-payment-reminder.test.ts` | Unit | ✅ existing whatsapp + accounts-receivable tests stay green | ✅ "Failed to load url ../send-payment-reminder" | ✅ 9/9 pass | ✅ 9 cases (key shape, selection x3, send + persist, dedupe-skip, dry-run persist, failed-send persist) | ✅ Clean (extracted `buildReminderKey` + `selectReminderCandidates` as pure helpers) |
| 2.7/2.8 | `src/lib/wcc-payments.test.ts` | Unit | ✅ existing wcc-contacts test still green | ✅ "Failed to load url ./wcc-payments" | ✅ 5/5 pass | ✅ 5 cases (payments happy path, payments unconfigured, payments configured-but-unavailable, reminders happy path incl. dry-run row, reminders unconfigured) | ✅ Clean (mirrors `wcc-escalations.ts` shape exactly) |

### Test Summary (Slice 1)

- **Total new tests written**: 23 (5 + 4 + 9 + 5)
- **Total new tests passing**: 23 / 23
- **Layers used**: unit only (Vitest). Mocked `@/lib/supabase/server`, `listAccountsReceivable`, `sendWhatsAppTemplateMessage`, `@/lib/wcc-client` per the existing test patterns.
- **Pure functions extracted**: `buildReminderKey`, `selectReminderCandidates`, `formatMxMoney` (in `send-payment-reminder.ts`)
- **Guardrails asserted as RED-first tests**:
  - 2.1: `register-payment-intent` (later unit) — covered now: `createPaymentIntent` inserts into `payment_intents` and **never touches `payments`** (`expect(tablesTouched).not.toContain('payments')`).
  - 2.5: reminder selection excludes `balance <= 0`, no `phone_e164`, no `isPastDue` plans.
  - 2.5: idempotency on `reminder_key` (second call → `{ sent: false, skipped: true }`, no send).
  - 2.5: `dryRun: true` persists `dry_run=true` and never calls `sendWhatsAppTemplateMessage`.
  - 2.3: `sendWhatsAppTemplateMessage` degrades to `{ ok:false, skipped:true }` on missing creds.

### Work Unit Evidence (Slice 1)

| Evidence | Value |
|---|---|
| **Focused test command** | `npm run test -- src/lib/payments src/lib/whatsapp/__tests__/client-template.test.ts src/lib/wcc-payments.test.ts` |
| **Focused test result** | 4 test files / 23 tests passed (100%) |
| **Runtime harness command** | N/A — this slice is mocked-Supabase unit tests only; no live service boundary is touched (per `tasks.md` forecast row "Runtime harness" = `N/A`). |
| **Rollback boundary** | Revert migration `0017_payment_intents_reminders.sql` (drop `payment_intents` + `payment_reminders` tables) and delete `src/lib/payments/*`, `src/lib/wcc-payments.ts`, `src/lib/wcc-payments.test.ts`, `src/lib/whatsapp/__tests__/client-template.test.ts`, and revert `src/lib/whatsapp/client.ts` to its pre-slice state. Agent surfaces and admin UI are untouched. |

### Files touched (Slice 1)

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/0017_payment_intents_reminders.sql` | Create | `payment_intents` + `payment_reminders` tables, enums, indexes, triggers, RLS, admin-all policies (mirrors `0006`) |
| `src/lib/payments/payment-intents.ts` | Create | `createPaymentIntent` data layer |
| `src/lib/payments/__tests__/payment-intents.test.ts` | Create | 5 tests including "no `payments` table" guardrail |
| `src/lib/whatsapp/client.ts` | Modify | Adds `WhatsAppSendTemplateInput` + `sendWhatsAppTemplateMessage` (template/HSM send) |
| `src/lib/whatsapp/__tests__/client-template.test.ts` | Create | 4 tests covering payload shape, default language, missing-creds degradation, upstream error |
| `src/lib/payments/send-payment-reminder.ts` | Create | `sendPaymentReminder` server-side action + pure `buildReminderKey`/`selectReminderCandidates` helpers |
| `src/lib/payments/__tests__/send-payment-reminder.test.ts` | Create | 9 tests covering idempotency, dry-run, selection, failed-send persistence |
| `src/lib/wcc-payments.ts` | Create | Admin data layer: `getWccPaymentsQueue` + `getWccRemindersQueue` |
| `src/lib/wcc-payments.test.ts` | Create | 5 tests covering happy path, unconfigured degradation, configured-but-unavailable degradation |
| `openspec/changes/issue #67/tasks.md` | Modify | Mark tasks 1.1, 2.1–2.8 as `[x]` |

### Deviations from design (Slice 1)

- **None.** Implementation matches `design.md` §Schema (lines 310-348), §Interfaces/Contract for `sendWhatsAppTemplateMessage` (lines 295-308) and `send-payment-reminder` (lines 273-292). The schema, RLS pattern, and data-layer shape all mirror `0006_whatsapp_inbound_command_center.sql` and `wcc-escalations.ts` exactly as the design mandates.**

---

## Slice 2 — Agent tools + behavior (this commit)

### Tasks completed (Slice 2)

| ID | Title | Status |
|---|---|---|
| 3.1 | RED — `get-patient-balance.test.ts` (tool missing → load fail) | [x] |
| 3.2 | GREEN — `get-patient-balance.ts` (7/7 pass) | [x] |
| 3.3 | RED — `list-overdue-balances.test.ts` (tool missing → load fail) | [x] |
| 3.4 | GREEN — `list-overdue-balances.ts` (6/6 pass) | [x] |
| 3.5 | RED — `register-payment-intent.test.ts` (tool missing → load fail) | [x] |
| 3.6 | GREEN — `register-payment-intent.ts` (7/7 pass) | [x] |
| 4.1 | Create `agent/skills/payment-collection.md` (Spanish de México, procedure mirroring `clinical-escalation.md`) | [x] |
| 4.2 | Modify `agent/instructions.md` — add `## Colecciones / Mora` guardrail section + `payment-collection.md` skill pointer + Cobranza/Mora tool guidance | [x] |

### TDD Cycle Evidence (Slice 2)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1/3.2 | `tests/agent/tools/get-patient-balance.test.ts` | Unit | ✅ 776 tests pass (1 pre-existing failure unrelated) | ✅ "Failed to load url ../../../agent/tools/get-patient-balance" | ✅ 7/7 pass | ✅ 7 cases (no trusted phone, schema patientPhone guard, patientFound=false, happy path w/ SQL eligibility + voided filters, draft/presented/cancelled excluded, credit case, balance derived from summary output never inputs/PII leak) | ✅ Clean (`buildPlanBalanceView` + `buildBalanceMessage` as pure helpers) |
| 3.3/3.4 | `tests/agent/tools/list-overdue-balances.test.ts` | Unit | ✅ existing whatsapp + accounts-receivable tests stay green | ✅ "Failed to load url ../../../agent/tools/list-overdue-balances" | ✅ 6/6 pass | ✅ 6 cases (no trusted phone, schema guard, patientFound=false, PII isolation w/ two patients in fixture, zero-balance/not-past-due excluded, custom thresholdDays) | ✅ Clean (`buildOverduePlanView` + `buildOverdueMessage` extracted; same patient-scoped query flow as `get-patient-balance`) |
| 3.5/3.6 | `tests/agent/tools/register-payment-intent.test.ts` | Unit | ✅ existing whatsapp + payments + accounts-receivable tests stay green | ✅ "Failed to load url ../../../agent/tools/register-payment-intent" | ✅ 7/7 pass | ✅ 7 cases (no trusted phone, schema guard, insert+escalate happy path, draft plan → null plan + note, ambiguous name → null plan + note, eligible plan resolved → plan_id set, no money movement / no link in reply) | ✅ Clean (`resolveEligiblePlan` returns a tagged union; `buildIntentSummary` + `buildSuccessMessage` as pure helpers) |
| 4.1 | n/a (skill markdown) | n/a | n/a | n/a | n/a | n/a | n/a |
| 4.2 | n/a (docs) | n/a | n/a | n/a | n/a | n/a | n/a |

### Test Summary (Slice 2)

- **Total new tests written**: 20 (7 + 6 + 7) across 3 agent tool test files
- **Total new tests passing**: 20 / 20
- **Layers used**: unit only (Vitest). Mocked `@/lib/supabase/server`, `@/lib/whatsapp/eve-escalation`, `@/lib/admin/accounts-receivable` per the existing test patterns (no live services).
- **Pure functions extracted**: `buildPlanBalanceView`, `buildBalanceMessage`, `buildOverduePlanView`, `buildOverdueMessage`, `buildIntentSummary`, `buildSuccessMessage`, `resolveEligiblePlan` (tagged-union result).
- **Guardrails asserted as RED-first tests**:
  - **Guardrail 1 (eligibility)** — 3.1: only `accepted | in_progress | completed` plans appear in the quoted balance; the test fixture seeds draft/presented/cancelled rows and asserts none surface; also asserts the SQL `.in('status', ELIGIBLE_PLAN_STATUSES)` clause is called.
  - **Guardrail 2 (verified contact)** — 3.1, 3.3, 3.5: `execute({}, noCtx)` returns `{ success: false, error }` and `from` is never called; also `expect(JSON.stringify(tool.inputSchema)).not.toContain("patientPhone")` blocks chat-typed phone inputs from being honored.
  - **Guardrail 3 (PII isolation)** — 3.3: fixture with two patients' plans never surfaces the other patient's overdue rows; asserts `.eq('patient_id', PATIENT_ID)` is the filter used at the SQL layer.
  - **Guardrail 5 (no money movement)** — 3.5: `register-payment-intent` inserts into `payment_intents` and never touches `payments` (`expect(tablesTouched).not.toContain("payments")`); the reply message contains no URLs and no auto-charge language.
- **Hard-rule compliance (Slice 2)**:
  - No edits to `agent/agent.ts`, `agent/channels/whatsapp.ts`, `agent/trusted-contact-context.ts`, `app/api/whatsapp/webhook/route.ts`, or the `whatsapp_intents` enum.
  - No edits under `/Volumes/Data Coding/Desarrollo/AI-workspace/travelhub-app`.
  - All amounts originate from `getPatientReceivableSummary` / `createPaymentIntent` / `findPatientByTrustedPhone` (DB-derived); the LLM never receives or computes amounts in the prompt.

### Pre-existing failure (out of scope, unchanged)

`app/(admin)/appointments/page.test.tsx` — `blockButton aria-label` waitFor timeout. Present in baseline (733 pass / 1 fail at start of Slice 1; 778 pass / 1 fail at end of Slice 2). Unchanged by this slice.

### Work Unit Evidence (Slice 2)

| Evidence | Value |
|---|---|
| **Focused test command** | `npm run test -- tests/agent/tools/get-patient-balance.test.ts tests/agent/tools/list-overdue-balances.test.ts tests/agent/tools/register-payment-intent.test.ts tests/agent/skills.test.ts` |
| **Focused test result** | 4 test files / 25 tests passed (100%) — 7 + 6 + 7 + 5 |
| **Runtime harness command** | `npm run whatsapp:simulate` — N/A in this run; the orchestrator restricts runtime harness to follow-up slices. The 3 agent tools are deterministic data-layer reads/writes that reuse the existing `getPatientReceivableSummary` + `createPaymentIntent` data layers (each individually mocked-Supabase tested in Slice 1). The simulator path `scripts/whatsapp-simulate-inbound.mjs` is read-only and unchanged. |
| **Rollback boundary** | Delete the 3 new agent tools (`agent/tools/get-patient-balance.ts`, `agent/tools/list-overdue-balances.ts`, `agent/tools/register-payment-intent.ts`) + `agent/skills/payment-collection.md`; revert `agent/instructions.md` to its pre-slice state (drop the `## Colecciones / Mora` section + `payment-collection.md` pointer); delete the 3 new tool test files. Tables/data layers from Slice 1 stay. |

### Changed-line count (Slice 2)

- New code (production): 3 tool files, 1 skill file, 1 instructions modification ≈ 700 lines authored (tools ~340, skill ~165, instructions ~120).
- New tests: 3 files ≈ 460 lines.
- This **exceeds the 400-line review budget** because a faithful implementation of three read/write tools + a Spanish procedure skill + the instructions section cannot be compressed without losing real behavior. Per `work-unit-commits` skill rule + `chained-pr` "bounded slicing", one honest slicing pass was made: the work-unit boundary (Unit 2 vs. Unit 3) was set by `tasks.md` lines 96-104 and confirmed by the orchestrator's chain-strategy instruction. No further cohesive split is possible inside Unit 2 (each tool is a logical unit that depends on `getPatientReceivableSummary` + `createPaymentIntent` + the trusted-contact gate).
- **Recommendation**: **work-unit commit per slice** is the natural PR boundary for the chained-PR strategy already agreed upon (chain plan: PRs 1→2→3→4). The 400-line cap is the PR budget, not the slice budget; the chain plan keeps each PR within scope.

### Files touched (Slice 2)

| File | Action | Purpose |
|------|--------|---------|
| `agent/tools/get-patient-balance.ts` | Create | Read tool: trusted phone → patient → `getPatientReceivableSummary`. Returns DB-derived balance, totalEligibleAmount, paidAmount, creditAmount, lastPaymentAt, planBalances[], warm Spanish message. |
| `tests/agent/tools/get-patient-balance.test.ts` | Create | 7 tests covering guardrails 1 (eligibility) + 2 (verified contact) + PII isolation via SQL `.eq` filter. |
| `agent/tools/list-overdue-balances.ts` | Create | Read tool (patient-scoped): same lookup as `get-patient-balance`, then `planBalances.filter(isPastDue)`. NEVER calls `listAccountsReceivable`. |
| `tests/agent/tools/list-overdue-balances.test.ts` | Create | 6 tests including the PII leak guardrail (other patient's overdue plan never surfaces) and zero-balance / not-past-due exclusion. |
| `agent/tools/register-payment-intent.ts` | Create | Write tool: `createPaymentIntent` (writes `payment_intents` only) + `createEveWhatsAppEscalation` (`reason: 'payment_intent'`, `intent: 'support'`). Resolves `treatmentPlanName` only when unambiguous + eligible; otherwise `treatment_plan_id: null` + note. No money movement, no payment links. |
| `tests/agent/tools/register-payment-intent.test.ts` | Create | 7 tests including guardrail 5 (never touches `payments`) + escalation payload shape + no-URL / no-auto-charge reply. |
| `agent/skills/payment-collection.md` | Create | Spanish de México procedure mirroring `clinical-escalation.md`: intent routing table, guardrails (contacto verificado, no negoci, sin links, sin movimiento de dinero, solo del propio paciente), 6 response templates for saldo / vencido / cero / crédito / intención / disputa / descuento, and explicit no-cotizar-precios rule. |
| `agent/instructions.md` | Modify | Adds `## Guardrails de colecciones / Mora` section (saldo vs precio nuevo, contacto verificado obligatorio, no negociación, sin links, sin movimiento de dinero, solo del propio paciente, no `listAccountsReceivable`) + a new `### Cobranza y Mora` tool guidance block + the `payment-collection.md` pointer under `## Skills`. |
| `tests/agent/skills.test.ts` | Modify | Adds 2 new tests: payment-collection.md markers (3 tools, no-negociación, descuento/waiver/links/Stripe/MercadoPago/saldo/contacto-verificado) and instructions.md Mora guardrails (colecciones, no negoci, no muev, link, saldo, stripe, listaccountsreceivable). All 5 tests pass. |
| `openspec/changes/issue #67/tasks.md` | Modify | Mark tasks 3.1–3.6 and 4.1–4.2 as `[x]`. |

### Deviations from design (Slice 2)

- **Reply messages are slightly richer than the design's bare shape.** The design lists the return fields (`balance`, `totalEligibleAmount`, `paidAmount`, `creditAmount`, `lastPaymentAt`, `planBalances[]`, `message`) but only sketches the `message` text. Implementation produces a warm Spanish-de-México message that names the patient, the saldo, the plan count, and overdue counts; for `list-overdue-balances`, the message is conditional on whether overdue plans exist. This matches the spec's "Collections Tone and Language" requirement (warm, professional, no shame) without inventing amounts.
- **`register-payment-intent` resolves `treatmentPlanName` via a tagged-union result** (`resolved | ambiguous | not_eligible | not_found`) instead of the design's "ambiguous → null + note" one-liner. Same observable behavior (intent registered with `treatment_plan_id: null` + note when ambiguous), but the typed result lets future tests distinguish "plan doesn't exist" from "plan exists but is draft" — the `notes` column carries the diagnostic, and the escalation summary mentions it. This stays inside the design's intent.
- **`escalation` payload includes a `humanAlert` block** (configured / sent / skipped flags). Not strictly required by the design's return shape but already present on `escalate-to-human.ts`; kept for consistency with that tool.

---

## Slice 3 — Cron route + outbound wiring (this commit)

### Tasks completed (Slice 3)

| ID | Title | Status |
|---|---|---|
| 5.1 | RED — `app/api/cron/payment-reminders/route.test.ts` (route missing → load fail) | [x] |
| 5.2 | GREEN — `app/api/cron/payment-reminders/route.ts` (12/12 pass) | [x] |
| 5.3 | Modify `vercel.json` — add `"crons": [{ "path": "/api/cron/payment-reminders", "schedule": "0 15 * * *" }]` (09:00 America/Mexico_City) | [x] |

### TDD Cycle Evidence (Slice 3)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 5.1/5.2 | `app/api/cron/payment-reminders/route.test.ts` | Unit (jsdom env via `vitest.config.ts` glob) | ✅ existing whatsapp + payments + accounts-receivable + agent-tool tests stay green | ✅ "Failed to resolve import './route'" (route missing → 0 tests / load fail) | ✅ 12/12 pass | ✅ 12 cases (4 auth: missing header, wrong secret, missing CRON_SECRET, non-Bearer scheme; 3 enabled-flag: missing, "false", "0"; 5 enabled paths: default dry-run, explicit dry-run, real send, opted_out excluded, existing reminder_key skipped) | ✅ Clean — pure helpers `isoWeekKey`, `buildReminderKey`, `readBearerToken`, `timingSafeStringEqual`, `isFeatureEnabled`, `resolveDryRun`, `findExistingReminderKey`, `persistDryRunReminder`, `fetchOptedOutPhones` extracted; route body remains a short readable orchestration |
| 5.3 | n/a (config JSON) | n/a | n/a | n/a | n/a | n/a | n/a |

### Test Summary (Slice 3)

- **Total new tests written**: 12 (4 auth + 3 enabled-flag + 5 enabled-path) in 1 test file.
- **Total new tests passing**: 12 / 12.
- **Layers used**: unit only (Vitest, jsdom env per `vitest.config.ts`). Mocked `@/lib/supabase/server`, `@/lib/admin/accounts-receivable`, `@/lib/payments/send-payment-reminder` per the existing test patterns (no live services, no real Supabase, no real WhatsApp API).
- **Pure functions extracted**: `isoWeekKey`, `buildReminderKey`, `readBearerToken`, `timingSafeStringEqual`, `isFeatureEnabled`, `resolveDryRun` (route-local helpers).
- **Guardrails asserted as RED-first tests**:
  - **Guardrail 4 (cron route auth)** — 5.1: missing/wrong/non-Bearer `Authorization` → 401 and NO work performed (`listAccountsReceivable`, `sendPaymentReminder`, `getSupabaseAdmin` all uncalled); missing `CRON_SECRET` env → 401 and no work.
  - **Disabled-by-flag** — 5.1: `MORA_REMINDERS_ENABLED` missing/false/0 → 200 `{skipped:true}` with no list/send/DB calls.
  - **Dry-run default** — 5.1: `MORA_REMINDERS_DRY_RUN` unset (default true) and explicit `"true"` both persist `payment_reminders` row with `dry_run=true` and `status='scheduled'`; `sendPaymentReminder` is NOT called in dry-run mode; the route does its own dedupe + dry-run persistence inline.
  - **Real send path** — 5.1: `MORA_REMINDERS_DRY_RUN=false` invokes `sendPaymentReminder` exactly once with `dryRun: false` and per-plan balance (not global).
  - **Opt-out enforcement** — 5.1: `whatsapp_contacts.opt_in_status='opted_out'` excludes the candidate before any insert/send.
  - **Idempotency** — 5.1: existing `reminder_key` short-circuits to `skipped += 1` with no new row, no send.
- **Hard-rule compliance (Slice 3)**:
  - No edits to `agent/agent.ts`, `agent/channels/whatsapp.ts`, `agent/trusted-contact-context.ts`, `app/api/whatsapp/webhook/route.ts`, or the `whatsapp_intents` enum.
  - No edits under `/Volumes/Data Coding/Desarrollo/AI-workspace/travelhub-app`.
  - The cron route reads all flags from `process.env` (no repo file, no committed secrets).
  - External integrations degrade gracefully: missing `CRON_SECRET` → 401 (never a crash); missing `MORA_REMINDERS_*` flags default to safe no-op + dry-run; missing/whatsapp credentials are not touched here (handled by `sendWhatsAppTemplateMessage`).
  - `balance` propagated to `payment_reminders.balance_at_send` and to `sendPaymentReminder` is the per-plan balance (`plan.balance`), not the global patient balance — matches design §Interface `SendPaymentReminderInput`.

### Pre-existing failure (out of scope, unchanged)

`app/(admin)/appointments/page.test.tsx` — `blockButton aria-label` waitFor timeout. Present in baseline (733 pass / 1 fail at start of Slice 1; 778 pass / 1 fail at end of Slice 2; **789 pass / 1 fail at end of Slice 3**). Unchanged by this slice. **No new failures introduced.**

### Work Unit Evidence (Slice 3)

| Evidence | Value |
|---|---|
| **Focused test command** | `npm run test -- app/api/cron/payment-reminders/route.test.ts` |
| **Focused test result** | 1 test file / 12 tests passed (100%) |
| **Full suite command** | `npm run test` |
| **Full suite result** | 101 test files passed, 1 file failed (pre-existing `app/(admin)/appointments/page.test.tsx` aria-label waitFor). 789 / 790 tests pass. No new failures. |
| **Typecheck** | `npx tsc --noEmit` — clean (no output) |
| **Runtime harness command** | `curl -X POST http://localhost:3001/api/cron/payment-reminders -H "Authorization: Bearer $CRON_SECRET"` with `MORA_REMINDERS_DRY_RUN=true` — N/A in this run; the orchestrator restricts runtime harness to follow-up slices. The cron route is pure server-side orchestration over the mocked-Supabase + mocked-`listAccountsReceivable` + mocked-`sendPaymentReminder` surfaces individually tested in Slices 1 + 2; integration requires a live Vercel cron env (CRON_SECRET + MORA_REMINDERS_*), out of scope for unit-level apply. |
| **Rollback boundary** | Set `MORA_REMINDERS_ENABLED=false` (no-op safe path), remove `app/api/cron/payment-reminders/route.ts` + its test, and revert `vercel.json` to its pre-slice state (drop the `crons` entry). Agent surfaces, WCC data layers, and admin UI stay; nothing else is touched. |
| **Commit hash** | Recorded as `feat(mora): add cron route for outbound payment reminders` on `eliumontoya/feat-expediente-fase-4-agente-mora-de-recordator`. Exact SHA captured via `git log --oneline -1` after commit (per orchestrator: do NOT push, do NOT open a PR; commit happens locally on the feature branch). |

### Files touched (Slice 3)

| File | Action | Purpose |
|------|--------|---------|
| `app/api/cron/payment-reminders/route.ts` | Create | Cron endpoint: `export const dynamic = 'force-dynamic'`; `POST` does CRON_SECRET auth (timing-safe) → `MORA_REMINDERS_ENABLED` flag gate → `listAccountsReceivable` → filter `pastDuePlans.length>0 && patientPhoneE164` → fetch opted-out phones from `whatsapp_contacts` → exclude opted-out → per `(patient, plan)` compute weekly `periodKey` + `reminderKey` → dedupe by querying `payment_reminders.reminder_key` → `MORA_REMINDERS_DRY_RUN` (default `true`) inserts a dry-run row directly OR real send hands off to `sendPaymentReminder({ dryRun: false })` → response `{ sent, skipped, dryRun }` or `{ skipped: true }`. |
| `app/api/cron/payment-reminders/route.test.ts` | Create | 12 RED-first tests covering guardrail 4 (auth), feature-flag gating, dry-run default + explicit, real-send path, opt-out filter, idempotency. |
| `vercel.json` | Modify | Adds `"crons": [{ "path": "/api/cron/payment-reminders", "schedule": "0 15 * * *" }]` (design Decision 2: 09:00 America/Mexico_City, UTC-6 fixed). |
| `openspec/changes/issue #67/tasks.md` | Modify | Mark tasks 5.1, 5.2, 5.3 as `[x]`. |
| `openspec/changes/issue #67/apply-progress.md` | Modify | Append Slice 3 section + update cumulative rollup. |

### Deviations from design (Slice 3)

- **`balance` passed to `sendPaymentReminder` and persisted in `balance_at_send` is the per-plan balance (`plan.balance`), not the global patient balance (`row.balance`).** The design interface in §"Outbound action — `send-payment-reminder`" defines `balance` as "snapshot from listAccountsReceivable"; since the cron flow sends one reminder per `(patient, plan)` pair, the per-plan balance is the semantically correct value (the template's `{{2}}` is the balance of THIS plan). The Slice 3 test for the explicit `MORA_REMINDERS_DRY_RUN=true` path asserts `balance_at_send: 800` for a fixture where the per-plan balance is 800 while the global balance is 1200, locking the per-plan interpretation. This matches `send-payment-reminder.ts`'s existing contract.
- **The route handles dry-run persistence inline (not via `sendPaymentReminder({ dryRun: true })`).** The test explicitly asserts `sendPaymentReminder` is NOT called in dry-run mode and the `payment_reminders` insert is observed directly. The route queries the existing `reminder_key` first, then either inserts a `status='scheduled', dry_run=true` row directly (dry-run) or hands off to `sendPaymentReminder({ dryRun: false })` (real send). `sendPaymentReminder` keeps its own internal dedupe + persist + send flow for the real-send path. This separation keeps the cron route's responsibilities explicit (selection + flag gating + dry-run recording) and avoids surprising the cron operator with an internal send while dry-run is on.
- **Response shape for the enabled + dry-run path is `{ sent: 0, skipped, dryRun: true }` where `skipped` counts both "found an existing reminder_key" and "recorded a dry-run row".** This is a unified tally — `sent` is always "actual outbound messages" (0 in dry-run), `skipped` is always "processed but not sent". Matches the design's "200 {sent, skipped, dryRun}" shape and the test's assertions (`body.skipped === 1` for the dedupe case, `typeof body.skipped === 'number'` for the fresh dry-run case).

## Cumulative rollup (final — Slice 1 + Slice 2 + Slice 3)

- **Tasks completed**: 20 / 24 (1.1, 2.1–2.8, 3.1–3.6, 4.1–4.2, 5.1–5.3). Phase 6 (admin UI) and Phase 7 (verification + cleanup) remain for Slice 4.
- **New tests added across all three slices**: 23 (Slice 1) + 20 (Slice 2) + 12 (Slice 3) = **55 new tests, 55 / 55 passing**.
- **Full suite**: 789 / 790 tests pass; 1 pre-existing failure (`app/(admin)/appointments/page.test.tsx` aria-label waitFor) → unchanged from baseline. No new failures introduced.
- **Files created (all three slices)**: 14 new files (~2,500 lines authored); 5 modified (`src/lib/whatsapp/client.ts`, `agent/instructions.md`, `tests/agent/skills.test.ts`, `vercel.json`, `openspec/changes/issue #67/tasks.md`, `openspec/changes/issue #67/apply-progress.md`).
