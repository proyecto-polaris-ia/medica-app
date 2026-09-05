# Proposal: WhatsApp Conversation History Context

## Summary

The WhatsApp inbound agent was losing conversation context between messages. Users had to repeat information like doctor preference, date, and service in every message because the LLM only received the current message without any history.

## Problem

When a user had a multi-turn conversation like:
1. "¿Cuál es su horario?" → Agent responds with hours
2. "¿Qué horarios tienen disponible para el 15 de septiembre?" → Agent asks for service and doctor
3. "¿Qué servicios y doctores hay?" → Agent lists options
4. "Quiero valoración con la Dra. Ana Martínez" → Agent asks for date (FORGETS user already said Sept 15)
5. "El 15 de septiembre" → Agent asks for service and doctor AGAIN (FORGETS user already said Dra. Ana Martínez)

The agent's responses were technically correct but frustrating because it didn't remember previous messages in the same conversation.

## Root Cause

In `whatsapp-llm-provider.ts`, the messages array sent to the LLM was:
```
[system, user(currentMessage)]
```

No conversation history was being loaded or passed to the agent.

## Solution

Load the last 20 messages from `whatsapp_messages` for the conversation and inject them as multi-turn chat history:
```
[system, ...history(user/assistant), user(currentMessageWithContext)]
```

### Changes Made

1. **`src/lib/ai/whatsapp-inbound-agent.ts`**
   - Added `WhatsAppRecentMessage` type
   - Extended `WhatsAppInboundAgentInput.conversation` to include `recentMessages`

2. **`src/lib/whatsapp/store.ts`**
   - Added `loadWhatsAppConversationHistory()` function
   - Loads last 20 text messages with non-null body, ordered by `occurred_at`
   - Maps `inbound → user`, `outbound → assistant`

3. **`src/lib/whatsapp/inbound-service.ts`**
   - Load conversation history alongside context
   - Pass history to the agent

4. **`src/lib/ai/whatsapp-llm-provider.ts`**
   - Build multi-turn message array with history between system prompt and current user message

## Scope

- Fix conversation context loss in WhatsApp agent
- No new features, no architectural changes
- Backward compatible (existing conversations work as before)

## Testing

- ✅ TypeScript compiles without errors
- ✅ All 269 tests pass (44 files)
- ✅ Manual testing shows agent now remembers context

## Status

✅ Fixed in PR #23 (merged to main).
