# Archive Report: Eve Stage 5 WhatsApp Channel

## Status
Archived — Stage 5 SDD cycle completed.

## Change
`2026-09-07-eve-stage-5`

## Summary
Added a WhatsApp channel (`agent/channels/whatsapp.ts`) connecting the Eve agent to Meta WhatsApp Cloud API via the Chat SDK WhatsApp adapter, with in-memory state and both inbound message handlers. No legacy webhook or WhatsApp code was touched.

## Specs Synced

| Domain | Action | Details |
| --- | --- | --- |
| `eve-framework` | Updated | Added WhatsApp channel bridge, credentials-from-env, non-interference, and dependency-pinning requirements. |

## Verification

| Check | Result |
| --- | --- |
| Focused channel test | PASS — 2 tests (`tests/agent/channels/whatsapp.test.ts`) |
| Full test suite | PASS — 63 files, 414 tests |
| Typecheck | PASS — `npx tsc --noEmit` exit 0 |

## Files Added

- `agent/channels/whatsapp.ts`
- `tests/agent/channels/whatsapp.test.ts`

## Files Modified

- `agent/eve-shim.d.ts` — ambient type declarations for `eve/channels/chat-sdk`, `@chat-adapter/whatsapp`, `@chat-adapter/state-memory`, and `chat`.
- `package.json` / `package-lock.json` — added `@chat-adapter/whatsapp@4.34.0`, `@chat-adapter/state-memory@4.34.0` (and transitive `chat@4.34.0`).
- `openspec/specs/eve-framework/spec.md` — synced Stage 5 requirements.
- `docs/eve/agent-instructions.md` and `openspec/changes/archive/2026-09-07-eve-stage-3/` — carried-over Stage 4 corrections folded into this PR (loose file tracked, malformed folder renamed). Included per explicit request.

## Final State
All Stage 5 tasks are complete. Webhook mounts at `/eve/v1/whatsapp`; Meta callback configuration happens in Stage 6. PR target remains `feat/eve-migration`.
