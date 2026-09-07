# Design: Eve Stage 3 Write Tools

## Dependencies Verified
- Stage 1: PR #38 is merged into `feat/eve-migration`; `agent/agent.ts` and `agent/instructions.md` exist.
- Stage 2: PR #39 is merged into `feat/eve-migration`; `agent/tools/list-catalog.ts`, `agent/tools/check-availability.ts`, and `agent/tools/search-knowledge.ts` exist.

## Approach
Add three authored Eve tools under `agent/tools/`. Eve 0.52.2 documents `defineTool` from `eve/tools` with a required `description`, required `inputSchema`, and an `execute(input, ctx)` implementation. Authored tools run in the app runtime, so they can import `@/lib/booking/*` and use server-side Supabase code.

## Tool Behavior

### `resolve-patient`
- Validate `phone` through existing `normalizePatientContact`/`parsePhoneE164` behavior.
- Pre-check existing contact ownership via Supabase admin so the tool can report `isNew` and require `fullName` before creating a new patient.
- Call `resolvePatient()` for the actual resolve/create operation.
- Re-read the patient contact fields after resolution for structured output.
- Catch `PatientIdentityConflictError` and validation errors as structured tool results.

### `book-appointment`
- Resolve service and provider with existing catalog functions.
- Parse `startAt` and `endAt` as ISO dates; reject invalid, past, or non-increasing intervals before booking.
- Resolve/create the patient with `resolvePatient()`.
- Call `bookAppointment()` for the atomic write; preserve conflict results.
- Re-read the created appointment by resolved IDs and timestamps to return `id` and `status` without changing existing business logic.
- Format datetime in `America/Mexico_City` for model-facing confirmation.

### `get-next-available`
- Resolve service and provider with existing catalog functions.
- Parse `afterDate` as `YYYY-MM-DD`.
- Call `findNextAvailable()` and return ISO and formatted slot data.
- If no slot exists, return an explicit unavailable result.

## Testing
- Keep tests outside `agent/` under `tests/agent/tools/` to avoid Eve build scanning test folders as tool files.
- Unit tests mock the existing booking services and Supabase admin reads.
- Integration test composes Stage 2 `check-availability` plus Stage 3 tools with mocks to prove the complete booking path and conflict recovery path.

## Risk Controls
- No Supabase schema changes.
- No edits to `src/lib/booking/`; tools wrap existing deterministic services only.
- No patient or appointment write happens before validation passes where the tool can validate locally.
- Tool outputs are JSON-serializable and minimize patient data.
