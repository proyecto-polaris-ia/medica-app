# Design: Eve Framework — Stage 1 Setup

## Technical Approach

Stage 1 installs Vercel Eve 0.52 as an additive dependency and scaffolds a non-functional agent (runtime config + system prompt), leaving the legacy WhatsApp pipeline untouched. It is **filesystem-first**: the agent is authored under `agent/` and mounted via a `withEve` wrap of `next.config.mjs` on the same origin (`/eve/v1/*`). Verification is a credential-free static smoke test. No KV/Redis — Eve 0.52 sessions are durable via Workflows.

## Architecture Decisions

### Decision 1: Filesystem-first agent layout

| Option | Tradeoff | Decision |
|---|---|---|
| `agent/agent.ts` + `agent/instructions.md` | Directory is Eve's contract; later stages add `tools/`, `skills/`, `channels/` beside it | **Chosen** |
| Colocate in `src/lib/ai/` | Mixes legacy code with new framework; breaks Eve's directory convention | Rejected |

**Rationale**: Eve resolves the agent by directory. Keeping `agent/` top-level isolates the migration surface from legacy `src/` and gives later stages a stable mount point.

### Decision 2: Static gateway model + 30-min timeout

```ts
// agent/agent.ts
import { defineAgent } from "eve";
export default defineAgent({
  model: "openai/gpt-4o",
  limits: { sessionTimeoutMs: 1800000 },
});
```

| Option | Tradeoff | Decision |
|---|---|---|
| Static string `"openai/gpt-4o"` | Compile-only id, no runtime resolution in Stage 1 | **Chosen** |
| Env-driven `process.env.EVE_MODEL` | Adds env coupling before Stage 5 deploy; not needed yet | Rejected |

**Rationale**: the id is only inspected (spec `model` matches `<provider>/<model-id>`) and corrected before Stage 5. `sessionTimeoutMs` mirrors the current WhatsApp conversation expectation (30 min).

### Decision 3: Instructions mirror repo guardrails

`agent/instructions.md` (Spanish) embeds the 5 hard guardrails from `AGENTS.md` domain rules verbatim in concept: no diagnosticar, no recetar, no inventar horarios, no precios definitivos, escalar a humano (dolor fuerte, urgencia, infección, alergia, solicitud de medicamento/receta, intención ambigua). Wording mirrors the repo rules, **not** `docs/eve/agent-instructions.md` (which is stage-orchestration prose, not a system prompt).

**Rationale**: these guardrails live in backend in later stages; Stage 1 seeds them in the prompt as the spec requires.

### Decision 4: `withEve` wrap (no URL env sync)

```js
// next.config.mjs
import { withEve } from "eve/next";
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default withEve(nextConfig);
```

**Rationale**: mounts `/eve/v1/*` on the same origin — no CORS or cross-URL env sync. Additive wrapper; if it breaks the build, drop the wrap first (agent files stay inert).

### Decision 5: Only `AI_GATEWAY_API_KEY` in env example

| Option | Tradeoff | Decision |
|---|---|---|
| Add `AI_GATEWAY_API_KEY` only | Static gateway model needs OIDC/API key; no KV vars | **Chosen** |
| Add KV/Redis vars | Obsolete in Eve 0.52 (Workflows); contradicts proposal | Rejected |

**Rationale**: existing Supabase + WhatsApp vars remain untouched.

### Decision 6: Credential-free smoke test

`agent/__tests__/setup.test.ts` (Vitest `node` env — correct; no jsdom). It imports the `agent/agent.ts` default export and asserts `model` is non-empty `<provider>/<model-id>` and `limits.sessionTimeoutMs === 1800000`; it reads `agent/instructions.md` (via `fs`/`node:path`) and asserts all 5 guardrails present. No server, no network, no API key.

**Caveat (open verification)**: importing `agent/agent.ts` pulls in `eve`. If `defineAgent` with a static string model is compile-only and import-safe, this is fine; but apply MUST verify `eve` imports cleanly under Vitest and `tsc --noEmit` with `moduleResolution: "node"` and no runtime side effects. If import triggers side effects, fall back to inspecting the file's source text.

### Decision 7: Additive guarantee

Stage 1 touches only `package.json`, new `agent/`, `next.config.mjs`, `.env.local.example`, and the new test. `src/lib/whatsapp/`, `src/lib/flows/`, `src/lib/ai/`, `app/api/whatsapp/` are **not** modified.

## Data Flow

```
build/dev ── withEve(nextConfig) ── mounts /eve/v1/*
                                          │
   agent/agent.ts (defineAgent) ── reads ─┘  (runtime config)
   agent/instructions.md  ────────────────┘  (system prompt)
```

Stage 1 is inert: config + prompt only; no tool/action flow.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add `eve@^0.52` dependency |
| `agent/agent.ts` | Create | `defineAgent` runtime config |
| `agent/instructions.md` | Create | Spanish system prompt + 5 guardrails |
| `next.config.mjs` | Modify | Wrap with `withEve` |
| `.env.local.example` | Modify | Add `AI_GATEWAY_API_KEY` |
| `agent/__tests__/setup.test.ts` | Create | Credential-free smoke test |

## Interfaces / Contracts

Agent config type (from `eve`): `{ model: string; limits: { sessionTimeoutMs: number } }`. No new local types.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (smoke) | config exports + guardrails present | Vitest `node`, static read/export inspection |
| Build | `withEve` doesn't break build/types | `npm run build`, `npx tsc --noEmit` |
| Integration/E2E | None this stage | N/A — no live flow |

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or user-controlled routing boundary. The `/eve/v1/*` mount is a static declarative Next.js integration with no user-supplied input at the routing layer.

## Migration / Rollout

No migration required. Rollback = revert the PR on `feat/eve-migration`; if `withEve` breaks the build, drop the wrapper first.

## Open Questions

- [ ] Confirm final gateway model id (`openai/gpt-4o`) vs a 4.1/other variant.
- [ ] Verify `eve` imports cleanly under Vitest/`tsc` with `moduleResolution: "node"` and no side effects (Decision 6 caveat).
