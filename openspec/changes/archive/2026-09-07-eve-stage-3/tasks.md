# Tasks: Eve Stage 3 Write Tools

## Phase 1: Planning and dependency checks

- [x] 1.1 Read Issue #33 and migration plan.
- [x] 1.2 Verify Stage 1 and Stage 2 merged into `feat/eve-migration`.
- [x] 1.3 Create SDD proposal, spec, design, and task artifacts.

## Phase 2: RED tests

- [x] 2.1 Add failing unit tests for `resolve-patient`.
- [x] 2.2 Add failing unit tests for `book-appointment`.
- [x] 2.3 Add failing unit tests for `get-next-available`.
- [x] 2.4 Add failing integration tests for complete booking and conflict recovery.

## Phase 3: GREEN implementation

- [x] 3.1 Implement `agent/tools/resolve-patient.ts`.
- [x] 3.2 Implement `agent/tools/book-appointment.ts`.
- [x] 3.3 Implement `agent/tools/get-next-available.ts`.
- [x] 3.4 Update `agent/instructions.md` with bounded write tool usage.

## Phase 4: Verification and archive

- [x] 4.1 Run focused write-tool tests.
- [x] 4.2 Run full Vitest suite.
- [x] 4.3 Run TypeScript typecheck.
- [x] 4.4 Persist apply progress and verify report.
- [x] 4.5 Archive the SDD change and sync the main Eve spec.

## Review Workload Forecast

- Estimated changed lines: ~390
- 400-line budget risk: Medium
- Chained PRs recommended: No
- Decision needed before apply: No
- Delivery: single PR to `feat/eve-migration`
