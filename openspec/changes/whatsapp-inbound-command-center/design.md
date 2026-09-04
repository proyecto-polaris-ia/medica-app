# Design: WhatsApp Inbound Agent and Command Center

## Approach
Copy the proven TravelHub WhatsApp modules into medica-app and adapt domain seams only. Transport, normalization, signature checks, and observability remain generic. Store, decisioning, orchestration, and WCC labels map to patients, appointments, and dental guardrails.

## Data Flow
Meta webhook → signature verification → normalization → WhatsApp store persistence → decisioning → deterministic backend action:
- `auto_answer`: only approved `whatsapp_knowledge_entries` citations.
- `tool_action`: backend calls `getFreeSlots`, `findNextAvailable`, `resolvePatient`, and `bookAppointment`.
- `needs_human`: backend creates escalation and sends patient/human follow-up messages.

## Safety
The LLM never writes Supabase, sends WhatsApp, decides availability, diagnoses, prescribes, or gives definitive prices. Clinical and pricing escalations are enforced before and after provider output.

## UI
WCC lives under the authenticated admin route group at `/whatsapp-command-center` and uses Spanish de México user-facing copy.
