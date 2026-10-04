# Delta for Eve Framework

## REMOVED Requirements

### Requirement: WhatsApp Agent Routing Feature Flag

(Reason: `WHATSAPP_EVE_ENABLED` is deleted; the webhook forwards every verified
message to Eve with no routing switch.)
(Migration: The forwarding behavior is specified by `Unconditional Eve Webhook
Forwarding`; the operator removes the Vercel variable with `vercel env rm
WHATSAPP_EVE_ENABLED` as documented in the runbook.)

### Requirement: Legacy Fallback on Eve Forward Failure

(Reason: the legacy path is deleted, so there is nothing to fall back to. A
forward failure now surfaces as an error response instead of silently using the
legacy agent.)
(Migration: Forward failures are observable through `WhatsApp Routing
Observability`; Meta retries the delivery.)

### Requirement: WhatsApp Channel Non-Interference

(Reason: it mandated that Stage 5 not modify `app/api/whatsapp/webhook/route.ts`;
Stage 7 intentionally rewrites that file into the Eve-only forwarder.)
(Migration: The route is governed by `Unconditional Eve Webhook Forwarding`.)

### Requirement: Non-Interference with Legacy Agent

(Reason: it mandated that Stage 1 not modify `src/lib/whatsapp/`, `src/lib/flows/`,
or `src/lib/ai/`; Stage 7 deletes legacy files in those directories and extracts
shared types.)
(Migration: The surviving modules and their consumers are scoped by
`whatsapp-inbound-automation` and `flow-engine` deltas.)

---

## ADDED Requirements

### Requirement: Unconditional Eve Webhook Forwarding

`app/api/whatsapp/webhook/route.ts` MUST verify the Meta signature and then
always `POST` the raw body to `/eve/v1/whatsapp`. It MUST NOT contain a legacy
branch, a fallback, or a `WHATSAPP_EVE_ENABLED` read. The Meta webhook URL MUST
remain unchanged.

#### Scenario: verified message is forwarded to Eve
- GIVEN a valid `x-hub-signature-256` and JSON body
- WHEN the route handles the POST
- THEN it MUST forward the raw body to `/eve/v1/whatsapp`
- AND it MUST NOT invoke any legacy processing path

#### Scenario: invalid signature rejected before forwarding
- GIVEN an invalid signature
- WHEN the route receives the POST
- THEN it MUST reject the request without forwarding to Eve

#### Scenario: forward failure is surfaced, not swallowed
- GIVEN a verified message
- AND the forward request to Eve fails
- WHEN the route handles the message
- THEN it MUST return an error status
- AND it MUST NOT fall back to a legacy agent

---

## MODIFIED Requirements

### Requirement: WhatsApp Routing Observability

The route MUST emit a structured log record for every verified message naming the
forwarding target (`eve`) and the forward outcome, plus the correlation id and,
when available, the inbound message id.

#### Scenario: forwarding decision is logged
- GIVEN a verified message POST is handled
- WHEN the route forwards to Eve
- THEN a structured log record includes the forwarding target `eve`, the
  correlation id, and, when available, the inbound message id

#### Scenario: forward outcome is logged
- GIVEN a verified message POST
- WHEN the Eve forward completes or fails
- THEN a structured log record includes the outcome and the correlation id

### Requirement: Eve Deployment Runbook

`docs/eve-runbook.md` MUST document that the webhook forwards unconditionally to
Eve, the rollback procedure (`git revert` plus redeploy), the operator removal of
`WHATSAPP_EVE_ENABLED` (`vercel env rm`), the unchanged Meta webhook URL,
monitoring surfaces, and common issues.

#### Scenario: runbook covers rollback and monitoring
- GIVEN `docs/eve-runbook.md`
- WHEN inspected
- THEN it includes the Eve-only forwarding model, rollback via `git revert` and
  redeploy, the `vercel env rm WHATSAPP_EVE_ENABLED` operator step, the unchanged
  Meta URL, monitoring guidance, and issue resolutions
- AND it MUST NOT instruct enabling or disabling a routing flag in code
