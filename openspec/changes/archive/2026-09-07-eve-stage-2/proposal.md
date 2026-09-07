# Proposal: Eve Stage 2 — Read-Only Tools

## Intent

Add the first production Eve tools so Eva can read clinic catalog, appointment availability, and approved WhatsApp knowledge without modifying database state or replacing the legacy WhatsApp flow.

## Scope

### In Scope
- Add `agent/tools/list-catalog.ts`, `check-availability.ts`, and `search-knowledge.ts` as Eve `defineTool` files.
- Reuse existing read-only booking and Supabase logic; no changes to `src/lib/booking/` behavior.
- Add unit tests covering happy paths, edge cases, and read-only behavior.
- Update `agent/instructions.md` so the agent knows when to use the tools.

### Out of Scope
- Write tools for patient resolution or appointment booking.
- WhatsApp Eve channel integration.
- New skills, subagents, schema changes, or TravelHub edits.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `eve-framework`: Adds read-only Eve tools exposed from `agent/tools/`.

## Approach

Use Eve 0.52 `defineTool` with Zod input schemas. Wrap existing `listServices`, `listProviders`, `resolveServiceByName`, `resolveProviderByName`, and `getFreeSlots`; query `whatsapp_knowledge_entries` with the server-side Supabase admin client for approved entries only. Return JSON-serializable plain objects and keep response writing in the model.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `agent/tools/` | New | Read-only Eve tools. |
| `agent/tools/__tests__/` | New | Unit tests with mocked dependencies. |
| `agent/instructions.md` | Modified | Tool usage guidance in Spanish. |
| `package.json` / lockfile | Modified | Direct Zod dependency for tool schemas. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tool API mismatch with current Eve | Low | Verified Eve 0.52 docs and local typings. |
| Accidental database writes | Low | Only select/RPC read functions are called; tests assert no write methods. |
| Date/time formatting ambiguity | Medium | Format with `America/Mexico_City` and return ISO date plus local time strings. |

## Rollback Plan

Revert the Stage 2 commit(s); the legacy WhatsApp pipeline remains untouched and Stage 1 scaffold still works.

## Dependencies

- Stage 1 complete on `feat/eve-migration` (`agent/agent.ts`, `agent/instructions.md`, `withEve`).

## Success Criteria

- [ ] Three read-only tools exist with Zod schemas and structured outputs.
- [ ] Tools reuse existing business logic or read approved knowledge only.
- [ ] Unit tests, typecheck, and build pass.
- [ ] PR targets `feat/eve-migration` and closes #32.
