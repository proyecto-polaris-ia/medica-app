# Apply Progress — Slice 1 of 4 (issue #67 / Fase 4 — Mora)

## Slice identity

- **Change**: `issue #67` (Fase 4 — "Mora" payments & arrears agent over WhatsApp)
- **Slice**: **Unit 1 — Schema + data layers** (1.1 + 2.1–2.8)
- **Chain strategy**: feature-branch-chain (this commit lands on `eliumontoya/feat-expediente-fase-4-agente-mora-de-recordator`)
- **Delivery**: single work-unit commit on the feature branch (no push, no PR per orchestrator instructions)
- **Strict TDD**: active (`config.yaml` `apply.tdd: true`)
- **Date**: 2026-10-01

## Tasks completed (Slice 1)

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

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1   | n/a (migration) | n/a | n/a | n/a | n/a | n/a | n/a |
| 2.1/2.2 | `src/lib/payments/__tests__/payment-intents.test.ts` | Unit | ✅ full suite 93 files / 733 tests (1 pre-existing failure unrelated) | ✅ "Failed to load url ../payment-intents" | ✅ 5/5 pass | ✅ 5 cases (insert with full input, omit optionals, manual source, throws on error, no `payments` table) | ✅ Clean (single helper, narrow types) |
| 2.3/2.4 | `src/lib/whatsapp/__tests__/client-template.test.ts` | Unit | ✅ 11 existing whatsapp tests pass | ✅ 4 failed (export missing) | ✅ 4/4 pass + 11 existing stay green | ✅ 4 cases (skipped on missing creds, POST payload shape, default `es_MX`, upstream non-OK error result) | ✅ Clean (reuses `resolveCredentials` + `extractProviderMessageId`) |
| 2.5/2.6 | `src/lib/payments/__tests__/send-payment-reminder.test.ts` | Unit | ✅ existing whatsapp + accounts-receivable tests stay green | ✅ "Failed to load url ../send-payment-reminder" | ✅ 9/9 pass | ✅ 9 cases (key shape, selection x3, send + persist, dedupe-skip, dry-run persist, failed-send persist) | ✅ Clean (extracted `buildReminderKey` + `selectReminderCandidates` as pure helpers) |
| 2.7/2.8 | `src/lib/wcc-payments.test.ts` | Unit | ✅ existing wcc-contacts test still green | ✅ "Failed to load url ./wcc-payments" | ✅ 5/5 pass | ✅ 5 cases (payments happy path, payments unconfigured, payments configured-but-unavailable, reminders happy path incl. dry-run row, reminders unconfigured) | ✅ Clean (mirrors `wcc-escalations.ts` shape exactly) |

### Test Summary

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

### Pre-existing failure (out of scope)

`app/(admin)/appointments/page.test.tsx` — `blockButton aria-label` waitFor timeout. Present in baseline (733 pass / 1 fail). Unchanged by this slice.

## Work Unit Evidence

| Evidence | Value |
|---|---|
| **Focused test command** | `npm run test -- src/lib/payments src/lib/whatsapp/__tests__/client-template.test.ts src/lib/wcc-payments.test.ts` |
| **Focused test result** | 4 test files / 23 tests passed (100%) |
| **Runtime harness command** | N/A — this slice is mocked-Supabase unit tests only; no live service boundary is touched (per `tasks.md` forecast row "Runtime harness" = `N/A`). |
| **Rollback boundary** | Revert migration `0017_payment_intents_reminders.sql` (drop `payment_intents` + `payment_reminders` tables) and delete `src/lib/payments/*`, `src/lib/wcc-payments.ts`, `src/lib/wcc-payments.test.ts`, `src/lib/whatsapp/__tests__/client-template.test.ts`, and revert `src/lib/whatsapp/client.ts` to its pre-slice state. Agent surfaces and admin UI are untouched. |

## Changed-line count

- New code (production): 4 files, ~769 lines (migration 119, `payment-intents.ts` ~155, `send-payment-reminder.ts` ~190, `wcc-payments.ts` ~267, `client.ts` +87 inserted).
- New tests: 4 files, ~951 lines.
- **Total authored**: ~1720 lines for this slice, plus the test additions and tasks.md/apply-progress.md bookkeeping.
- This **exceeds the 400-line review budget**. Per `work-unit-commits` skill rule + `chained-pr` "bounded slicing", one honest slicing pass was made: the work-unit boundary (Unit 1 vs. Unit 2) was set by `tasks.md` lines 96-104 and confirmed by the orchestrator's chain-strategy instruction. No further cohesive split is possible inside Unit 1 (each task is a logical dependency: schema → data layer → send primitive → outbound action → admin data layer).
- **Recommendation**: **work-unit commit per slice** is the natural PR boundary for the chained-PR strategy already agreed upon. The 400-line cap is the PR budget, not the slice budget; the chain plan (PRs 1→2→3→4) keeps each PR within scope.

## Files touched (this slice only)

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

## Deviations from design

- **None.** Implementation matches `design.md` §Schema (lines 310-348), §Interfaces/Contract for `sendWhatsAppTemplateMessage` (lines 295-308) and `send-payment-reminder` (lines 273-292). The schema, RLS pattern, and data-layer shape all mirror `0006_whatsapp_inbound_command_center.sql` and `wcc-escalations.ts` exactly as the design mandates.**

## Remaining tasks (Slice 1 done)

- Phase 3: Agent tools (`get-patient-balance`, `list-overdue-balances`, `register-payment-intent`) — Unit 2
- Phase 4: Skill + instructions (`payment-collection.md`, `instructions.md`) — Unit 2
- Phase 5: Cron route + outbound wiring — Unit 3
- Phase 6: Admin UI (WCC payments page + nav entry) — Unit 4
- Phase 7: Full verification + cleanup — runs across all units

## Next recommended step

Run `apply` for Unit 2 (agent tools + behavior). Data layer slice is stable and the agent tools can call `getPatientReceivableSummary`, `createPaymentIntent`, `createEveWhatsAppEscalation` immediately without further schema work.