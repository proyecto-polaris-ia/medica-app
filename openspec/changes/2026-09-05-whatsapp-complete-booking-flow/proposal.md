# Proposal: WhatsApp Complete Booking Flow

## Summary

The WhatsApp agent was escalating booking requests instead of completing them because it couldn't map natural language names like "Dra. Ana Martínez" to UUIDs. This fix implements name-to-ID resolution and catalog injection to enable the full booking flow.

## Problem

When a user said:
- "Quiero valoración general con la Dra. Ana Martínez el 15 de septiembre"

The agent would:
1. Ask for service and doctor (even though user just said them)
2. Not resolve "Dra. Ana Martínez" to a provider UUID
3. Escalate to human instead of showing available slots

## Root Cause

1. The LLM didn't receive the catalog of services/providers with their UUIDs
2. The backend expected UUIDs but users provide names
3. When IDs were missing, the agent showed a generic message instead of listing options

## Solution

### 1. Name-to-ID Resolution (catalog.ts)
Added `resolveServiceByName()` and `resolveProviderByName()` functions that use fuzzy matching with accent normalization to map natural language names to UUIDs.

### 2. Catalog Injection (whatsapp-llm-provider.ts)
The LLM now receives the full catalog of services and providers in the user prompt, so it can use `serviceName` and `providerName` instead of UUIDs.

### 3. Backend Resolution (inbound-service.ts)
When the LLM returns a tool action with names instead of UUIDs, the backend resolves them to IDs. If resolution fails or IDs are still missing, the agent shows a formatted list of available services and doctors.

### 4. Type Extensions (whatsapp-inbound-agent.ts)
Added `serviceName` and `providerName` as optional arguments in `WhatsAppToolAction.args`.
Added `WhatsAppBookingCatalog` type and extended agent input to receive the catalog.

## Scope

- Fix booking flow to handle natural language names
- No new features, no architectural changes
- Backward compatible (UUIDs still work if provided)

## Testing

- ✅ TypeScript compiles without errors
- ✅ All 269 tests pass (44 files)

## Status

✅ Fixed in PR #24 (merged to main).
