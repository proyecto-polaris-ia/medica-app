# Proposal: Eve Framework — Stage 1 Setup

## Intent

Begin the 7-stage migration of the WhatsApp inbound agent to Vercel Eve. Stage 1 installs the Eve framework and creates a minimal, non-functional agent scaffold (runtime config + system prompt) without touching the running legacy agent. This establishes the foundation that later stages (tools, skills, channel, deploy) build on, while `main` and the legacy pipeline remain intact.

## Scope Adaptation Note

Issue #31 was written against an outdated Eve API (it required Vercel KV for session state). This proposal reflects the **adapted scope for the real Eve 0.52 API**: Vercel KV / Redis is dropped (Eve core sessions are durable via Workflows, not KV), and Next.js integration is done via `withEve` from `eve/next`.

## Scope

### In Scope

- Install `eve` as a project dependency.
- Create `agent/agent.ts` using `defineAgent({ model: "openai/gpt-4o", limits: { sessionTimeoutMs: 30 * 60 * 1000 } })` (30-minute session timeout).
- Create `agent/instructions.md` with the dental WhatsApp agent system prompt (Spanish), embedding the clinical guardrails: no diagnosing, no prescribing, no inventing availability, no definitive prices, escalate to human on strong pain / urgency / infection / allergy / medication request / ambiguous intent.
- Wrap `next.config.mjs` with `withEve` from `eve/next` (mounts routes at `/eve/v1/...`).
- Add `AI_GATEWAY_API_KEY` (keeping existing vars) to `.env.local.example`.
- Add a lightweight automated smoke test asserting: agent config exports a valid model + session timeout, and `instructions.md` contains the required guardrails. The test MUST NOT require live model credentials or a running server.

### Out of Scope

- No tools (Stage 2), no skills (Stage 4), no WhatsApp channel (Stage 5).
- No `@vercel/kv`, no KV env vars, no Redis.
- No modification of existing WhatsApp agent code (`src/lib/whatsapp/`, `src/lib/flows/`, `src/lib/ai/`, `app/api/whatsapp/`).
- No removal or modification of existing code — purely additive.

## Capabilities

### New Capabilities

- `eve-framework`: Eve runtime setup — agent scaffold, runtime config, `withEve` integration, and setup smoke test.

### Modified Capabilities

- None (Stage 1 is additive; no existing spec behavior changes).

## Approach

Filesystem-first Eve setup: author the agent under `agent/`, wrap `next.config.mjs` with `withEve`, and verify via a credential-free static smoke test that imports the agent config and reads `instructions.md`. Session state uses Eve Workflows (no KV). The smoke test targets `agent/agent.ts` exports and `instructions.md` contents — pure filesystem, no server boot.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `package.json` | Modified | Add `eve` dependency |
| `agent/agent.ts` | New | `defineAgent` runtime config |
| `agent/instructions.md` | New | Spanish system prompt + guardrails |
| `next.config.mjs` | Modified | Wrap with `withEve` |
| `.env.local.example` | Modified | Add `AI_GATEWAY_API_KEY` |
| `agent/__tests__/setup.test.ts` | New | Credential-free smoke test |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `withEve` wrapping breaks Next.js build/dev | Low | Additive wrapper only; verify `npm run build` and `tsc --noEmit` |
| Smoke test accidentally requires creds/server | Med | Test only reads static files/exports, no network |
| Wrong model id / gateway config | Med | `model` is a config string; corrected before Stage 5 deploy |

## Rollback Plan

Stage 1 is purely additive. Rollback = revert the PR on `feat/eve-migration` (or `git revert` the commits). No shared state, DB changes, or legacy code touched. If `withEve` breaks the build, drop the wrapper from `next.config.mjs` first (agent files remain inert without it).

## Dependencies

- `eve@^0.52` npm package available.
- **Node `>=24`** (Eve requirement, verified across all recent versions 0.30→0.52). Stage 1 bumps `.nvmrc` and `package.json` `engines.node` from 22.x to 24.x.
- PR base `feat/eve-migration` (NOT `main`).

## Success Criteria

- [ ] `eve` installed; `agent/agent.ts` exports valid model + 30-min session timeout.
- [ ] `agent/instructions.md` contains all required clinical guardrails (Spanish).
- [ ] Smoke test passes with no credentials and no running server.
- [ ] `npm run build`, `npx tsc --noEmit`, and `npm run test` all pass.

## Open Questions

- Confirm final AI Gateway model id (`openai/gpt-4o`) vs. a 4.1/other variant.
- Where the smoke test should live (`agent/__tests__/` vs. `src/`) — align with existing Vitest layout.
- Whether `instructions.md` guardrail wording must mirror `docs/eve/agent-instructions.md` verbatim.
