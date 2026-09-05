# Design: Knowledge-Services Mapping & Appointment Notes

## Architecture Overview

This design extends the existing WhatsApp inbound agent to bridge the semantic gap between knowledge entries (informative) and services (operational), while capturing rich context in appointment notes.

## Component Changes

### 1. Database Schema

#### Migration: Add notes to appointments
```sql
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS notes text;
```

#### Migration: Add summary to conversations
```sql
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS summary text;
```

#### Migration: Create knowledge-service links table
```sql
CREATE TABLE IF NOT EXISTS whatsapp_knowledge_service_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_entry_id uuid NOT NULL REFERENCES whatsapp_knowledge_entries(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(knowledge_entry_id, service_id)
);

-- RLS policies
ALTER TABLE whatsapp_knowledge_service_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_knowledge_service_links FORCE ROW LEVEL SECURITY;

-- Admin-only write, agent read
CREATE POLICY "whatsapp_knowledge_service_links_admin_write"
  ON whatsapp_knowledge_service_links FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
```

### 2. Backend Resolution (catalog.ts)

#### New function: resolveKnowledgeToService
```typescript
export async function resolveKnowledgeToService(
  knowledgeEntryId: string,
  knowledgeEntry: { topic: string; tags: string[] }
): Promise<Service | null> {
  // 1. Check explicit links first
  const explicitLink = await getExplicitLink(knowledgeEntryId);
  if (explicitLink) return explicitLink;

  // 2. Fuzzy match against service names and tags
  const services = await listServices();
  const normalized = normalizeForMatch(knowledgeEntry.topic);
  
  // Try topic match
  const topicMatch = services.find(s => 
    normalizeForMatch(s.name).includes(normalized) ||
    normalized.includes(normalizeForMatch(s.name))
  );
  if (topicMatch) {
    logFuzzyMatch(knowledgeEntryId, topicMatch.id, 'topic');
    return topicMatch;
  }

  // Try tags match
  for (const tag of knowledgeEntry.tags) {
    const normalizedTag = normalizeForMatch(tag);
    const tagMatch = services.find(s => 
      normalizeForMatch(s.name).includes(normalizedTag)
    );
    if (tagMatch) {
      logFuzzyMatch(knowledgeEntryId, tagMatch.id, 'tag');
      return tagMatch;
    }
  }

  // 3. Default to "Valoración general"
  const defaultService = services.find(s => 
    normalizeForMatch(s.name).includes('valoracion')
  );
  logUnresolvedMatch(knowledgeEntryId);
  return defaultService ?? null;
}
```

#### Helper: getExplicitLink
```typescript
async function getExplicitLink(knowledgeEntryId: string): Promise<Service | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('whatsapp_knowledge_service_links')
    .select('service_id, services(id, name, duration_minutes)')
    .eq('knowledge_entry_id', knowledgeEntryId)
    .maybeSingle();

  if (error || !data) return null;
  const service = data.services as any;
  return { id: service.id, name: service.name, durationMinutes: service.duration_minutes };
}
```

#### Helper: logFuzzyMatch
```typescript
function logFuzzyMatch(knowledgeEntryId: string, serviceId: string, matchType: 'topic' | 'tag') {
  recordWhatsAppAiEvent({
    type: 'knowledge_service_resolution',
    outcome: 'success',
    diagnostics: { knowledgeEntryId, serviceId, matchType, method: 'fuzzy' }
  });
}
```

### 3. Appointment Notes (booking.ts)

#### Extend bookAppointment signature
```typescript
export async function bookAppointment(input: {
  patientId: string;
  serviceId: string;
  providerId: string;
  startAt: Date;
  endAt: Date;
  notes?: string;  // NEW
}): Promise<Appointment | AppointmentConflict> {
  // ... existing logic ...
  
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      patient_id: input.patientId,
      service_id: input.serviceId,
      provider_id: input.providerId,
      start_at: input.startAt.toISOString(),
      end_at: input.endAt.toISOString(),
      status: 'requested',
      notes: input.notes ?? null,  // NEW
    })
    .select()
    .single();
  
  // ... rest of logic ...
}
```

### 4. Conversation Summary (store.ts)

#### Extend WhatsAppConversationContext
```typescript
export type WhatsAppConversationContext = {
  bookingContext?: JsonPayload | null;
  lastIntent?: string | null;
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  summary?: string | null;  // NEW
};
```

