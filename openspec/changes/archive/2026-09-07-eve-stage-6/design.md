# Design: Eve Stage 6 Production Deploy

## Dependencies Verified
Stages 1–5 merged into `feat/eve-migration` (PRs #38–#42). The Eve channel mounts at `/eve/v1/whatsapp`; the legacy webhook is `app/api/whatsapp/webhook/route.ts`.

## Approach: internal forwarding with legacy fallback

Meta keeps pointing at `app/api/whatsapp/webhook`. The route keeps its verification + observability, then branches:

```
POST /api/whatsapp/webhook
  → verify signature (shared, unchanged)
  → parse payload
  → if WHATSAPP_EVE_ENABLED is truthy:
        forward(rawBody, signatureHeader) → /eve/v1/whatsapp
        on forward throw → legacy path (fallback)
  → else: legacy path (existing inline handling)
```

This gives instant rollback via a single env toggle (no Meta webhook URL change), and guarantees no message loss on Eve failure.

## Flag semantics
Reuse the repo convention from `WHATSAPP_FLOW_ENGINE_ENABLED` (`isFlowEngineEnabled`): truthy when lowercased/trimmed value is `"true"` | `"1"` | `"yes"`. Extracted as a small pure helper so it is unit-testable.

## Forward mechanics
- Forward `method: POST`, `Content-Type: application/json`, `x-hub-signature-256` header, and the raw body to `new URL("/eve/v1/whatsapp", request.url)`.
- Return `NextResponse` with Eve's status and body. When Eve responds, propagate status/body verbatim.
- Eve's Chat SDK WhatsApp adapter independently re-verifies the signature against `WHATSAPP_APP_SECRET`, so the security boundary is not weakened by the hop.

## Legacy path preservation
The existing inline legacy block (observability `createWhatsAppAiCorrelationContext`, `recordWhatsAppAiEvent`, `processWhatsAppWebhookPayload`, `WhatsAppStoreConfigurationError` handling) is kept intact and extracted so both the normal-legacy branch and the fallback branch share it.

## Observability
Add one structured `console.log(JSON.stringify({ type: 'whatsapp_webhook_route', agent: 'eve'|'legacy', messageId, timestamp }))` per POST. The route already emits AI observability events on the legacy path; this new line adds a route-level decision marker for Vercel log filtering.

## Testing
Credential-free unit tests under `tests/api/whatsapp-webhook/` (outside `agent/`) that:
- exercise the pure flag parser for `true/1/yes/false/undefined`.
- exercise the routing decision with a stubbed Eve forward and stubbed legacy processing, asserting forward-on-flag, legacy-on-off, and fallback-on-forward-throw.

## Risk controls
- Legacy code untouched (removal is Stage 7).
- Flag defaults to legacy (off) when unset.
- Fallback guarantees no dropped messages.
- No schema, tool, skill, or channel changes.
