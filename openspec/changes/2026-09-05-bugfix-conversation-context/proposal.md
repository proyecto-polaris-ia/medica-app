# Bug Fix: Agente perdía contexto de conversación

## Fecha
2026-09-05

## Commit
`17b0f91` - feat(whatsapp): add conversation history context to agent

## Problema
El agente de WhatsApp perdía el contexto de la conversación entre mensajes. Los usuarios tenían que repetir información como doctor preferido, fecha y servicio en cada mensaje.

Ejemplo de conversación problemática:
1. Usuario: "¿Cuál es su horario?" → Agente responde
2. Usuario: "¿Qué horarios tienen disponible para el 15 de septiembre?" → Agente pide servicio y doctor
3. Usuario: "¿Qué servicios y doctores hay?" → Agente lista opciones
4. Usuario: "Quiero valoración con la Dra. Ana Martínez" → Agente pide fecha (¡olvida que ya dijo 15 de septiembre!)
5. Usuario: "El 15 de septiembre" → Agente pide servicio y doctor otra vez (¡olvida que ya dijo Dra. Ana Martínez!)

## Causa raíz
En `whatsapp-llm-provider.ts`, el array de mensajes enviado al LLM era:
```typescript
[system, user(currentMessage)]
```

No se cargaba ni se pasaba el historial de conversación al agente.

## Solución implementada

### 1. Cargar historial de conversación
Archivo: `src/lib/whatsapp/store.ts`

Nueva función `loadWhatsAppConversationHistory()`:
```typescript
export async function loadWhatsAppConversationHistory(conversationId: string, limit = 20): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const result = await db()
    .from('whatsapp_messages')
    .select('direction, body')
    .eq('conversation_id', conversationId)
    .eq('message_type', 'text')
    .not('body', 'is', null)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  
  throwIfError(result.error, 'Could not load WhatsApp conversation history');
  if (!result.data || result.data.length === 0) return [];
  
  return result.data.reverse().map((row) => ({
    role: row.direction === 'inbound' ? 'user' as const : 'assistant' as const,
    content: row.body as string,
  }));
}
```

### 2. Extender tipos del agente
Archivo: `src/lib/ai/whatsapp-inbound-agent.ts`

```typescript
export type WhatsAppRecentMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type WhatsAppInboundAgentInput = {
  messageText: string;
  contact?: { id?: string; phone?: string; profileName?: string };
  conversation?: { 
    id?: string; 
    bookingContext?: Record<string, unknown> | null; 
    lastIntent?: string | null; 
    recentMessages?: WhatsAppRecentMessage[]; // NUEVO
  };
  dynamicToolResults?: WhatsAppDynamicToolResult[];
};
```

### 3. Inyectar historial en el LLM
Archivo: `src/lib/ai/whatsapp-llm-provider.ts`

```typescript
return async function whatsappLLMProvider(input: WhatsAppInboundAgentProviderInput) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);

  const recentMessages = input.conversation?.recentMessages ?? [];
  const historyMessages: ChatCompletionMessage[] = recentMessages.map((msg) => ({
    role: msg.role as "system" | "user",
    content: msg.content,
  }));

  const messages: ChatCompletionMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    ...historyMessages,
    { role: "user", content: buildUserPrompt(input) },
  ];
  // ...
}
```

### 4. Cargar historial en el servicio
Archivo: `src/lib/whatsapp/inbound-service.ts`

```typescript
export async function processWhatsAppInboundEvent(event: NormalizedWhatsAppInboundEvent, options: WhatsAppInboundServiceOptions = {}): Promise<WhatsAppInboundEventResult> {
  // ...
  const conversation = await store.loadConversationContext(persisted.conversationId);
  const recentMessages = await store.loadConversationHistory(persisted.conversationId);
  const decision = event.messageType === 'text' && event.body 
    ? await (options.agent ?? decideWhatsAppInboundMessage)({
        messageText: event.body,
        contact: { id: persisted.contactId, phone: event.fromPhone, profileName: event.profileName },
        conversation: { 
          id: persisted.conversationId, 
          bookingContext: conversation.bookingContext, 
          lastIntent: conversation.lastIntent, 
          recentMessages // NUEVO
        },
        // ...
      }, { /* ... */ })
    : unsupportedDecision(event);
  // ...
}
```

## Impacto
- El agente ahora mantiene el contexto conversacional
- Los usuarios pueden referirse a información mencionada anteriormente
- Se mejoró significativamente la experiencia de usuario
- Límite de 20 mensajes (10 turnos) para no exceder el contexto del LLM

## Testing
- ✅ TypeScript compila sin errores
- ✅ 269 tests pasan
- ✅ Validado en producción

## Archivos modificados
- `src/lib/ai/whatsapp-inbound-agent.ts`
- `src/lib/ai/whatsapp-llm-provider.ts`
- `src/lib/whatsapp/inbound-service.ts`
- `src/lib/whatsapp/store.ts`
