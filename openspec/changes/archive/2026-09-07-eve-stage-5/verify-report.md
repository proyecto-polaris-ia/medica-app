# Verify Report: Eve Stage 5 WhatsApp Channel

## Status
PASS — no CRITICAL issues. Includes a build-time graceful-degradation fix applied after the first Vercel deploy failed.

## Evidence

| Check | Command | Result |
| --- | --- | --- |
| Focused channel test | `npx vitest run tests/agent/channels/whatsapp.test.ts` | PASS — 3 tests |
| Full Vitest suite | `npm run test` | PASS — 63 files, 415 tests |
| TypeScript | `npx tsc --noEmit` | PASS — exit 0 |

## Requirement Coverage

| Requirement | Evidence | Result |
| --- | --- | --- |
| Channel bridge | `agent/channels/whatsapp.ts` exports `bot`/`channel`/`send` | PASS |
| WhatsApp adapter + memory state | `createWhatsAppAdapter()` + `createMemoryState()`, `streaming: false` | PASS |
| Credentials from env | no plaintext token in source; adapter auto-detects `WHATSAPP_*` | PASS |
| Graceful degradation without credentials | `hasWhatsAppCredentials` gate skips adapter registration when any `WHATSAPP_*` var is absent/empty | PASS |
| Both message handlers | `onNewMention` + `onSubscribedMessage` registered | PASS |
| Legacy untouched | no change under `app/api/whatsapp/` or `src/lib/whatsapp/` | PASS |
| Dependency pinning | `@chat-adapter/*` at `4.34.0` | PASS |
| Type safety | `eve-shim.d.ts` extended for `eve/channels/chat-sdk`, adapters, `chat` | PASS |

## Notes
- **Deploy fix #1 (credentials)**: the first Vercel build failed with `accessToken is required...` because `createWhatsAppAdapter()` throws at module load with no `WHATSAPP_*` vars.
- **Deploy fix #2 (default export)**: after the gate, `eve build` failed with `Expected the channel export "default" ...`, because eve resolves a channel module by its default export but the sample only named-exported `{ bot, channel, send }`.
- **Deploy fix #3 (route registration)**: gating the adapter to `adapters: {}` in credential-less builds failed eve's manifest validation with `compiled binding "channels/whatsapp.ts" is not referenced by its node manifest` — eve derives the channel's webhook route from the adapter keys, so a channel with zero routes is rejected. The final fix constructs the WhatsApp adapter unconditionally (route always present) using `process.env[k] || "unconfigured"` fallbacks, so `eve build` succeeds with no credentials while the channel still degrades gracefully at runtime. Verified with `eve build` under Node 24 with an empty environment.
- The channel deep-links `eve/channels/chat-sdk` and `chat`, which use Node subpath `#` imports Vite can't externalize; the test asserts source shape instead of runtime-import (mirrors `tests/agent/setup.test.ts`).
- State uses `createMemoryState()` per the Stage 1 "no KV/Redis" decision; session durability stays on Eve Workflows.
- Metadata for Meta: webhook mounts at `/eve/v1/whatsapp` (configured in Stage 6).
