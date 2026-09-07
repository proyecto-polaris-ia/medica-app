# Tasks: Eve Framework — Stage 1 Setup

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180 (package.json +1, next.config.mjs +3, .env.local.example +3, agent/agent.ts ~6, agent/instructions.md ~60, agent/__tests__/setup.test.ts ~50, package-lock churn) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Scaffold Eve agent + smoke test + withEve wrap | PR 1 | `npm run test -- agent/__tests__/setup.test.ts` | Vitest `node` env, no creds, no server | Revert `agent/`, `next.config.mjs`, `package.json`, `.env.local.example`, `agent/__tests__/` — legacy WhatsApp pipeline untouched |

## Phase 1: Foundation — Dependency & Config

- [x] 1.1 Add `eve` dependency: run `npm install eve@latest` and confirm `package.json` shows `eve` under `dependencies` at `^0.52.x`.
- [x] 1.2 Update `.env.local.example`: append `AI_GATEWAY_API_KEY=` with a descriptive comment; preserve every existing Supabase/WhatsApp variable.
- [x] 1.3 Wrap `next.config.mjs` with `withEve` from `eve/next` per design Decision 4 (`import { withEve } from "eve/next"; export default withEve(nextConfig);`).
- [x] 1.4 **Acceptance**: `npx tsc --noEmit` exits 0 after 1.1 + 1.3 (catches `eve` import/moduleResolution issues early).
- [x] 1.5 Bump Node to 24 (Eve `engines` requires `>=24`): set `.nvmrc` to `24.20.0` and `package.json` `engines.node` to `24.x`.

## Phase 2: Agent Scaffold — Runtime Config & Instructions

- [x] 2.1 Create `agent/agent.ts` exporting `defineAgent({ model: "openai/gpt-4o", limits: { sessionTimeoutMs: 1800000 } })` via default export.
- [x] 2.2 Create `agent/instructions.md` in Spanish, mirroring the 5 `AGENTS.md` guardrails: (1) no diagnosticar, (2) no recetar medicamentos, (3) no inventar horarios — toda disponibilidad sale de la BD, (4) no precios definitivos por WhatsApp, (5) escalar a humano en dolor fuerte, urgencia, infección, alergia, solicitud de medicamento/receta, intención ambigua.
- [x] 2.3 **Acceptance**: `agent/agent.ts` compiles under `tsc --noEmit`; `agent/instructions.md` contains each of the 5 guardrail keywords/phrases (manual grep check before test is written).

## Phase 3: Smoke Test — Credential-Free Verification

- [x] 3.1 Create `agent/__tests__/setup.test.ts` (Vitest, `// @vitest-environment node`): assert default export `model` is non-empty and matches `/<provider>/<model-id>/` regex, and `limits.sessionTimeoutMs === 1800000`.
- [x] 3.2 Same test file: read `agent/instructions.md` via `fs` + `node:path`, assert all 5 guardrail concepts are present (use keyword/phrase checks per guardrail).
- [x] 3.3 **Caveat handling (design Decision 6)**: if importing `agent/agent.ts` triggers side effects under Vitest/`tsc` with `moduleResolution: "node"`, fall back to source-text inspection of `agent/agent.ts` (regex on file contents) instead of importing the default export. Document the fallback choice in a comment at the top of the test file.
- [x] 3.4 **Acceptance**: `npm run test` passes with no env vars set (no `AI_GATEWAY_API_KEY`, no Supabase keys); `npx tsc --noEmit` exits 0.

## Phase 4: Final Verification — Build & Non-Interference

- [x] 4.1 Run `npm run build` and confirm it succeeds with the `withEve` wrap in place.
- [x] 4.2 Verify non-interference: `git diff --name-only` for the change MUST NOT include any path under `src/lib/whatsapp/`, `src/lib/flows/`, `src/lib/ai/`, or `app/api/whatsapp/`.
- [x] 4.3 **Acceptance**: all of `npx tsc --noEmit`, `npm run test`, and `npm run build` exit 0; legacy directories untouched.
