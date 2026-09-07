# Tasks: Eve Stage 2 — Read-Only Tools

## 1. Setup

- [x] 1.1 Confirm Stage 1 files exist on this branch after syncing from `feat/eve-migration`.
- [x] 1.2 Add `zod` as a direct dependency.

## 2. Tool Implementation

- [x] 2.1 Create `agent/tools/list-catalog.ts` using existing catalog readers.
- [x] 2.2 Create `agent/tools/check-availability.ts` using existing resolver and availability readers.
- [x] 2.3 Create `agent/tools/search-knowledge.ts` querying approved knowledge entries only.
- [x] 2.4 Update `agent/instructions.md` with read-only tool guidance.

## 3. Tests

- [x] 3.1 Add `list-catalog` unit tests for success, empty data, and error handling.
- [x] 3.2 Add `check-availability` unit tests for success, missing entities, invalid date, and no slots.
- [x] 3.3 Add `search-knowledge` unit tests for relevance, status filtering query, no matches, and read-only method use.

## 4. Verification

- [x] 4.1 Run targeted tool tests.
- [x] 4.2 Run full unit tests.
- [x] 4.3 Run TypeScript typecheck.
- [x] 4.4 Run production build.

## Review Workload Forecast

- Estimated changed lines: under 400 implementation lines plus tests/spec artifacts.
- 400-line budget risk: Medium.
- Chained PRs recommended: No.
- Decision needed before apply: No.
