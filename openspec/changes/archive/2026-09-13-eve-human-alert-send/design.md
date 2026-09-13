# Design: Send Eve human escalation alerts

## Approach

Extend `createEveWhatsAppEscalation` so the helper owns the complete Eve escalation side effect set:

1. Persist synthetic inbound event.
2. Reuse an existing escalation if the synthetic message is idempotent.
3. Create intent and escalation rows for new escalations.
4. Mark the conversation escalated.
5. If `humanAlertPhone` input or `WHATSAPP_HUMAN_ALERT_PHONE` exists, send a WhatsApp alert with `sendWhatsAppTextMessage`.
6. Persist the human alert outbound message with `insertWhatsAppOutboundMessage(... purpose: 'human_alert')`.
7. Return alert send status to the Eve tool.

## Rationale

The legacy path sends the human alert in the orchestration layer. Eve bypasses that legacy orchestration by calling a tool, so the Eve-specific helper must perform the same deterministic alert side effect after creating a new escalation.

## Idempotency

Existing escalations are detected before intent/escalation creation. The helper returns without sending a human alert for existing escalations to avoid duplicate notifications.

## Observability

The Eve tool includes `humanAlert.configured`, `humanAlert.sent`, `humanAlert.skipped`, and optional `humanAlert.error` in the tool result.
