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
- **Deploy fix**: the first Vercel build failed with `accessToken is required. Set WHATSAPP_ACCESS_TOKEN...` because `createWhatsAppAdapter()` throws at module load and the Vercel project has no `WHATSAPP_*` variables in its build environment (only `WHATSAPP_FLOW_ENGINE_ENABLED`, Production-only). The channel now gates adapter construction behind a completeness check over all four `WHATSAPP_*` vars, so `eve build` succeeds without credentials (matching the repo's "external integrations MUST degrade gracefully" rule). Real credentials are still required for live traffic and are added in Stage 6.
- The channel deep-links `eve/channels/chat-sdk` and `chat`, which use Node subpath `#` imports Vite can't externalize; the test asserts source shape instead of runtime-import (mirrors `tests/agent/setup.test.ts`).
- State uses `createMemoryState()` per the Stage 1 "no KV/Redis" decision; session durability stays on Eve Workflows.
- Metadata for Meta: webhook mounts at `/eve/v1/whatsapp` (configured in Stage 6).
