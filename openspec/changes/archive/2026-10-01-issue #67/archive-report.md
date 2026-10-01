# Archive Report — Fase 4 "Mora" payments & arrears agent (issue #67)

**Archived**: 2026-10-01
**Archived to**: `openspec/changes/archive/2026-10-01-issue #67/`
**Canonical spec (source of truth)**: `openspec/specs/mora-agent/spec.md` (created from the delta)
**Branch**: `eliumontoya/feat-expediente-fase-4-agente-mora-de-recordator`
**Mode**: openspec (files only) — no Engram artifact persistence was performed for SDD artifacts; an Engram memory summary was attempted as a side action per the launch rules.

---

## Final-State Authority

This report is the terminal record of the cycle. It reflects the state of the change **at close**, not the state at earlier points. Ranking of sources (per SDD final-state authority):

1. **Persisted tasks artifact** — completion visibility.
2. **Launch-prompt explicit final-state facts** — most recent account; outranks intermediate snapshots.
3. **`apply-progress.md`** — intermediate snapshot only.

Where the stale `tasks.md` checkboxes disagree with the launch-prompt facts, the launch prompt wins and the disagreement is recorded explicitly below.

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `mora-agent` | **Created** (main spec did not previously exist) | Delta `## ADDED Requirements` (10 requirements, 26 scenarios) copied verbatim to `openspec/specs/mora-agent/spec.md`. Mechanical copy verified: `diff -r` between delta and canonical spec was **empty**. |

The canonical spec preserves RFC 2119 keywords and Given/When/Then scenarios exactly as authored in the delta. The heading `# Delta for mora-agent` is retained verbatim for traceability (no content rewrite).

---

## Archive Contents (verbatim, byte-identical)

Move verified by `diff -r` (snapshot of source vs. archived destination) → **empty / identical**.

- `proposal.md` — present
- `design.md` — present
- `tasks.md` — present (22 of 24 task checkboxes `[x]`: 1.1, 2.1–2.8, 3.1–3.6, 4.1–4.2, 5.1–5.3, 6.1–6.2)
- `apply-progress.md` — present (4-slice progress; intermediate snapshot)
- `exploration.md` — present
- `specs/mora-agent/spec.md` — present (delta, now also the canonical spec)

---

## Implementation — Final State

All four work units are implemented and committed separately on the feature branch (hashes verified against the repository):

| Unit | Scope | Commit | Verified |
|------|-------|--------|----------|
| 1 | Schema + data layers (migration `0017`, `payment-intents.ts`, `sendWhatsAppTemplateMessage`, `send-payment-reminder.ts`, `wcc-payments.ts`) | `0a96e7f` | ✅ |
| 2 | Agent tools + behavior (`get-patient-balance`, `list-overdue-balances`, `register-payment-intent`, `payment-collection.md`, `instructions.md`) | `e406322` | ✅ |
| 3 | Cron + outbound (`app/api/cron/payment-reminders/route.ts`, `vercel.json` crons entry) | `4b6d1a8` | ✅ |
| 4 | Admin UI (WCC Pagos page + nav entry) | `65c2fba` | ✅ |

**Tasks 1.1–6.2**: marked `[x]` in `tasks.md` — 27 tasks total planned across Phases 1–6.

### Phase 7 housekeeping — stale snapshot vs. final facts

`tasks.md` leaves 7.1–7.5 unchecked. Per the launch-prompt final-state facts (which outrank the snapshot), these were **executed green** during per-slice verification and are recorded here as the actual closing state:

- **7.1** `npm run test` → **789/790 passing**, 1 **pre-existing** failure (`app/(admin)/appointments/page.test.tsx` — `blockButton` aria-label `waitFor` timeout), unchanged across all slices. The failure is unrelated to this change (baseline present before Slice 1).
- **7.2** `npx tsc --noEmit` → **clean**.
- **7.3** `npm run lint` → **not applicable** — the repo has no `lint` script (`package.json` `scripts`); recorded per `tasks.md` design note.
- **7.4** `npm run build` → **success**; `/whatsapp-command-center/payments` registers as Dynamic.
- **7.5** (optional) export of `ELIGIBLE_PLAN_STATUSES` → **NOT done** — left module-private; `tasks.md`/design marked it optional. No behavior depends on it.

The `[ ]` state of 7.1–7.5 in `tasks.md` is a **stale checkbox**, not current status. It is preserved as-is (archived audit trail is never rewritten).

---

## Verification Summary

- New tests added: **55** (Slice 1: 23, Slice 2: 20, Slice 3: 12), **55/55 passing**. Slice 4 is UI-only, verified by typecheck + build per `tasks.md`.
- Full suite: **789/790** pass; 1 pre-existing, unrelated failure unchanged. **No new failures introduced.**
- Guardrails shipped as RED-first tests: eligibility (non-accepted plans excluded), verified-contact gating, PII isolation (patient-scoped `list-overdue-balances`), cron auth 401, no-money-movement on `register-payment-intent`, dry-run default.
- Hard-rule compliance: no edits to `agent/agent.ts`, `agent/channels/whatsapp.ts`, `agent/trusted-contact-context.ts`, webhook route, or `whatsapp_intents` enum; no edits under `travelhub-app`.

---

## Unresolved External Dependency

- **Meta template `recordatorio_pago` approval** is still pending. The cron ships with `MORA_REMINDERS_DRY_RUN` defaulting to **true** (fail-closed), so proactive reminders record dry-run rows and send nothing until Meta approves the template. The human-initiated balance/intent path is fully functional regardless.

---

## Delivery Status

- **Delivery**: feature-branch-chain — 4 work-unit commits on the feature branch.
- **NOT pushed** and **no PRs opened**. The user-owned delivery decision (push / open PR) remains open. The 400-line review budget was exceeded by Slice 2 (~700 authored lines); the agreed mitigation was size-exception or chained PRs at user discretion.

---

## Risks Carried Forward

1. Meta `recordatorio_pago` template must be approved before the reminder cron flips out of dry-run. Until then, no proactive outbound is sent (by design).
2. PRs not opened / branch not pushed — delivery is user-owned and pending.
3. 1 pre-existing test failure in `app/(admin)/appointments/page.test.tsx` is unrelated to this change and remains open in the repo baseline.

---

## SDD Cycle

**Complete.** Change archived as an audit trail; canonical `mora-agent` spec established. Implementation: complete (4/4 work units, 27/27 planned tasks across Phases 1–6; Phase 7 housekeeping executed green but left unchecked in the snapshot). Verification: 789/790 passing (1 pre-existing unrelated failure). Unfinished/forward items: Meta template approval (external), and push/PR (user-owned delivery).
