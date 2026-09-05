# Archive Report: booking-para-dos-usos

**Change**: booking-para-dos-usos (Dual-Use Booking — public + internal)
**Archived**: 2026-09-04
**Artifact store mode**: hybrid (OpenSpec filesystem + Engram `sdd/booking-para-dos-usos/archive-report`)
**Prior phase artifacts**: proposal.md, exploration.md, design.md, tasks.md, apply-progress.md, verify-report.md (all read from `openspec/changes/booking-para-dos-usos/` before the move)

## Final State (authoritative — at close)

The change is **COMPLETE and archived**. Verification outcome: **PASS WITH WARNINGS**.

| Fact | Value |
|------|-------|
| Public booking route | `/booking` (top-level, outside `(admin)`, no auth, Turnstile-gated) |
| Internal booking route | `/appointments/new` (under `(admin)`, `requireUser()` → redirect `/login`) |
| Public write API | `/api/booking/book` (no session; `verifyTurnstile` gate; rejects `patientId` with 400) |
| Internal write API | `/api/admin/booking/book` (requires session; `patientId` XOR `{phone_e164, fullName}`) |
| Patient search API | `/api/admin/patients?q=` (requires session) |
| Build | `npm run build` exit 0 — route map `○ /booking` (static, public) + `ƒ /appointments/new` (dynamic, internal); no collisions |
| Tests | 261/261 passed (41 files, vitest 2.1.9) |
| Typecheck | `tsc --noEmit` clean (exit 0) |
| Requirements | 19/19 implemented |
| Scenarios | 32/38 fully compliant, 6 PARTIAL (test-gap warnings only), 0 FAILING/UNTESTED |
| Tasks | 17/17 complete (all `[x]` in tasks.md) |
| Blockers / CRITICAL | 0 |

Per `verify-report.md` (evidence_revision `sha256:da53ca78bdebb496d9cda4f7204eddc7d697f1a9c849410a76b1a7fcfc2f7b88`, written 2026-09-04 19:37, re-verify after the route fix).

## Routing Correction (post-first-verify, pre-archive)

The FIRST verify run **FAILED** on a `/booking` route-group collision: the internal wizard at `app/(admin)/booking/page.tsx` resolved to `/booking` and collided with the new public page at `app/booking/page.tsx` (the internal route was unreachable). Before this archive, the orchestrator applied the routing correction:

1. Internal wizard moved `app/(admin)/booking/page.tsx` → `app/(admin)/appointments/new/page.tsx` — **final URL `/appointments/new`** (NOT `/admin/booking`). This is the CORRECT final routing.
2. Admin nav `app/(admin)/layout.tsx` href and dashboard `app/(admin)/dashboard/page.tsx` quick-link updated `/booking` → `/appointments/new`.
3. Specs (`admin-panel`, `booking-patient-selection`) and `tasks.md` smoke note updated to `/appointments/new`. The API path `/api/admin/booking/book` is **UNCHANGED and correct** (API routes are not route groups).
4. Final verification re-ran clean: build exit 0 with the non-colliding route map, 261/261 tests, typecheck clean.

## Delivered Behavior

- **Public self-service booking** at `/booking`: anonymous visitors can browse the catalog (services, providers, slots) and book with name + phone, gated by Cloudflare Turnstile (client widget + server-side `verifyTurnstile` before any write). Missing CAPTCHA keys disable submit with an explanatory message — no silent acceptance.
- **Internal staff booking** at `/appointments/new`: authenticated staff search/select an existing patient (read-only in the confirm step) or implicitly create one via name + phone; the write endpoint resolves by `patientId` XOR `{phone_e164, fullName}`.
- **Security**: public route never accepts `patientId` (enumeration defense, 400); internal routes/API reject without session (401 / redirect to `/login`); `TURNSTILE_SECRET_KEY` never leaves the server; atomic no-overlap booking constraint preserved on both flows (shared `bookAppointment`, 23P01 → 409).
- **Architecture**: single `BookingWizard` with `mode: 'public' | 'internal'` prop; separate internal endpoint keeps the public write path truly public. No schema change; rollout deploy-only, gated by existing `NEXT_PUBLIC_BOOKING_UI_ENABLED` plus Turnstile envs.

## Spec Sync (delta → baseline)

