# Design: Eve Stage 2 — Read-Only Tools

## Context

Stage 1 added the Eve runtime scaffold. Stage 2 adds model-callable read tools only. The legacy WhatsApp inbound flow remains untouched until later stages.

## Decisions

1. **Eve API**: Use `defineTool` from `eve/tools`. Current Eve 0.52 docs and local typings confirm tool identity is filename-derived and `inputSchema` is required.
2. **Schema library**: Add `zod` as a direct dependency. The issue requires Zod schemas; relying on an undeclared transitive package would be fragile.
3. **Read-only boundary**: Tools call existing read functions or Supabase `.select()` only. No insert/update/delete/upsert/rpc writes are introduced.
4. **Availability input**: Validate `YYYY-MM-DD` before creating a `Date`. `getFreeSlots` already formats target dates in `America/Mexico_City`; the tool formats returned slot times in the same timezone.
5. **Knowledge relevance**: Use deterministic keyword scoring across topic, question, answer, and tags. This is intentionally simple for Stage 2; semantic search is out of scope.
6. **Error shape**: Tools return structured error objects instead of throwing for expected domain misses. Unexpected data-source errors are caught and returned as `success: false`.
7. **Testing**: Unit tests mock booking/Supabase dependencies and inspect tool `execute` results directly. Tests also protect the read-only contract by failing if knowledge search calls write-like methods.

## Data Flow

- `list-catalog` → `listServices()` + `listProviders()` → formatted JSON.
- `check-availability` → validate input → resolve service/provider → `getFreeSlots()` → first five local time ranges.
- `search-knowledge` → `getSupabaseAdmin().from('whatsapp_knowledge_entries').select(...).eq('status','approved')` → deterministic filtering → first three matches.

## Non-Goals

- Appointment booking or patient writes.
- New database indexes or schema changes.
- Eve WhatsApp channel activation.
- Changes to TravelHub.

## Verification

Run:
- `npm run test -- agent/tools/__tests__`
- `npm run typecheck`
- `npm run build`
