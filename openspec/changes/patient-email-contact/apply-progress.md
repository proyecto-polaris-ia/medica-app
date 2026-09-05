# Apply progress: patient-email-contact

**Status:** all original implementation tasks and the focused verify remediation are complete; pending independent verification.
**Delivery:** single PR with approved `size:exception`.

## Completed tasks
- [x] 1.1–1.3 Schema, contact normalization, nullable types, deterministic resolver and concurrency guards.
- [x] 2.1–2.3 Internal booking email capture/payload/conflict behavior; public booking remains phone + CAPTCHA only.
- [x] 3.1–3.3 Admin patient email validation, conflict mapping, CRUD/search and nullable presentation.
- [x] 4.1–4.3 WhatsApp linked-patient nullable contact display, isolated migration runtime proof, regression, and main integration check.
- [x] Verify remediation: re-read both identifiers after an insert `23505`; restore direct phone-only resolver proof; link a WhatsApp contact after patient resolution; prove it through an isolated PostgreSQL harness; stabilize final-server readiness.

## Strict TDD and regression evidence

The original task evidence remains historical: late tests below are regression proof and are **not** represented as retroactive RED cycles.

| Task | Strict TDD evidence | Regression evidence / limitation |
|---|---|---|
| 1.1 | No historical RED claim is made for the original late concurrency proof. | `patient-resolution.test.ts` keeps the concurrent conditional-update regression case; the isolated PostgreSQL harness proves the persisted conditional-update invariant. |
| 1.2 | Initial migration work was not reconstructed as a TDD cycle. | `verify-patient-email-contact-migration.sh` executes migration up/down and DB constraints in a disposable PostgreSQL 16 container. |
| 2.1 | No historical RED claim is made for the late payload assertion. | `BookingWizard.test.tsx` verifies that a free-text internal email is serialized in the `/api/admin/booking/book` request body. |
| 3.1 | The page accessibility test had an authentic RED before `htmlFor`/`id` associations made it GREEN. | POST/PATCH email-only and both-contact route assertions are late regression coverage, not claimed TDD-first evidence. |
| 4.1–4.3 | No historical RED claim is made for late regression coverage. | Existing WhatsApp/public tests protect the unchanged phone-first/CAPTCHA and no-notification behavior. |

### TDD Cycle Evidence — verify remediation only

| Remediation behavior | Safety net | RED | GREEN | REFACTOR / triangulation |
|---|---|---|---|---|
| `23505` recovery compares both owners | Existing resolver suite: 10 passing tests. | Added the crossed phone/email insert-race test before production code; it failed because recovery returned the phone owner. | `Promise.all` re-reads both owners, rejects different IDs, then safely enriches only an unowned supplied contact; resolver suite passes 13 tests. | Existing email-only race remains the alternate branch; direct phone found/create cases cover both phone-only paths. |
| WhatsApp booking links a newly resolved patient | Existing resolver/WCC tests: 11 passing tests. | Added the inbound booking test before production code; it failed because no contact-link operation occurred. | The store exposes an explicit link operation and inbound booking calls it after phone-first resolution; mocked send is `skipped`, so no real WhatsApp or email notification is sent. | The isolated SQL harness starts with an unlinked contact, creates the phone-only patient, and proves the `auto_phone` link. |
| Direct phone-only resolver proof | Existing resolver implementation already handled phone-only lookup/create. | N/A — these two cases are late regression coverage, not a new production fix. | 2 direct resolver cases pass. | They complement email-only and dual-contact coverage. |
| SQL final-server readiness | The previous harness could pass `SELECT 1` on PostgreSQL's temporary entrypoint server then fail during shutdown. | N/A — harness stabilization was applied before its final runtime scenario was added; no fabricated RED is claimed. | Waits for two PostgreSQL ready-log entries (final server) and then runs `psql SELECT 1`; harness passes. | The runtime scenario also provisions the WhatsApp migration's local `auth`, `anon`, and `authenticated` prerequisites. |

## Work-unit evidence

| Unit | Focused proof | Runtime harness | Rollback boundary |
|---|---|---|---|
| Verify remediation | `npm run test -- src/lib/booking/__tests__/patient-resolution.test.ts src/lib/whatsapp/__tests__/inbound-service.test.ts src/lib/wcc-contacts.test.ts` — **15 passed, 3 files**. | `./scripts/verify-patient-email-contact-migration.sh` — **PASS:** contact invariants, nullable-email WhatsApp create-and-link behavior, concurrent conditional update, and destructive rollback. It uses a disposable `postgres:16` Docker container and sends no WhatsApp/email notification. | `patient-resolution.ts`, `whatsapp/{inbound-service,store}.ts`, targeted tests, harness script. |

## Final checks

- `npm run test`: **passed, 48 files / 299 tests**.
- `npx tsc --noEmit`: **passed**.
- `npm run build`: **passed**.
- `git diff --check`: **passed**.
- `./scripts/verify-patient-email-contact-migration.sh`: **passed**.

## Remediation handoff

- Runtime attempt token held by the parent: `sha256:e297ee79188d287be2145bbf36832c256240261f02750d7314f006b7bca195b1`.
- Failed evidence revised by this remediation: `sha256:1b913a03b1df2f872f3aa283f5d63b438b9c15ca3361cea31fc90dee7c1067b4`.
- This executor did not settle the attempt and does not invent lineage, generation, fix-batch, or a new evidence revision. The parent must compute the candidate revision and settle the acquired attempt after independent verification.

## Maintainer exception

On 2026-09-05, the maintainer accepted proceeding to PR with the Strict TDD historical RED gap documented. This is a process exception only: current behavior is covered and green, but late regression tests are not represented as retroactive RED evidence.
