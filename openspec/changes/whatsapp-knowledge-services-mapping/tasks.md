# Tasks: Knowledge-Services Mapping & Appointment Notes

## Task 1: Database Migration - Add notes to appointments

**Priority**: High
**Dependencies**: None
**Estimated effort**: 15 min

### Steps
1. Create migration file `supabase/migrations/0007_appointment_notes.sql`
2. Add `notes text` nullable column to `appointments` table
3. Create down migration `supabase/migrations/down/0007_appointment_notes.down.sql`
4. Test migration locally

### Acceptance Criteria
- Migration runs without errors
- Existing appointments still work
- New appointments can have notes

---

## Task 2: Database Migration - Add summary to conversations

**Priority**: High
**Dependencies**: None
**Estimated effort**: 15 min

### Steps
1. Create migration file `supabase/migrations/0008_conversation_summary.sql`
2. Add `summary text` nullable column to `whatsapp_conversations` table
3. Create down migration `supabase/migrations/down/0008_conversation_summary.down.sql`
4. Test migration locally

### Acceptance Criteria
- Migration runs without errors
- Existing conversations still work
- New conversations can have summary

---

## Task 3: Database Migration - Create knowledge-service links table

**Priority**: High
**Dependencies**: None
**Estimated effort**: 30 min

### Steps
1. Create migration file `supabase/migrations/0009_knowledge_service_links.sql`
2. Create `whatsapp_knowledge_service_links` table with:
   - `id uuid PRIMARY KEY`
   - `knowledge_entry_id uuid REFERENCES whatsapp_knowledge_entries(id)`
   - `service_id uuid REFERENCES services(id)`
   - `created_at timestamptz`
   - `UNIQUE(knowledge_entry_id, service_id)`
3. Enable RLS
4. Create policies for admin write, agent read
5. Create down migration
6. Test migration locally

### Acceptance Criteria
- Table created with correct structure
- RLS policies work correctly
- Admin can create links
- Agent can read links

---

## Task 4: Backend - Implement resolveKnowledgeToService

**Priority**: High
**Dependencies**: Task 3
**Estimated effort**: 1 hour

### Steps
1. Add `resolveKnowledgeToService()` function to `src/lib/booking/catalog.ts`
2. Implement explicit link lookup
3. Implement fuzzy matching fallback (reuse `normalizeForMatch`)
4. Add logging for fuzzy matches and unresolved attempts
5. Default to "Valoración general" if no match
6. Write unit tests

### Acceptance Criteria
- Explicit links take precedence
- Fuzzy matching works with accent normalization
- Logging captures resolution attempts
- Default service is returned when no match

---

## Task 5: Backend - Extend bookAppointment with notes

**Priority**: High
**Dependencies**: Task 1
**Estimated effort**: 30 min

### Steps
1. Update `bookAppointment()` signature in `src/lib/booking/booking.ts` to accept optional `notes`
2. Thread notes through to database insert
3. Update tests to verify notes are saved
4. Ensure backward compatibility (notes is optional)

### Acceptance Criteria
- bookAppointment accepts optional notes
- Notes are saved to database
- Existing calls without notes still work

---

## Task 6: Backend - Extend conversation context with summary

**Priority**: Medium
**Dependencies**: Task 2
**Estimated effort**: 30 min

### Steps
1. Update `WhatsAppConversationContext` type in `src/lib/whatsapp/store.ts` to include `summary`
2. Update `loadWhatsAppConversationContext()` to load summary
3. Add `updateWhatsAppConversationSummary()` function
4. Update tests

### Acceptance Criteria
- Context includes summary field
- Summary can be loaded and updated
- Backward compatible (nullable)

---

## Task 7: Backend - Integrate notes and summary in inbound service

**Priority**: High
**Dependencies**: Tasks 4, 5, 6
**Estimated effort**: 1 hour

### Steps
1. Update `runBookingTool()` in `src/lib/whatsapp/inbound-service.ts` to:
   - Accept `knowledgeServiceName` from tool action
   - Build notes from knowledge service name + conversation summary + preferences
   - Pass notes to `bookAppointment()`
2. Update `processWhatsAppInboundEvent()` to:
   - Build conversation summary after each message
   - Call `updateWhatsAppConversationSummary()`
3. Add helper functions `buildAppointmentNotes()` and `buildConversationSummary()`
4. Write integration tests

### Acceptance Criteria
- Notes capture knowledge service name
- Notes include conversation summary
- Conversation summary updates after each message
- Full booking flow works end-to-end

---

## Task 8: LLM Prompt - Add knowledgeServiceName to tool args

**Priority**: Medium
**Dependencies**: Task 7
**Estimated effort**: 30 min

### Steps
1. Update `WhatsAppToolAction.args` type in `src/lib/ai/whatsapp-inbound-agent.ts` to include `knowledgeServiceName`
2. Update system prompt in `src/lib/ai/whatsapp-llm-provider.ts` to instruct LLM to include knowledge service name when citing knowledge
3. Update tests

### Acceptance Criteria
- LLM includes knowledgeServiceName in tool actions
- Backend receives and uses knowledgeServiceName

---

## Task 9: Testing & Verification

**Priority**: High
**Dependencies**: All previous tasks
**Estimated effort**: 1 hour

### Steps
1. Run all existing tests to ensure no regressions
2. Write new tests for:
   - `resolveKnowledgeToService()` with explicit links
   - `resolveKnowledgeToService()` with fuzzy matching
   - `resolveKnowledgeToService()` with default fallback
   - Appointment creation with notes
   - Conversation summary updates
3. Run TypeScript compiler
4. Run full test suite
5. Manual testing of booking flow

### Acceptance Criteria
- All tests pass
- TypeScript compiles without errors
- Manual testing shows correct behavior

---

## Task 10: Documentation & Archive

**Priority**: Medium
**Dependencies**: Task 9
**Estimated effort**: 30 min

### Steps
1. Update `openspec/specs/whatsapp-inbound-automation/spec.md` with new requirements
2. Create archive report
3. Commit all changes
4. Create PR

### Acceptance Criteria
- Spec updated with knowledge-service mapping requirements
- Archive report created
- PR created with all changes

---

## Summary

**Total estimated effort**: 6 hours
**Critical path**: Tasks 1-3 (migrations) → Task 4 (resolution) → Task 7 (integration) → Task 9 (testing)
**Parallel opportunities**: Tasks 1, 2, 3 can run in parallel
