# Design: Eve Stage 4 Skills

## Dependencies Verified
- Stage 1: PR #38 merged — `agent/agent.ts`, `agent/instructions.md`, Eve scaffold.
- Stage 2: PR #39 merged — `list-catalog`, `check-availability`, `search-knowledge`.
- Stage 3: PR #40 merged — `resolve-patient`, `book-appointment`, `get-next-available`.
- `feat/eve-stage-4-skills` fast-forwarded onto `feat/eve-migration` at `ec1dff7`, so all six tools are present.

## Approach
Add three markdown skills under `agent/skills/` and extend `agent/instructions.md` with a section that names each skill and its load trigger. No code changes. Skills are authored in Spanish de México to match the system prompt voice, and reference tools by their exact tool names (`check-availability`, `book-appointment`, `get-next-available`, `search-knowledge`).

## Skill Files

### `agent/skills/booking-flow.md`
Six ordered steps: (1) confirm intent, (2) collect service/provider/date/time, (3) `check-availability`, (4) present slots, (5) confirm then `book-appointment`, (6) handle no-availability via new date and conflict via `get-next-available`. Includes the same "notas importantes" as the issue template: never invent horarios, `"Cualquiera"` provider fallback, clinical escalation handoff, price handling, warm tone.

### `agent/skills/clinical-escalation.md`
Three trigger groups (urgent symptoms, medical conditions, inappropriate requests), a five-step "how to escalate" procedure, a reusable reply template, and four escalate examples plus three non-escalate examples (general price inquiry, normal booking, FAQ) to reduce over-escalation.

### `agent/skills/knowledge-answers.md`
When to use / when not to use `search-knowledge`, a search procedure, four examples (horarios, ubicación, servicios, no-result), and rules (never invent, admit and offer escalation on no result). Completed the missing example tail that the issue template left unfinished, aligning with `search-knowledge`'s `found: false` contract.

## Instructions Update
Append a "Skills" section to `agent/instructions.md` (without removing guardrails) mapping triggers to filenames. The existing `## Tools disponibles` and `## Guardrails clínicos` sections remain untouched.

## Testing
Keep tests outside `agent/` (Eve/Vercel scans `agent/` subdirectories as tool entries). Add `tests/agent/skills.test.ts` that reads the three skill files and asserts:
- Each file exists.
- `booking-flow.md` mentions `check-availability`, `book-appointment`, and `get-next-available`.
- `clinical-escalation.md` mentions an escalation keyword and the no-clinical-advice rule.
- `knowledge-answers.md` mentions `search-knowledge`.
- `agent/instructions.md` references all three filenames and preserves the five guardrails.
Credential-free: no env vars, no server.

## Risk Controls
- No Supabase schema changes, no tool changes, no legacy-code changes.
- Skills are prose only; the model remains bounded by tool results (availability/booking writes stay in the backend).
- Over-escalation and silence sections give the model negative examples to reduce false escalation.
