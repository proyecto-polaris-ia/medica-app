# Exploration: WhatsApp knowledge-services mapping

## Current State

The WhatsApp inbound agent operates in two modes:

1. **Static knowledge answers** — `loadApprovedWhatsAppKnowledgeEntries()` reads `whatsapp_knowledge_entries` (topic, question, answer, tags) and the LLM or a local substring matcher answers general questions such as "¿qué servicios ofrecen?".
2. **Booking tool actions** — the agent emits `tool_action` with `serviceName`/`providerName`; `runBookingTool()` resolves names to UUIDs via `resolveServiceByName` / `resolveProviderByName` in `src/lib/booking/catalog.ts`.

The catalog is already injected into every LLM call inside `processWhatsAppInboundEvent()`:

```ts
// src/lib/whatsapp/inbound-service.ts
const bookingCatalog = {
  services: catalog.services.map((s) => ({ id: s.id, name: s.name })),
  providers: catalog.providers.map((p) => ({ id: p.id, name: p.name })),
};
```

The system prompt (`src/lib/ai/whatsapp-llm-provider.ts`) already tells the model to use names instead of UUIDs:

```
Para agendar, usa serviceName y providerName (nombres legibles) en lugar de UUIDs.
El backend resolverá los IDs.
```

However, the **services catalog only carries `id` and `name`** (duration is dropped), and `whatsapp_knowledge_entries` have **no reference to the `services` table**. Therefore, when a user asks about a rich knowledge topic (e.g. "blanqueamiento dental") and then says "quiero agendar eso", the agent has no deterministic bridge from the knowledge concept to the operational `service_id`.

Appointments are written by `bookAppointment()` (`src/lib/booking/booking.ts`) with only:

```ts
{ patient_id, service_id, provider_id, start_at, end_at, status }
```

There is no `notes` column, so context such as "usuario mencionó blanqueamiento por 45 min" or "primera visita de valoración" is lost from the appointment record.

Conversation state lives in `whatsapp_conversations.booking_context` (JSONB) and `last_intent`; intents store a per-message `summary`, but there is no rolling conversation summary column for human handoff context.

## Affected Areas

- `src/lib/ai/whatsapp-inbound-agent.ts` — decision types, tool action args, local fallback matchers.
- `src/lib/ai/whatsapp-llm-provider.ts` — system prompt and user payload shape; catalog usage instructions.
- `src/lib/whatsapp/inbound-service.ts` — catalog assembly, name resolution, booking tool execution.
- `src/lib/booking/catalog.ts` — service/provider listing and fuzzy name resolution.
- `src/lib/booking/booking.ts` — appointment creation signature.
- `src/lib/whatsapp/store.ts` — conversation status updates, intent persistence.
- `supabase/migrations/0001_agenda_tables.sql` — `services` and `appointments` schema.
- `supabase/migrations/0005_whatsapp_inbound_command_center.sql` — `whatsapp_knowledge_entries` schema.
- `openspec/specs/whatsapp-inbound-automation/spec.md` — existing name-resolution and catalog-injection requirements.

## Gap Analysis

| Gap | Evidence | Impact |
|-----|----------|--------|
| Knowledge entries are standalone | `whatsapp_knowledge_entries` has no `service_id` or mapping table | Agent can describe a service but cannot reliably book the matching operational service |
| Catalog is name-only | `bookingCatalog.services` drops `durationMinutes` | Model lacks duration context when proposing slots |
| Appointments lack free-text notes | `appointments` table has no `notes` column | Service details discussed over WhatsApp are not preserved for the clinic |
| No explicit conversation summary | `whatsapp_conversations` has only `last_intent` and `booking_context` | Human escalations miss a condensed history |

Provider name-to-ID resolution is already implemented and works as a pattern we can reuse:

```ts
// src/lib/booking/catalog.ts
export async function resolveProviderByName(nameQuery: string): Promise<Provider | null> {
  const providers = await listProviders();
  const normalized = normalizeForMatch(nameQuery);
  return providers.find((p) => normalizeForMatch(p.name).includes(normalized)) ?? null;
}
```

The same `normalizeForMatch` helper (lowercase + NFD decompose + strip diacritics) can be reused for knowledge-to-service fuzzy matching.

## Approaches

### 1. Service catalog injection in LLM prompt

**Approach A — Inject enriched catalog with durations and aliases**
Extend `bookingCatalog.services` to include `durationMinutes` and optional `aliases` / `description` loaded from a new service metadata source or from mapped knowledge entries. Update the system prompt to tell the model it can reference durations and aliases when the user asks about services.

- Pros: Model gets enough context to answer service questions from the catalog itself, reducing reliance on unmapped knowledge entries.
- Cons: Requires schema or metadata additions; prompt tokens grow.
- Effort: Medium

