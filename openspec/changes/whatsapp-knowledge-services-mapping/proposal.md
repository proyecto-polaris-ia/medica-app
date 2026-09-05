# Proposal: WhatsApp Knowledge-Services Mapping & Appointment Notes

## Summary

Bridge the semantic gap between WhatsApp knowledge entries (informative/marketing) and the services table (operational/booking) by implementing explicit knowledge-to-service mapping, fuzzy fallback resolution, and adding a notes field to appointments to capture detailed service information from conversations.

## Problem

### Semantic Gap
There are two parallel worlds for "services":

1. **Knowledge entries** (`whatsapp_knowledge_entries`): Rich Q&A content with detailed descriptions like "limpieza dental profesional elimina sarro y manchas"
2. **Services table** (`services`): Operational records with UUIDs and simple names like "Limpieza", "Valoración general"

### Current Behavior
- When users ask "¿Qué servicios ofrecen?", the agent responds from **knowledge** (detailed, marketing-friendly)
- When users request a service mentioned in knowledge (e.g., "quiero blanqueamiento dental"), the agent tries to match against **services** table
- If the knowledge entry says "blanqueamiento dental" but the service is named "Blanqueamiento", the fuzzy match may fail
- The agent escalates instead of completing the booking

### Missing Context
- Appointments have no `notes` field to capture which detailed service the user actually wanted
- Conversations have no summary field for human escalations to see conversation context
- When a user says "quiero una limpieza profunda" but the service is "Limpieza", there's no way to preserve that detail

## Solution

### 1. Explicit Knowledge-Service Linking Table
Create `whatsapp_knowledge_service_links` to map knowledge entries to service IDs:
- Primary resolution path: explicit links maintained by admins
- Fallback: fuzzy name/tag matching with logging
- Override mechanism: admins can manually link entries when fuzzy matching fails

### 2. Fuzzy Matching Fallback
Reuse the existing `normalizeForMatch` pattern from provider resolution:
- Match knowledge entry tags/topic against service names
- Log mismatches for admin review
- Default to "Valoración general" if no match found

### 3. Appointment Notes Field
Add `notes text` column to `appointments`:
- Capture the detailed service name from knowledge (if different from service_id)
- Include conversation summary (last N key messages)
- Store user preferences (doctor, time, special requests)
- Preserve clinical context if mentioned (symptoms, allergies)

### 4. Conversation Summary Field
Add `summary text` column to `whatsapp_conversations`:
- Rolling summary updated each turn
- Used for human escalations to see context
- Captures key decisions and preferences

## Scope

### In Scope
- Migration: Add `notes` to `appointments`
- Migration: Add `summary` to `whatsapp_conversations`
- Migration: Create `whatsapp_knowledge_service_links` table
- Backend: Implement knowledge-to-service resolution with explicit links + fuzzy fallback
- Backend: Capture and save notes when creating appointments
- Backend: Update conversation summary on each turn
- LLM prompt: Instruct agent to include service details in notes

### Out of Scope
- Admin UI for managing knowledge-service links (future enhancement)
- Automatic knowledge entry creation from conversations
- Multi-language support (Spanish only for now)

## Risks

| Risk | Mitigation |
|------|------------|
| Prompt token growth from richer catalog | Keep catalog injection minimal (id, name, duration only) |
| False fuzzy matches | Log all fuzzy matches for admin review; use explicit links as primary path |
| Schema changes require migration | Test migration locally before deploying |
| LLM hallucinating service names | Backend validates all service names against DB; never trust LLM output for IDs |

## Implementation Approach

### Phase 1: Database Schema
1. Add `notes text` to `appointments`
2. Add `summary text` to `whatsapp_conversations`
3. Create `whatsapp_knowledge_service_links` table with RLS

### Phase 2: Backend Resolution
1. Implement `resolveKnowledgeToService()` in `catalog.ts`
2. Check explicit links first, then fuzzy fallback
3. Log resolution attempts for debugging

### Phase 3: Appointment Notes
1. Thread `notes` through `bookAppointment()` function
2. Capture service details from conversation context
3. Include conversation summary in notes

### Phase 4: Conversation Summary
1. Update `summary` field on each inbound message
2. Use LLM to generate rolling summary (or simple concatenation)
3. Include summary in escalation context

## Status

In progress (PR pending)

## Related

- Issue #25: https://github.com/proyecto-polaris-ia/medica-app/issues/25
- PR #24: Complete booking flow with name-to-ID resolution (merged)
- PR #23: Conversation history context (merged)
