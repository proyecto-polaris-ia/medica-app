# Proposal: WhatsApp Inbound Agent and Command Center

## Intent
Port the WhatsApp inbound agent and WhatsApp Command Center from TravelHub into medica-app, adapting the behavior to a dental clinic domain.

## Scope
- Add private Supabase tables for WhatsApp contacts, conversations, messages, intents, escalations, knowledge entries, status callbacks, and sync events.
- Add Meta WhatsApp webhook verification and signed POST processing.
- Add an inbound orchestrator that persists messages, asks the agent for a structured decision, executes deterministic booking tools, sends responses, and escalates unsafe messages.
- Add an authenticated admin Command Center for operations visibility and knowledge management.

## Non-goals
- No automated diagnosis, prescription, medication guidance, or definitive pricing.
- No direct edits to TravelHub.
- No patient-facing authentication for WhatsApp users.

## Rollback
Remove the WhatsApp route, WCC admin route, copied/adapted WhatsApp libraries, and migration `0005_whatsapp_inbound_command_center.sql` before deployment, or roll back the migration in the database if already applied.
