# Flow Engine — Guía de Referencia

> Documento de referencia para el componente Flow Engine del agente de WhatsApp.
> Última actualización: 2026-09-05

## ¿Qué es el Flow Engine?

El Flow Engine es un motor determinístico para flujos conversacionales multi-paso. Separa la lógica de flujo (determinística) del procesamiento de lenguaje natural (LLM), permitiendo conversaciones predecibles y testeables.

### Problema que resuelve

**Antes del Flow Engine:**
```
Usuario: "Quiero agendar una cita"
LLM: (decide TODO: intent, flujo, respuesta)
Agente: "¿Para qué día?"
Usuario: "El 15 de septiembre"
LLM: (olvida que ya tenía el intent, decide de nuevo)
Agente: "¿Qué servicio necesitas?" ← Debería haber preguntado esto antes
Usuario: "Blanqueamiento"
LLM: (no recuerda el doctor que mencionó antes)
Agente: "¿Con qué doctor?" ← Ya lo había dicho antes
...
```

**Con Flow Engine:**
```
Usuario: "Quiero agendar una cita"
Orchestrator: clasifica intent → book_appointment
Flow Engine: estado = collect_date → pide fecha
Usuario: "El 15 de septiembre"
Flow Engine: estado = collect_service → pide servicio
Usuario: "Blanqueamiento"
Flow Engine: estado = collect_provider → pide doctor
Usuario: "Dra. Ana"
Flow Engine: estado = check_availability → ejecuta acción
...
```

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    WhatsApp Orchestrator                     │
│  (Routing basado en intent: flows vs handlers directos)     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Flow Engine  │    │   Knowledge   │    │  Escalation   │
│ (determinist) │    │   Handler     │    │   Handler     │
│               │    │   (LLM)       │    │   (direct)    │
└───────────────┘    └───────────────┘    └───────────────┘
        │
        ▼
