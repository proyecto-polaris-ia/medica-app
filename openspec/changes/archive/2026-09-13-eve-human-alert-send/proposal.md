# Proposal: Send Eve human escalation alerts

## Summary

Send a WhatsApp alert to the configured human phone when Eve creates a human escalation, matching the legacy inbound escalation behavior.

## Problem

Eve-created escalations currently persist `whatsapp_escalations` rows, but they do not notify the configured human alert phone. The legacy path already sends and persists a `human_alert` outbound message using `WHATSAPP_HUMAN_ALERT_PHONE`.

## Scope

- Send a WhatsApp text alert to `WHATSAPP_HUMAN_ALERT_PHONE` when a new Eve escalation is created.
- Persist the outbound alert as a WhatsApp message with `purpose: human_alert`.
- Keep idempotent behavior: existing escalations for the same synthetic message must not send duplicate human alerts.
- Surface human alert send status in the Eve tool result for observability.

## Non-goals

- Changing escalation table schema.
- Changing patient-facing escalation copy.
- Sending duplicate alerts for existing/idempotent escalation calls.

## Rollback

Revert the Eve escalation helper/tool changes and tests. Existing escalation persistence remains unaffected.
