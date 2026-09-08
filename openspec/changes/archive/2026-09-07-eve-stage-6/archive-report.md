# Archive Report: Eve Stage 6 Production Deploy

## Status
Archived — Stage 6 SDD cycle completed.

## Change
`2026-09-07-eve-stage-6`

## Summary
Added a `WHATSAPP_EVE_ENABLED` feature flag and routing logic so the WhatsApp webhook forwards verified messages to the Eve agent or the legacy agent, with legacy fallback on Eve failure, structured request logging, and a monitoring/rollback runbook. Legacy code remains untouched (removal is Stage 7).

## Specs Synced

| Domain | Action | Details |
| --- | --- | --- |
| `eve-framework` | Updated | Added routing feature flag, legacy fallback, observability, and runbook requirements. |

## Verification

| Check | Result |
| --- | --- |
| Focused routing tests | PASS — 9 tests |
| Full test suite | PASS — 65 files, 424 tests |
| Typecheck | PASS — `npx tsc --noEmit` exit 0 |

## Files Added

- `src/lib/whatsapp/eve-flag.ts`
- `src/lib/whatsapp/__tests__/eve-flag.test.ts`
- `app/api/whatsapp/webhook/route.test.ts`
- `docs/eve-runbook.md`

## Files Modified

- `app/api/whatsapp/webhook/route.ts` — routing + forwarding + fallback + logging.
- `.env.local.example` — documented `WHATSAPP_EVE_ENABLED`.
- `openspec/specs/eve-framework/spec.md` — synced Stage 6 requirements.

## Final State
All Stage 6 code tasks complete. Enabling the flag, recall that the env-var change is a Vercel-side action performed by the operator (I cannot mutate the `proyecto-polaris` project's env vars). PR target remains `feat/eve-migration`.
