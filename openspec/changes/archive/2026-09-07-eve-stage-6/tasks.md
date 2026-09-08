# Tasks: Eve Stage 6 Production Deploy

## Phase 1: Planning and dependency checks

- [x] 1.1 Read Issue #36 and the migration plan.
- [x] 1.2 Verify Stages 1–5 merged into `feat/eve-migration`.
- [x] 1.3 Fast-forward `feat/eve-stage-6-deploy` onto `feat/eve-migration`.
- [x] 1.4 Create SDD proposal, spec, design, and task artifacts.

## Phase 2: RED tests

- [ ] 2.1 Add tests for the flag parser (`true/1/yes` truthy, `false/undefined` falsy).
- [ ] 2.2 Add routing tests: forward-to-Eve when flagged, legacy when off, and legacy fallback when the forward throws.

## Phase 3: GREEN implementation

- [ ] 3.1 Add the `WHATSAPP_EVE_ENABLED` flag parser + routing logic to `app/api/whatsapp/webhook/route.ts`.
- [ ] 3.2 Add structured request logging naming the active agent.
- [ ] 3.3 Document `WHATSAPP_EVE_ENABLED` in `.env.local.example`.
- [ ] 3.4 Write `docs/eve-runbook.md`.

## Phase 4: Verification and archive

- [ ] 4.1 Run focused routing tests.
- [ ] 4.2 Run full Vitest suite.
- [ ] 4.3 Run TypeScript typecheck.
- [ ] 4.4 Persist apply progress and verify report.
- [ ] 4.5 Archive the SDD change and sync the main spec.

## Review Workload Forecast

- Estimated changed lines: ~220 (route change + test + runbook + env example)
- 400-line budget risk: Low
- Chained PRs recommended: No
- Decision needed before apply: No
- Delivery: single PR to `feat/eve-migration`
