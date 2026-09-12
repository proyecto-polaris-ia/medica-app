# Tasks: WhatsApp patient appointment lookup

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 180-300 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR stacked on PR #52 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Add read-only WhatsApp appointment lookup | PR 1 | `npm run test -- tests/agent/tools/list-my-appointments.test.ts tests/agent/skills.test.ts` | `npm run build` | Revert new lookup tool, helper export, instructions, tests, and OpenSpec files |

## Phase 1: RED tests

- [x] 1.1 Add `tests/agent/tools/list-my-appointments.test.ts` for trusted lookup success.
- [x] 1.2 Add tests proving missing trusted WhatsApp identity is refused.
- [x] 1.3 Add tests proving the tool schema has no arbitrary phone input.
- [x] 1.4 Extend instruction/skill tests for lookup guidance.

## Phase 2: Implementation

- [x] 2.1 Export a helper that requires trusted WhatsApp phone from Eve tool context.
- [x] 2.2 Add `agent/tools/list-my-appointments.ts` as a read-only tool.
- [x] 2.3 Query patient by trusted phone without creating or updating records.
- [x] 2.4 Query only upcoming active appointments and return structured results.

## Phase 3: Agent guidance

- [x] 3.1 Update `agent/instructions.md` to use `list-my-appointments` for appointment lookup questions.
- [x] 3.2 Document the security refusal for missing trusted WhatsApp identity.

## Phase 4: Verification

- [x] 4.1 Run focused lookup/instruction tests.
- [x] 4.2 Run `npm run typecheck`.
- [x] 4.3 Run `npm run test`.
- [x] 4.4 Run `npm run build`.
