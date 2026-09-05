# Archive Report: WhatsApp Knowledge-Services Mapping & Appointment Notes

## Change Summary

**Issue**: #25 - https://github.com/proyecto-polaris-ia/medica-app/issues/25
**Branch**: `feat/whatsapp-knowledge-services-mapping`
**Status**: ✅ Complete

## What Was Done

### 1. Database Schema Changes

#### Migration 0007: Add notes to appointments
- Added nullable `notes text` column to `appointments` table
- Backward compatible (existing appointments work without notes)

#### Migration 0008: Add summary to conversations
- Added nullable `summary text` column to `whatsapp_conversations` table
- Backward compatible (existing conversations work without summary)

#### Migration 0009: Create knowledge-service links table
- Created `whatsapp_knowledge_service_links` table with:
  - `id uuid PRIMARY KEY`
  - `knowledge_entry_id uuid REFERENCES whatsapp_knowledge_entries(id)`
  - `service_id uuid REFERENCES services(id)`
  - `created_at timestamptz`
  - `UNIQUE(knowledge_entry_id, service_id)`
- Enabled RLS with admin-only write, agent read policies

### 2. Backend Implementation

#### catalog.ts - Knowledge-to-Service Resolution
- Added `resolveKnowledgeToService()` function
- Checks explicit links first via `getExplicitServiceLink()`
- Falls back to fuzzy matching using `normalizeForMatch()`
- Defaults to "Valoración general" if no match found
- Logs resolution attempts for debugging

#### booking.ts - Appointment Notes
- Extended `bookAppointment()` to accept optional `notes` parameter
- Notes are saved to database when creating appointments
- Backward compatible (notes is optional)

#### store.ts - Conversation Summary
- Extended `WhatsAppConversationContext` to include `summary` field
- Updated `loadWhatsAppConversationContext()` to load summary
- Added `updateWhatsAppConversationSummary()` function
- Added to `WhatsAppStore` type

#### inbound-service.ts - Integration
- Updated `runBookingTool()` to build notes from:
  - `knowledgeServiceName` from tool action
  - `conversationSummary` from context
  - User preferences (provider, service, date)
- Updated `processWhatsAppInboundEvent()` to:
  - Pass conversation summary to booking tool
  - Update conversation summary after each message
- Added helper functions:
  - `buildAppointmentNotes()` - formats notes from context
  - `buildConversationSummary()` - builds rolling summary

#### whatsapp-inbound-agent.ts - Type Extensions
- Added `knowledgeServiceName` to `WhatsAppToolAction.args`

#### whatsapp-llm-provider.ts - Prompt Updates
- Updated system prompt to instruct LLM to include `knowledgeServiceName` when citing knowledge

## Testing

- ✅ TypeScript compiles without errors
- ✅ All 269 tests pass (44 files)
- ✅ Backward compatible (existing functionality unchanged)

## Files Changed

### Migrations
- `supabase/migrations/0007_appointment_notes.sql`
- `supabase/migrations/0008_conversation_summary.sql`
- `supabase/migrations/0009_knowledge_service_links.sql`
- `supabase/migrations/down/0007_appointment_notes.down.sql`
- `supabase/migrations/down/0008_conversation_summary.down.sql`
- `supabase/migrations/down/0009_knowledge_service_links.down.sql`

### Backend
- `src/lib/booking/catalog.ts` - Added resolveKnowledgeToService
- `src/lib/booking/booking.ts` - Added notes parameter
- `src/lib/whatsapp/store.ts` - Added summary support
- `src/lib/whatsapp/inbound-service.ts` - Integrated notes and summary
- `src/lib/ai/whatsapp-inbound-agent.ts` - Extended tool args
- `src/lib/ai/whatsapp-llm-provider.ts` - Updated prompt

### Documentation
- `openspec/changes/whatsapp-knowledge-services-mapping/proposal.md`
- `openspec/changes/whatsapp-knowledge-services-mapping/specs/knowledge-services-mapping/spec.md`
- `openspec/changes/whatsapp-knowledge-services-mapping/design.md`
- `openspec/changes/whatsapp-knowledge-services-mapping/tasks.md`
- `openspec/changes/whatsapp-knowledge-services-mapping/archive-report.md` (this file)
- `openspec/specs/whatsapp-inbound-automation/spec.md` - Updated with new requirements

## How It Works

### Flow 1: User requests service from knowledge
1. User: "Quiero blanqueamiento dental"
2. Agent cites knowledge entry about "blanqueamiento dental"
3. Agent includes `knowledgeServiceName: "blanqueamiento dental"` in tool action
4. Backend resolves knowledge entry to service via:
   - Explicit link (if exists) → returns linked service
   - Fuzzy match (if no link) → matches "blanqueamiento" to "Blanqueamiento" service
   - Default (if no match) → returns "Valoración general"
5. Appointment created with notes: "Servicio detallado: blanqueamiento dental | Preferencias: providerName: Dra. Ana Martínez, localDate: 2026-09-15"

### Flow 2: Conversation summary
1. User sends multiple messages about appointment
2. Each message updates conversation summary (max 500 chars)
3. Summary includes: "Usuario: Quiero cita con Dra. Ana | Agente: Claro, te ayudo a agendar..."
4. If escalated, human agent sees full context

## Next Steps

- [ ] Run migrations on production database
- [ ] Create admin UI for managing knowledge-service links
- [ ] Monitor fuzzy match logs for false positives
- [ ] Consider adding automatic link suggestions based on match frequency

## Rollback Plan

All schema changes are additive (nullable columns, new table):
1. Can drop `whatsapp_knowledge_service_links` table
2. Can drop `notes` column from `appointments`
3. Can drop `summary` column from `whatsapp_conversations`
4. Code changes are backward compatible
