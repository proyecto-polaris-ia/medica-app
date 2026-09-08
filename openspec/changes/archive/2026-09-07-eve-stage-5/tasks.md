# Tasks: Eve Stage 5 WhatsApp Channel

## Phase 1: Planning and dependency checks

- [x] 1.1 Read Issue #35 and the migration plan.
- [x] 1.2 Verify Stages 1–4 merged into `feat/eve-migration`.
- [x] 1.3 Fast-forward `feat/eve-stage-5-channel` onto `feat/eve-migration`.
- [x] 1.4 Install Chat SDK dependencies pinned to `4.34.0`.
- [x] 1.5 Create SDD proposal, spec, design, and task artifacts.

## Phase 2: RED tests

- [ ] 2.1 Add `tests/agent/channels/whatsapp.test.ts` asserting the channel exports `bot`, `channel`, and `send` without needing Meta/Redis.

## Phase 3: GREEN implementation

- [ ] 3.1 Create `agent/channels/whatsapp.ts` with the `chatSdkChannel` bridge, WhatsApp adapter, memory state, and both message handlers.

## Phase 4: Verification and archive

- [ ] 4.1 Run the focused channel test.
- [ ] 4.2 Run the full Vitest suite.
- [ ] 4.3 Run TypeScript typecheck.
- [ ] 4.4 Persist apply progress and verify report.
- [ ] 4.5 Archive the SDD change and sync the main Eve spec.

## Review Workload Forecast

- Estimated changed lines: ~160 (channel + test + spec/design/tasks)
- 800-line budget risk: Low
- Chained PRs recommended: No
- Decision needed before apply: No
- Delivery: single PR to `feat/eve-migration`