#### Update loadWhatsAppConversationContext
```typescript
export async function loadWhatsAppConversationContext(conversationId: string): Promise<WhatsAppConversationContext> {
  const result = await db()
    .from('whatsapp_conversations')
    .select('booking_context, last_intent, summary')  // ADD summary
    .eq('id', conversationId)
    .maybeSingle();
  
  throwIfError(result.error, 'Could not load WhatsApp conversation context');
  return {
    bookingContext: (result.data?.booking_context as JsonPayload | null | undefined) ?? null,
    lastIntent: result.data?.last_intent as string | null | undefined,
    summary: result.data?.summary as string | null | undefined,  // NEW
  };
}
```

#### Add updateConversationSummary
```typescript
export async function updateWhatsAppConversationSummary(
  conversationId: string,
  summary: string
): Promise<void> {
  const result = await db()
    .from('whatsapp_conversations')
    .update({ summary: summary.slice(0, 500) })  // Max 500 chars
    .eq('id', conversationId);
  
  throwIfError(result.error, 'Could not update WhatsApp conversation summary');
}
```

### 5. Inbound Service Integration (inbound-service.ts)

#### Capture notes when creating appointment
```typescript
async function runBookingTool(action: WhatsAppToolAction, event: NormalizedWhatsAppInboundEvent, context: Record<string, unknown> | null | undefined): Promise<...> {
  // ... existing logic ...
  
  if (action.name === 'book_appointment') {
    // ... existing validation ...
    
    const patient = await resolvePatient({ phone: event.fromPhone, fullName: action.args.fullName ?? event.profileName });
    
    // Build notes from conversation context
    const notes = buildAppointmentNotes({
      knowledgeServiceName: action.args.knowledgeServiceName,
      conversationSummary: context?.summary as string | undefined,
      userPreferences: {
        providerName: action.args.providerName,
        serviceName: action.args.serviceName,
        localDate: action.args.localDate,
      },
    });
    
    const result = await bookAppointment({
      patientId: patient.id,
      serviceId,
      providerId,
      startAt,
      endAt,
      notes,  // NEW
    });
    
    // ... rest of logic ...
  }
}
```

#### Helper: buildAppointmentNotes
```typescript
function buildAppointmentNotes(input: {
  knowledgeServiceName?: string;
  conversationSummary?: string;
  userPreferences: Record<string, unknown>;
}): string | null {
  const parts: string[] = [];
  
  if (input.knowledgeServiceName) {
    parts.push(`Servicio detallado: ${input.knowledgeServiceName}`);
  }
  
  if (input.conversationSummary) {
    parts.push(`Resumen: ${input.conversationSummary}`);
  }
  
  const prefs = Object.entries(input.userPreferences)
    .filter(([_, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  
  if (prefs) {
    parts.push(`Preferencias: ${prefs}`);
  }
  
  return parts.length > 0 ? parts.join(' | ') : null;
}
```

#### Update conversation summary after each message
```typescript
export async function processWhatsAppInboundEvent(event: NormalizedWhatsAppInboundEvent, options: WhatsAppInboundServiceOptions = {}): Promise<WhatsAppInboundEventResult> {
  // ... existing logic ...
  
  // Update conversation summary
  const summary = buildConversationSummary(conversation.summary, event.body, finalDecision.summary);
  await store.updateConversationSummary(persisted.conversationId, summary);
  
  // ... rest of logic ...
}
```

#### Helper: buildConversationSummary
```typescript
function buildConversationSummary(
  previousSummary: string | null | undefined,
  currentMessage: string | null | undefined,
  decisionSummary: string | undefined
): string {
  const parts: string[] = [];
  
  if (previousSummary) {
    parts.push(previousSummary);
  }
  
  if (currentMessage) {
    parts.push(`Usuario: ${currentMessage.slice(0, 100)}`);
  }
  
  if (decisionSummary) {
    parts.push(`Agente: ${decisionSummary.slice(0, 100)}`);
  }
  
  // Keep last 500 chars
  const full = parts.join(' | ');
  return full.length > 500 ? full.slice(-500) : full;
}
```

## Data Flow

1. User sends message → webhook receives it
2. Agent classifies message, may cite knowledge entry
3. If booking intent:
   - Resolve knowledge entry to service via explicit link or fuzzy match
   - Resolve provider name to UUID
   - Check availability
   - Create appointment with notes (knowledge service name + conversation summary + preferences)
4. Update conversation summary with key decisions
5. Return response to user

## Testing Strategy

1. **Unit tests**: Test `resolveKnowledgeToService()` with explicit links, fuzzy matches, and defaults
2. **Integration tests**: Test full booking flow with knowledge entry citation
3. **Migration tests**: Verify schema changes don't break existing data
4. **Backward compatibility**: Test appointments without notes still work

## Rollback Plan

1. Schema changes are additive (nullable columns, new table)
2. Can drop new table and columns without affecting existing functionality
3. Code changes are backward compatible (notes is optional)
