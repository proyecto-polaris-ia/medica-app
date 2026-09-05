# Archive Report: appointment-notes

**Change**: appointment-notes (Notes on appointments — Issue #27)
**Archived**: 2026-09-05
**Artifact store mode**: hybrid (OpenSpec filesystem + Engram `sdd/appointment-notes/archive-report`)
**Prior phase artifacts**: exploration.md, proposal.md, specs/{admin-panel,appointment-booking,public-booking}/spec.md, design.md, tasks.md, apply-progress.md, verify-report.md (all read from `openspec/changes/appointment-notes/` before the move)

## Final State (authoritative — at close)

The change is **COMPLETE and archived**. Verification outcome: **PASS WITH WARNINGS** (0 CRITICAL, 0 blocking WARNINGs).

| Fact | Value |
|------|-------|
| Verdict | PASS WITH WARNINGS — 0 CRITICAL, 0 blocking warnings |
| Tasks | 23/23 complete (all `[x]` in tasks.md) |
| Tests | **310/310 pass** (final, post-rebase onto `origin/main` — per orchestrator final-state facts; verify snapshot reported 302/302 at verification time, before the rebase) |
| Typecheck | `npx tsc --noEmit` exit 0 (clean) |
| Build | `npm run build` exit 0 |
| Requirements | 8/8 implemented |
| Scenarios (new-scope) | 17/17 compliant with passing covering tests |
| Preserved scenarios | 6/6 unchanged, restated without dedicated new tests (non-blocking) |
| Blockers / CRITICAL | 0 |

Per `verify-report.md` (verdict PASS WITH WARNINGS, written 2026-09-05 09:21) and orchestrator final-state facts (rebase onto `origin/main` completed; 310/310 tests after rebase). The test-count difference (302 snapshot → 310 final) is resolved by the Final-State Authority hierarchy: the launch prompt's explicit final-state facts outrank the intermediate verify snapshot, and the git state confirms the rebase (branch `feat/appointment-notes` is 0 behind / 1 ahead of `origin/main`).

## Delivered Behavior

- **Admin list**: appointments table shows a "Notas" column with a truncated preview (~80 chars, `…`) and an em dash "—" when notes are empty.
- **Admin edit modal**: create/edit modal includes a "Notas de la cita" textarea (`maxLength={1000}`, optional), bound to the `notes` field; clearing and saving persists null/empty.
- **Booking flows (public + internal)**: the ConfirmStep includes the same optional textarea (label "Notas de la cita", placeholder "¿Quieres agregar algo más para tener en consideración para tu cita?", `maxLength={1000}`); notes are forwarded through `ConfirmPatient` → request body → both book routes (`/api/booking/book` and `/api/admin/booking/book`).
- **Server-side validation**: `parseNotes` in both validate modules (admin + booking `ValidationError` classes) trims, maps empty→null, and rejects >1000 chars with a validation error; `validateAppointmentInput` mirrors the trim/cap; `bookAppointment` adds defense-in-depth trim + empty→null.
- **Persistence**: reuses the existing nullable `appointments.notes` column (migration `0007_appointment_notes.sql`); no schema change, no migration, no rollback risk.
- **Architecture**: notes travel `parseNotes → bookAppointment → appointments.notes` on the booking side and `modal → validateAppointmentInput → create/update` on the admin CRUD side. The LLM never decides or persists; deterministic server-side code owns the write, consistent with the project's orchestration principle.

## Spec Sync (delta → baseline)

| Domain (delta) | Action | Baseline result |
|----------------|--------|-----------------|
| `admin-panel` | Merged (delta into existing baseline) | `openspec/specs/admin-panel/spec.md` — 2 ADDED (`Appointment notes in admin list`, `Appointment notes in edit modal`), 2 MODIFIED (`Appointments CRUD`, `Booking flow behind login`); all other requirements preserved |
| `appointment-booking` | Merged (delta into existing baseline) | `openspec/specs/appointment-booking/spec.md` — 2 MODIFIED (`Appointments`, `Atomic booking`); all other requirements preserved |
| `public-booking` | Merged (delta into existing baseline) | `openspec/specs/public-booking/spec.md` — 2 ADDED (`Public booking confirm step includes notes textarea`, `Public booking endpoint persists notes`); all other requirements preserved |

Delta `(Previously: ...)` annotations were merge instructions and were stripped; the merged baseline requirements carry the final text with all scenarios (RFC 2119 + Given/When/Then preserved). No REMOVED or RENAMED requirements in this change. No main-spec copy was needed (all three domains already existed as baseline specs).

## Archive Move

- Source: `openspec/changes/appointment-notes/` → `openspec/changes/archive/2026-09-05-appointment-notes/` (ISO date prefix, per OpenSpec convention and `openspec/config.yaml` `rules.archive: Preserve archived change folders as audit trail`).
- `git mv` used (all 9 files were git-tracked) — recorded as renames in git status.
- **Mandatory readback**: `diff -r` of the pre-move recursive snapshot vs. the archived folder — **EMPTY (byte-identical)**. No content passed through the model's Read/Write path.
- Active changes directory no longer contains this change.
- Archived folder contains all artifacts: proposal.md, exploration.md, design.md, tasks.md (23/23 `[x]`, 0 unchecked), apply-progress.md, verify-report.md, specs/{admin-panel, appointment-booking, public-booking}. This file (archive-report.md) is additive-only and excluded from the readback.

## Task Completion

The persisted SDD task artifact (`tasks.md`) shows 23/23 tasks `[x]` — no stale unchecked implementation tasks in the archived audit trail. Note: the Engram tasks observation `sdd/appointment-notes/tasks` (#2753) is the tasks-phase snapshot and still shows unchecked boxes; `sdd-apply` updates the filesystem `tasks.md` (per OpenSpec convention), which is the source of truth for completion and is fully checked. No archive-time reconciliation was needed.

## Warnings (non-blocking, carried from verify-report — not archived work)

1. **Preserved scenarios lack dedicated tests** — 6 pre-existing scenarios (admin CRUD manage, internal-reachable-after-login, internal-unreachable-before-login, public-reachable, appointment-recorded, concurrent-double-booking) are restated in the delta specs without new covering tests. Pre-existing behavior, unchanged by this change; a future hardening pass could add route/layout reachability tests.
2. **Pre-existing latent 500 in admin booking route** — `app/api/admin/booking/book/route.ts` imports `parseIsoDate` (booking `ValidationError`) while `handleAdminRequest` catches admin `ValidationError`; bad `startAt`/`endAt` would 500. Pre-existing, documented in design.md as out of scope; `notes` correctly uses admin `parseNotes`, so this change does not introduce the issue. Recommend a follow-up.
3. **Duplicated `parseNotes`** — intentional per design (two distinct `ValidationError` classes per module; mirrors existing parseUuid/parseIsoDate duplication). Acceptable; could be unified when the error-class split is refactored.
4. **Lint absence** — no lint script/config in `package.json`; skipped by design (typecheck + build + 310 tests provide the safety net).

## Review Gate

No `reviewGate` present in structured status for this candidate — no review artifact was ever created for this change; receipt-driven development does not apply. Archive proceeded under ordinary repository policy.

## Engram Observation Traceability

Observations actually read during archive:

| Artifact | Engram ID | Sync ID |
|----------|-----------|---------|
| proposal | #2749 | obs-4109eae64244fd2b |
| spec | #2750 | obs-759be3b9226e24a6 |
| design | #2752 | obs-53744d1b239fa32a |
| tasks | #2753 | obs-8a11ae191f72b695 |
| verify-report | #2756 | obs-488e0eb3466869f8 |

(`sdd/appointment-notes/explore` #2748 and `sdd/appointment-notes/apply-progress` were referenced by the orchestrator; apply-progress was read from the filesystem `apply-progress.md`.)

## Artifacts

- Archive report file: `openspec/changes/archive/2026-09-05-appointment-notes/archive-report.md`
- Engram: `sdd/appointment-notes/archive-report` (type `architecture`, observation ID recorded in the save result)
- Baseline specs updated: `openspec/specs/admin-panel/spec.md`, `openspec/specs/appointment-booking/spec.md`, `openspec/specs/public-booking/spec.md`