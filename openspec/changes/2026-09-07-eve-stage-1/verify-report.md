# Verify Report: Eve Framework — Stage 1 Setup

**Change:** `2026-09-07-eve-stage-1`
**Date:** 2026-09-07
**Result:** PASS

## Verification Summary

Stage 1 (Eve framework scaffold) is fully implemented and verified. All commands exit 0, the credential-free smoke test passes with zero environment variables, and no legacy WhatsApp code was modified.

| Command | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run test` | ✅ exit 0 — 383 passed (54 files) |
| `npm run test -- agent/__tests__/setup.test.ts` (isolated, `env -i`, no keys) | ✅ 3 passed |
| `npm run build` | ✅ exit 0 |

## Requirement Traceability

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Eve Dependency Installation | PASS | `eve@^0.52.2` under `dependencies` in `package.json`; `npm install` succeeds |
| 2 | Agent Runtime Configuration | PASS | `agent/agent.ts` exports `defineAgent({ model: "openai/gpt-4o", limits: { sessionTimeoutMs: 1800000 } })` |
| 3 | Agent System Prompt with Clinical Guardrails | PASS | `agent/instructions.md` (Spanish) states all 5 guardrails + escalation triggers; smoke test asserts each |
| 4 | Next.js Eve Integration | PASS | `next.config.mjs` wraps config with `withEve` from `eve/next`; `npm run build` succeeds |
| 5 | Environment Variable Documentation | PASS | `.env.local.example` documents `AI_GATEWAY_API_KEY`; all existing vars preserved |
| 6 | Credential-Free Smoke Test | PASS | `agent/__tests__/setup.test.ts` passes with no env vars, no server |
| 7 | Non-Interference with Legacy Agent | PASS | `git diff --name-only` shows no paths under `src/lib/whatsapp/`, `src/lib/flows/`, `src/lib/ai/`, `app/api/whatsapp/` |
| 8 | Build and Type Safety | PASS | `tsc --noEmit` and `npm run test` both exit 0 |

## Findings

### WARNING

- **`agent/eve-shim.d.ts` type shim** — Eve 0.52 publishes an `exports` field that the project's `moduleResolution: "node"` does not resolve, so a minimal type shim (`declare module "eve" { export function defineAgent<T>(d: T): T }`) lets `agent/agent.ts` type-check. This loses real type validation of the agent config (the smoke test enforces the runtime contract instead). Revisit when the project moves to `moduleResolution: "bundler"`/`"nodenext"` (the shim should be removed then).
- **`eve` engines `node >=24`** — resolved by bumping `.nvmrc` to `24.20.0` and `package.json` `engines.node` to `24.x` (user-approved). Stage 1 does not exercise the Eve runtime, so build/tests also pass on older Node, but Stage 6 deploy requires Node 24.
- **`docs/eve/agent-instructions.md`** remains untracked and is intentionally not part of this Stage 1 change (it is cross-stage orchestration prose, not a Stage 1 deliverable).

### SUGGESTION

- Confirm the final AI Gateway model id (`openai/gpt-4o`) before Stage 5 deploy; `model` is a config string and can be changed via `eve set --model`.
