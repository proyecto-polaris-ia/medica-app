# Verify Report: Eve Migration Stage 7 — Remove Legacy WhatsApp Agent

**Change**: `eve-stage-7-remove-legacy` (issue [#37](https://github.com/proyecto-polaris-ia/medica-app/issues/37))
**Archived**: `openspec/changes/archive/2026-11-eve-stage-7-remove-legacy/`

## Status

PASS — final verification 8/8 green. Judgment: **APPROVED** with the recorded
maintainer exception.

## Work Units

| Commit | Scope | Size |
| --- | --- | --- |
| `7462a89` | OpenSpec artifacts (proposal, design, tasks, deltas) | — |
| `141dbd7` | Shared-type extraction + legacy pipeline deletion | −3291 lines |
| `5b72110` | Flows onboarding modules + AI inbound agent deletion + `@ai-sdk/openai` removal | −1457 lines |
| `37916e8` | Eve-only webhook + `WHATSAPP_EVE_ENABLED` flag removal | — |
| `043733b` | Documentation updates | — |

## Final Verification

| # | Check | Command / Method | Result |
| --- | --- | --- | --- |
| 1 | Type safety | `npx tsc --noEmit` | PASS — 0 errors |
| 2 | Full test suite | `vitest` | PASS — 144 files, 1339 tests green |
| 3 | Production build | `npm run build` | PASS |
| 4 | Flag/legacy negative greps | grep for `WHATSAPP_EVE_ENABLED` / `WHATSAPP_FLOW_ENGINE_ENABLED` / deleted imports | PASS — clean |
| 5 | Deleted files absent | existence check | PASS — legacy modules/tests gone |
| 6 | Kept files present | existence check | PASS — `eve-escalation.ts`, `store.ts`, `client.ts`, `normalize.ts`, `signature.ts`, flow core |
| 7 | Environment example | `.env.local.example` inspection | PASS — `WHATSAPP_EVE_ENABLED` removed; required vars kept |
| 8 | Requirement coverage audit | every Stage 7 delta requirement mapped to code and tests | PASS |

Archived spec merge re-verified: `npx tsc --noEmit` exit 0; requirement counts
`eve-framework` 30→27, `whatsapp-inbound-automation` 24→17, `flow-engine` 13→12;
every REMOVED heading absent from the main specs and every MODIFIED/ADDED
heading present exactly once.

## Judgment Day Outcome

- **JD-A-001 — MAJOR, accepted as follow-up**: structured reminder-reply detection
  (deterministic `CONFIRMO` / `REAGENDA` / `CANCELO` transitions) has no executor
  after the legacy pipeline removal. Eve handles reminder replies
  conversationally but without the deterministic transition path. Accepted by
  maintainer decision as follow-up issue
  [#114](https://github.com/proyecto-polaris-ia/medica-app/issues/114).
- **Informational (no action required for this change)**: JD-A-002, JD-A-003,
  JD-A-004, JD-B-001, JD-B-002, JD-B-003, JD-B-004. Notable:
  - `webhook.accepted` records success even on Eve 4xx/5xx responses — a
    monitoring blind-spot candidate for a follow-up.
  - Stale comment at `src/lib/whatsapp/inbound-decision.ts:8`.
  - `WHATSAPP_EVE_ENABLED` deletion residue in `route.test.ts` fixtures.
  - Lockfile npm-11 churn.

**Verdict: JUDGMENT: APPROVED** with the recorded maintainer exception (JD-A-001
tracked as issue #114).
