# Design: Eve Escalation Persistence

## Boundary

Eve does not run through `processWhatsAppWebhookPayload` when `WHATSAPP_EVE_ENABLED=true`, so the legacy `processWithLegacy` escalation branch is bypassed. The fix is an Eve tool, not a webhook fallback.

## Persistence helper

`src/lib/whatsapp/eve-escalation.ts` uses the existing Supabase service-role client to:
1. Upsert `whatsapp_contacts` by trusted phone.
2. Find or create an open `whatsapp_conversations` row.
3. Upsert a deterministic synthetic inbound `whatsapp_messages` row for the escalation action.
4. Insert a `whatsapp_intents` row with `support`/`handoff` intent.
5. Insert an open `whatsapp_escalations` row.
6. Mark the conversation `escalated`.

## Eve tool

`agent/tools/escalate-to-human.ts` accepts reason, summary, priority, and optional patient message. It derives the trusted phone from Eve session auth/context and refuses to write if there is no trusted WhatsApp contact.

## Instructions

`agent/instructions.md` and `agent/skills/clinical-escalation.md` must tell Eve to call `escalate-to-human` before telling the patient the case was escalated.