| Domain (delta) | Action | Baseline result |
|----------------|--------|-----------------|
| `public-booking` | Created (mechanical copy) | `openspec/specs/public-booking/spec.md` — 7 requirements, 13 scenarios |
| `booking-patient-selection` | Created (mechanical copy) | `openspec/specs/booking-patient-selection/spec.md` — 7 requirements, 12 scenarios |
| `admin-panel` | Merged (delta into existing baseline) | `openspec/specs/admin-panel/spec.md` — 3 MODIFIED (`Protected admin routes`, `Booking flow behind login`, `Unauthenticated API rejection`), 1 ADDED (`Internal booking endpoint authentication`); all other requirements preserved |
| `appointment-booking` | Merged (delta into existing baseline) | `openspec/specs/appointment-booking/spec.md` — 1 MODIFIED (`Patient resolution from contact`); all other requirements preserved |
| `appointments-calendar-view` | No delta exists in this change | **Untouched** — noted: the archive launch prompt listed it as a merge target, but no delta spec targets it; the delta MODIFIED requirements live in `admin-panel` and `appointment-booking`. Nothing to apply. |

Delta `(Previously: ...)` annotations were merge instructions and were stripped; the merged baseline requirements carry the final text with all scenarios (RFC 2119 + Given/When/Then preserved). New-capability specs were copied byte-for-byte (`diff -r` empty).

## Archive Move

- Source: `openspec/changes/booking-para-dos-usos/` → `openspec/changes/archive/2026-09-04-booking-para-dos-usos/` (ISO date prefix, per OpenSpec convention and `openspec/config.yaml` `rules.archive: Preserve archived change folders as audit trail`).
- `git mv` attempted first; folder is untracked in this worktree so git refused; fallback `mv` used (mechanical shell move).
- **Mandatory readback**: `diff -r` of the pre-move recursive snapshot vs. the archived folder — **EMPTY (byte-identical)**. No content passed through the model's Read/Write path.
- Active changes directory no longer contains this change (`openspec/changes/` holds only `archive/`).
- Archived folder contains all artifacts: proposal.md, exploration.md, design.md, tasks.md (17/17 `[x]`, 0 unchecked), apply-progress.md, verify-report.md, specs/{admin-panel, appointment-booking, booking-patient-selection, public-booking}. This file (archive-report.md) is additive-only and excluded from the readback.

## Known Bookkeeping (non-blocking, historical)

- `design.md` still describes the internal route as `/admin/booking` and `app/(admin)/layout.tsx` as "no change required" in places (written before the route correction; verify W-4 documented the deviation). Specs/tasks reflect the final `/appointments/new`. Left as-is for audit fidelity (per the archive launch prompt, optional tidy is allowed but not required; substance was not changed).
- `apply-progress.md` "Completed Tasks" checkboxes are all `[ ]` while the authoritative `tasks.md` shows all `[x]` (verify W-5 bookkeeping; progress evidence table in the same file is complete). The persisted SDD task artifact (`tasks.md`) is the source of truth for completion and is fully checked.
- `verify-report.md` scenario table uses `⚠️ PARTIAL` for 6 test-gap scenarios; no failing or untested scenarios.

## Follow-up Warnings (carried from verify-report W/S — not archived work)

1. **Page-level route tests**: `app/booking/page.tsx` and `app/(admin)/appointments/new/page.tsx` have no page-level automated tests (public renders, internal redirects to `/login`). Route resolution is verified by the Next.js build route map; redirect behavior is static-verified. Add tests using the existing `app/(admin)/appointments/page.test.tsx` pattern.
2. **Internal 409 conflict path untested**: `app/api/admin/booking/book/route.test.ts` has no 409 case; internal atomicity relies on the shared `bookAppointment` conflict behavior covered via public route tests.
3. **Build-gate checklist**: add `npm run build` to the SDD Phase-4 checklist (tasks.md/apply-progress) so route collisions fail at apply, not verify (this change's collision was caught only at verify).
4. **`verifyTurnstile` fetch-error handling**: non-OK HTTP responses / fetch failures map to 500 (only `data.success` is checked); a Cloudflare outage degrades to 500 rather than a graceful error. Consider explicit fetch-error handling.

## Review Gate

No `reviewGate` present in structured status for this candidate — receipt-driven development does not apply; archive proceeded under ordinary repository policy.

## Artifacts

- Archive report file: `openspec/changes/archive/2026-09-04-booking-para-dos-usos/archive-report.md`
- Engram: `sdd/booking-para-dos-usos/archive-report` (type `architecture`, observation ID recorded in the save result)
- Baseline specs updated: `openspec/specs/public-booking/spec.md`, `openspec/specs/booking-patient-selection/spec.md`, `openspec/specs/admin-panel/spec.md`, `openspec/specs/appointment-booking/spec.md`