┌───────────────┐
│ Flow Actions  │
│ (getSlots,    │
│  book, etc)   │
└───────────────┘
```

### Componentes

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| **Flow Engine** | `src/lib/flows/flow-engine.ts` | Motor determinístico |
| **Flow Definitions** | `src/lib/flows/definitions/*.flow.ts` | Configuración de flujos |
| **Types** | `src/lib/flows/types.ts` | Tipos TypeScript |
| **Orchestrator** | `src/lib/whatsapp/orchestrator.ts` | Routing y ejecución |

## Flujos disponibles

### book_appointment

Flujo para agendar citas.

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ collect_date │────▶│collect_service│────▶│ collect_provider │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                  │
                                                  ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   complete   │◀────│ collect_notes │◀────│ confirm_booking  │
└─────────────┘     └──────────────┘     └─────────────────┘
                          ▲                     │
                          │                     ▼
                    ┌─────┴──────┐      ┌───────────────┐
                    │ select_slot │◀─────│check_availability│
                    └────────────┘      └───────────────┘
```

**Estados:**

| Estado | Entidades requeridas | Acción | Prompt |
|--------|---------------------|--------|--------|
| `collect_date` | `localDate` | - | ¿Para qué día? |
| `collect_service` | `serviceId` | - | ¿Qué servicio? |
| `collect_provider` | `providerId` | - | ¿Con qué doctor? |
| `check_availability` | - | `getFreeSlots` | Estos son los horarios... |
| `select_slot` | `startAt`, `endAt` | - | ¿Cuál prefieres? |
| `confirm_booking` | - | `bookAppointment` | Confirmado... |
| `collect_notes` | - | - | ¿Alguna nota? |
| `complete` | - | - | ¡Listo! |

## Cómo funciona

### 1. Mensaje llega al webhook

```typescript
// app/api/whatsapp/webhook/route.ts
POST /api/whatsapp/webhook
  → processWhatsAppWebhookPayload()
  → processWhatsAppInboundEvent()
```

### 2. Feature flag decide el path

```typescript
// src/lib/whatsapp/inbound-service.ts
if (isFlowEngineEnabled()) {
  return await processWithFlowEngine(...);
}
return await processWithLegacy(...);
```

### 3. Orchestrator clasifica intent

```typescript
// src/lib/whatsapp/orchestrator.ts
const { intent, entities } = await classifyIntent(message);

switch (intent) {
  case 'book_appointment':
    return await handleBookingFlow(classification, context);
  case 'inquiry':
    return await handleKnowledgeQuery(classification, context);
  // ...
}
```

### 4. Flow Engine ejecuta el flujo

```typescript
// src/lib/flows/flow-engine.ts
const flow = getFlowDefinition('book_appointment');
const result = flowEngine.execute(flow, currentState, entities);

// result = {
//   nextState: { name: 'collect_service', entities: { localDate: '2026-09-15' } },
//   action: 'ask',
//   prompt: '¿Qué servicio necesitas?',
//   missingEntity: 'serviceId'
// }
```

### 5. Estado se persiste

```typescript
// src/lib/whatsapp/store.ts
await store.updateConversationFlowState({
  conversationId,
  flowState: result.nextState
});
```

### 6. Respuesta se envía

```typescript
// src/lib/whatsapp/orchestrator.ts
const responseText = await generateFlowResponse(result, context);
await sendWhatsAppTextMessage({ to: phone, body: responseText });
```

## Definir un nuevo flujo

### 1. Crear archivo de definición

```typescript
// src/lib/flows/definitions/reschedule.flow.ts
import type { FlowDefinition } from '../types';

export const rescheduleFlow: FlowDefinition = {
  name: 'reschedule_appointment',
  initialState: 'find_appointment',
  states: {
    find_appointment: {
      required: ['appointmentId'],
      prompt: '¿Cuál cita quieres reprogramar? Tengo estas opciones:\n{appointments}',
      transitions: { found: 'select_new_date' },
    },
    select_new_date: {
      required: ['localDate'],
      prompt: '¿Para qué día quieres reprogramar?',
      transitions: { has_date: 'check_availability' },
    },
    check_availability: {
      action: 'getFreeSlots',
      prompt: 'Estos son los horarios disponibles:\n{slots}',
      transitions: {
        has_slots: 'select_slot',
        no_slots: 'suggest_alternative',
      },
    },
    select_slot: {
      required: ['startAt', 'endAt'],
      prompt: '¿Cuál horario prefieres?',
      transitions: { confirmed: 'confirm_reschedule' },
    },
    confirm_reschedule: {
      action: 'rescheduleAppointment',
      prompt: 'Tu cita fue reprogramada para {datetime}.',
      transitions: { success: 'complete' },
    },
    suggest_alternative: {
      prompt: 'No hay horarios ese día. ¿Otro día?',
      transitions: { try_another: 'select_new_date' },
    },
    complete: {
      terminal: true,
      prompt: '¡Listo! Tu cita fue reprogramada.',
    },
  },
};
```

### 2. Registrar en el registry

```typescript
// src/lib/flows/definitions/index.ts
export const flowRegistry: Record<string, FlowDefinition> = {
  book_appointment: bookAppointmentFlow,
  reschedule_appointment: rescheduleFlow,  // ← nuevo
};
```

### 3. Agregar routing en orchestrator

```typescript
// src/lib/whatsapp/orchestrator.ts
case 'reschedule_request':
  return await handleRescheduleFlow(classification, context);
```

### 4. Agregar tests

```typescript
// src/lib/flows/__tests__/reschedule.flow.test.ts
describe('reschedule_appointment flow', () => {
  it('should ask for appointment selection', () => {
    const initialState = engine.createInitialState(rescheduleFlow);
    const result = engine.execute(rescheduleFlow, initialState, {});
    expect(result.missingEntity).toBe('appointmentId');
  });
});
```

## Feature flag

```bash
# .env.local o Vercel
WHATSAPP_FLOW_ENGINE_ENABLED=true
```

| Valor | Comportamiento |
|-------|----------------|
| `true` | Usa Flow Engine |
| `false` | Usa path legacy |
| no definido | Usa path legacy |

### Rollback inmediato

```bash
# Cambiar flag en Vercel
vercel env add WHATSAPP_FLOW_ENGINE_ENABLED production
# Ingresar: false

# Redeploy
vercel --prod
```

El path legacy se activa instantáneamente.

## Persistencia

### Estructura del estado

```typescript
// whatsapp_conversations.flow_state (jsonb)
{
  "name": "check_availability",
  "entities": {
    "localDate": "2026-09-15",
    "serviceId": "abc-123",
    "serviceName": "Blanqueamiento",
    "providerId": "def-456",
    "providerName": "Dra. Ana Martínez"
  },
  "candidates": [
    { "startAt": "2026-09-15T10:00:00Z", "endAt": "2026-09-15T10:45:00Z" },
    { "startAt": "2026-09-15T10:45:00Z", "endAt": "2026-09-15T11:30:00Z" }
  ],
  "metadata": {
    "attempts": 0,
    "lastUpdated": "2026-09-05T15:00:00Z"
  }
}
```

### Migraciones

| Migración | Descripción |
|-----------|-------------|
| `0010_conversation_flow_state.sql` | Agrega columna `flow_state` a `whatsapp_conversations` |

## Testing

### Tests unitarios

```bash
npm test src/lib/flows/__tests__/
```

### Tests de integración

```bash
npm test src/lib/whatsapp/__tests__/
```

### Simular conversación

```bash
# Script de simulación
node scripts/whatsapp-simulate-conversation.mjs
```

## Monitoreo

### Logs

```typescript
// Observabilidad integrada
recordWhatsAppAiEvent({
  type: 'flow_engine.state_transition',
  outcome: 'success',
  diagnostics: {
    flowName: 'book_appointment',
    fromState: 'collect_date',
    toState: 'collect_service',
    entities: { localDate: '2026-09-15' }
  }
});
```

### Métricas clave

- **Conversión de flujo**: % de flujos que llegan a `complete`
- **Tiempo promedio**: Mensajes por flujo completado
- **Abandono**: Estados donde los usuarios dejan de responder
- **Errores**: Acciones que fallan

## Troubleshooting

### El flujo no avanza

1. Verificar que las entidades requeridas están presentes
2. Revisar logs de `flow_engine.state_transition`
3. Verificar que el estado actual tiene transiciones definidas

### El estado no se persiste

1. Verificar que `whatsapp_conversations.flow_state` existe
2. Revisar que `updateConversationFlowState` se está llamando
3. Verificar permisos de RLS en Supabase

### Rollback de emergencia

```bash
# Desactivar Flow Engine
vercel env add WHATSAPP_FLOW_ENGINE_ENABLED production
# Ingresar: false

# Redeploy inmediato
vercel --prod --yes
```

## Referencias

- **Spec**: `openspec/specs/flow-engine/spec.md`
- **Architecture**: `architecture.md` sección 8
- **Change**: `openspec/changes/2026-09-05-flow-engine-architecture/`
- **Tests**: `src/lib/flows/__tests__/`

## FAQ

**¿Puedo tener ambos paths activos?**
Sí, el feature flag permite activar/desactivar por entorno o incluso por usuario.

**¿Qué pasa con las conversaciones en curso?**
Si se desactiva el Flow Engine, las conversaciones con `flow_state` activo quedan en ese estado. El path legacy no las continuará, pero el usuario puede iniciar una nueva conversación.

**¿Cómo agrego un nuevo flujo?**
Ver sección "Definir un nuevo flujo" arriba.

**¿El Flow Engine funciona para consultas de knowledge?**
No. Las consultas de knowledge (`inquiry`) van directamente al LLM. El Flow Engine es solo para flujos multi-paso como booking.

**¿Puedo usar el Flow Engine para otros canales?**
Sí, el Flow Engine es agnóstico al canal. Solo necesita adaptadores para entrada/salida.