**Approach B — Keep current minimal catalog, add mapping metadata separately**
Leave `bookingCatalog` as id/name only, but pass a separate `serviceKnowledgeMap` (knowledge entry id → service id) so the model can cite knowledge and still emit the correct `serviceName`.

- Pros: Smaller prompt change; reuses existing catalog shape.
- Cons: Does not solve "what services do you offer?" with richer descriptions unless knowledge entries remain the source.
- Effort: Low

### 2. Knowledge-to-services fuzzy mapping

**Approach A — Linking table `whatsapp_knowledge_service_links`**
Create `knowledge_entry_id uuid, service_id uuid` with a unique constraint. Load the links alongside knowledge entries and resolve any knowledge mention to a service UUID deterministically in the backend before calling booking tools.

- Pros: Explicit, admin-controlled, deterministic; easy to audit.
- Cons: Adds UI/data-entry burden to maintain links.
- Effort: Medium

**Approach B — Add `service_id` nullable column to `whatsapp_knowledge_entries`**
When a knowledge entry represents a bookable service, set its `service_id`. The backend resolves knowledge citations to services directly.

- Pros: Simplest schema; one column per entry.
- Cons: Less flexible for entries that map to multiple services; requires migration.
- Effort: Low

**Approach C — Fuzzy tag matching on the fly**
Re-use `normalizeForMatch` to compare knowledge tags/topic against service names (and vice versa) at runtime, returning the best candidate with a confidence threshold.

- Pros: No extra schema; works immediately.
- Cons: Fragile; false matches possible; must be validated server-side.
- Effort: Low

Recommended: **Approach A (linking table) for production**, with **Approach C as a fallback** when no explicit link exists, logged for review.

### 3. Notes field in appointments

**Approach A — Add `notes` text column to `appointments`**
Update migration `0001_agenda_tables.sql`, add `notes` to `bookAppointment()` args, and populate it from the agent's `summary`, `serviceName`, or free-text context.

- Pros: Persistent, queryable, simple.
- Cons: Slight schema migration.
- Effort: Low

**Approach B — Store notes in `whatsapp_conversations.booking_context`**
Keep appointment table clean and attach notes to the conversation state.

- Pros: No appointment schema change.
- Cons: Notes are not tied to the appointment record; clinic staff may not see them.
- Effort: Low

Recommended: **Approach A** — appointments are the operational source of truth; notes belong there.

### 4. Conversation summary capture

**Approach A — Add `summary` text column to `whatsapp_conversations`**
Update `updateWhatsAppConversationStatus` to accept a `summary` and persist the agent's `summary` each turn (or append a condensed summary). Use it when creating escalations.

- Pros: Human handoffs get concise context.
- Cons: Prompt engineering needed to keep summary useful and bounded.
- Effort: Medium

**Approach B — Derive summary from latest `whatsapp_intents.summary`**
No schema change; escalation logic reads the most recent intent summary.

- Pros: Zero migration.
- Cons: Only one-turn context; loses thread summary.
- Effort: Low

Recommended: **Approach A** with a rolling summary, using Approach B as fallback for minimal change.

## Recommendation

Proceed with a **hybrid mapping strategy**:

1. **Enrich the catalog** injected into the LLM with `durationMinutes` and optional `aliases`/`description` loaded from services + mapped knowledge. Keep the existing name-based booking instructions.
2. **Create a `whatsapp_knowledge_service_links` table** to explicitly link knowledge entries to services. Use this as the primary resolution path in `runBookingTool()` and fall back to fuzzy name matching when no link exists.
3. **Add `notes` to `appointments`** and thread it through `bookAppointment()` from the agent summary / selected service context.
4. **Add `summary` to `whatsapp_conversations`** and update it each turn so escalations carry condensed context.

## Risks

- **Prompt bloat**: Richer catalog increases token usage; cap entries and monitor.
- **False fuzzy matches**: Fallback matching must be thresholded and logged; never let it silently book the wrong service.
- **Schema drift**: Any change to `appointments` or `whatsapp_knowledge_entries` must be reflected in migrations and RLS policies.
- **LLM over-reliance on names**: Even with mapping, the backend must continue to resolve names/IDs deterministically and validate against the DB, per existing guardrails.

## Ready for Proposal

Yes. The orchestrator should ask the user whether they prefer:

1. A single comprehensive change covering catalog enrichment, knowledge-service mapping, appointment notes, and conversation summary; or
2. Splitting into smaller changes (mapping + notes first, summary second).

Both paths are technically viable and reuse existing patterns (`resolveProviderByName`, `bookingCatalog`, `updateWhatsAppConversationStatus`).
