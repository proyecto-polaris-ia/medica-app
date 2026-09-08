# Apply Progress: Eve Stage 3 Write Tools

## Summary
Implemented the Stage 3 Eve write tools for patient resolution, appointment booking, and next-slot recovery. The tools wrap existing deterministic booking services and keep tests outside `agent/` to avoid Eve/Vercel scanning test directories as tools.

## TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR |
| --- | --- | --- | --- |
| 2.1 / 3.1 resolve-patient | Added failing tests for existing, missing-name, new, and identity-conflict patient resolution. Initial run failed because `agent/tools/resolve-patient.ts` did not exist. | Implemented `resolve-patient`; focused tests pass. | Kept output shaping local to the Eve tool; no booking business logic changed. |
| 2.2 / 3.2 book-appointment | Added failing tests for successful booking, conflict, invalid date range, and missing service. Initial run failed because `agent/tools/book-appointment.ts` did not exist. | Implemented `book-appointment`; focused tests pass. | Centralized date validation and Mexico City formatting in the tool. |
| 2.3 / 3.3 get-next-available | Added failing tests for next slot, no slot, invalid date, and missing provider. Initial run failed because `agent/tools/get-next-available.ts` did not exist. | Implemented `get-next-available`; focused tests pass. | Reused Stage 2 date parsing style. |
| 2.4 / 3.4 booking-flow integration + instructions | Added failing integration tests for availability → patient resolution → booking and conflict → next slot → booking. Initial run failed because Stage 3 tools did not exist. | Integration tests pass; `agent/instructions.md` describes write-tool usage. | Preserved clinical guardrails and bounded backend execution language. |

## Work Unit Evidence

| Evidence | Required value |
| --- | --- |
| Focused test command and exact result | `npm run test -- tests/agent/tools/resolve-patient.test.ts tests/agent/tools/book-appointment.test.ts tests/agent/tools/get-next-available.test.ts tests/agent/tools/booking-flow.integration.test.ts` → 4 files passed, 14 tests passed. |
| Runtime harness command/scenario and exact result | `tests/agent/tools/booking-flow.integration.test.ts` simulates complete tool chain and conflict recovery with mocked business services → 2 integration tests passed. |
| Rollback boundary | Remove `agent/tools/resolve-patient.ts`, `agent/tools/book-appointment.ts`, `agent/tools/get-next-available.ts`, Stage 3 tests under `tests/agent/tools/`, and the write-tool section in `agent/instructions.md`. |

## Files Changed

| File | Action | Notes |
| --- | --- | --- |
| `agent/tools/resolve-patient.ts` | Created | Resolves or creates patients via existing patient-resolution service. |
| `agent/tools/book-appointment.ts` | Created | Resolves catalog/patient data and writes appointments through existing atomic booking service. |
| `agent/tools/get-next-available.ts` | Created | Finds next real availability through existing next-available service. |
| `agent/instructions.md` | Modified | Adds bounded write-tool usage and conflict handling guidance. |
| `tests/agent/tools/resolve-patient.test.ts` | Created | Unit coverage for patient tool. |
| `tests/agent/tools/book-appointment.test.ts` | Created | Unit coverage for booking tool. |
| `tests/agent/tools/get-next-available.test.ts` | Created | Unit coverage for next availability tool. |
| `tests/agent/tools/booking-flow.integration.test.ts` | Created | Full mocked booking flow and conflict recovery integration coverage. |

## Deviations
None from the approved Stage 3 scope. Tests were intentionally placed in `tests/agent/tools/` instead of `agent/tools/__tests__/` because Stage 2 proved the Eve build scans unsupported directories under `agent/` as tool entries.
