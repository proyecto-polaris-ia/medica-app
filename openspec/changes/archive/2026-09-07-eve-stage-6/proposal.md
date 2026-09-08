# Proposal: Eve Stage 6 — Production Deploy with Feature Flag

## Intent
Deploy the Eve agent to production behind a feature flag (`WHATSAPP_EVE_ENABLED`) that routes inbound WhatsApp messages to Eve or to the legacy agent, with an instant-rollback switch, structured request logging, and a monitoring/rollback runbook.

## Context
Stages 1–5 are complete on `feat/eve-migration` (PRs #38–#42): the Eve agent has six tools, three skills, and the Chat SDK WhatsApp channel mounted at `/eve/v1/whatsapp`. Production WhatsApp traffic still flows to the legacy agent through `app/api/whatsapp/webhook/route.ts`. This stage introduces the toggle without removing legacy code (that is Stage 7).

## Scope
- Add a feature flag `WHATSAPP_EVE_ENABLED` (documented in `.env.local.example`, consumed in the webhook route).
- Add routing logic in `app/api/whatsapp/webhook/route.ts`: after signature verification, forward to `/eve/v1/whatsapp` when the flag is on, otherwise process via the existing legacy path; fall back to legacy if the Eve forward fails.
- Add structured request logging naming the active agent (`eve` vs `legacy`) for observability.
- Add a credential-free test covering the routing decision and the legacy-fallback behavior.
- Write `docs/eve-runbook.md` documenting monitoring, rollback, and common issues.

## Scope Adaptation
The issue offers two routing options. We choose the **forwarding** approach (single Meta webhook URL, route internally) rather than switching Meta's webhook URL, because it delivers the instant-rollback property without a Meta-side config change: toggling `WHATSAPP_EVE_ENABLED` is the only switch. The legacy verification/observability flow is preserved on both paths; Eve re-verifies the forwarded signature itself against `WHATSAPP_APP_SECRET`.

The issue sample's `handleLegacy` is simplified here to reuse the existing inline legacy handling (which already records observability events and handles store-configuration errors), so we do not regress the audit trail.

## Non-goals
- Do NOT remove legacy agent code (Stage 7).
- Do NOT remove the feature flag or make Eve the only path.
- Do NOT change Meta's webhook URL as part of this change.
- Do NOT modify tools, skills, channels, or Supabase schema.

## Rollback
`WHATSAPP_EVE_ENABLED=false` (or unset) routes all traffic to the legacy agent with no code deploy beyond an env change. Rollback of the code change itself = revert the PR on `feat/eve-migration`.
