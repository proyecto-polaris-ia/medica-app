# Apply Progress: WhatsApp patient appointment lookup

## Status

Complete — all implementation tasks are done.

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `npm run test -- tests/agent/tools/list-my-appointments.test.ts tests/agent/skills.test.ts` → PASS, 2 files / 8 tests |
| Runtime harness command/scenario and exact result | `npm run build` → PASS. External WhatsApp simulation requires deployed stacked branches and valid Meta credentials. |
| Rollback boundary | Revert `agent/tools/list-my-appointments.ts`, trusted-contact helper export, instruction/test changes, and OpenSpec updates. |

## TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR |
|---|---|---|---|
| Lookup tool | Failing test showed missing `agent/tools/list-my-appointments` | Implemented read-only tool and trusted context helper | Full typecheck/test/build passed |
| Instructions | Failing skill test showed missing guidance markers | Updated `agent/instructions.md` | Full typecheck/test/build passed |

## Completed Tasks

- [x] 1.1 Add `tests/agent/tools/list-my-appointments.test.ts` for trusted lookup success.
- [x] 1.2 Add tests proving missing trusted WhatsApp identity is refused.
- [x] 1.3 Add tests proving the tool schema has no arbitrary phone input.
- [x] 1.4 Extend instruction/skill tests for lookup guidance.
- [x] 2.1 Export a helper that requires trusted WhatsApp phone from Eve tool context.
- [x] 2.2 Add `agent/tools/list-my-appointments.ts` as a read-only tool.
- [x] 2.3 Query patient by trusted phone without creating or updating records.
- [x] 2.4 Query only upcoming active appointments and return structured results.
- [x] 3.1 Update `agent/instructions.md` to use `list-my-appointments` for appointment lookup questions.
- [x] 3.2 Document the security refusal for missing trusted WhatsApp identity.
- [x] 4.1 Run focused lookup/instruction tests.
- [x] 4.2 Run `npm run typecheck`.
- [x] 4.3 Run `npm run test`.
- [x] 4.4 Run `npm run build`.
