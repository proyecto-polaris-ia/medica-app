# Proposal: Eve Stage 4 — Skills for Booking Flow and Clinical Escalation

## Intent
Add the three Eve skills required by Issue #34 (`booking-flow`, `clinical-escalation`, `knowledge-answers`) plus the instruction references that wire them into the agent, so Eva follows the correct conversational flow (service → provider → date → time → confirm), escalates clinical cases appropriately, and uses the knowledge base correctly — without touching any existing code.

## Context
Stages 1–3 are complete on `feat/eve-migration`: PR #38 scaffolded the Eve agent, PR #39 added the read-only tools, and PR #40 added the write tools. On `feat/eve-stage-4-skills` (fast-forwarded onto the integration branch), the agent has all six tools (`list-catalog`, `check-availability`, `search-knowledge`, `resolve-patient`, `book-appointment`, `get-next-available`) but no procedural guidance on *when* and *in what order* to use them, and no standalone clinical-escalation procedure beyond the guardrails in `agent/instructions.md`.

## Scope
- Create `agent/skills/booking-flow.md` — step-by-step booking procedure.
- Create `agent/skills/clinical-escalation.md` — clinical escalation rules and templates.
- Create `agent/skills/knowledge-answers.md` — knowledge base usage guide.
- Update `agent/instructions.md` to reference the three skills and their load triggers.
- Add a credential-free test that asserts the three skill files exist and that `agent/instructions.md` references them.

## Scope Adaptation
- Skills are authored in Spanish de México (neutral/profesional) to match `agent/instructions.md` and the existing agent voice.
- The issue's template omits the knowledge-answers skill examples end; we complete the three examples plus a "no-result" example, consistent with the `search-knowledge` tool's `found: false` contract.
- Tests MUST stay outside the `agent/` root (Eve/Vercel treats unsupported directories under `agent/` as tool entries, proven in Stages 1–2). Skill assertions live in `tests/agent/` next to the existing scaffold smoke test.

## Non-goals
- Do NOT create the WhatsApp channel (Stage 5).
- Do NOT modify existing tools or `src/lib/booking/` business logic.
- Do NOT remove or change existing instructions/guardrails.
- Do NOT implement flow logic in code — skills are markdown guidance only.
- Do NOT change Supabase schema or migrations.

## Rollback
Delete `agent/skills/`, revert the instructions block referencing skills, and remove the new test. No schema or code rollback is required because this change adds only markdown and prose.
