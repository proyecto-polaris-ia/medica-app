# Flow Engine — Guía de Referencia

> Documento de referencia del Flow Engine: motor determinístico de flujos
> conversacionales y runtime del **web chat**
> (`app/api/web-chat/message` → `src/lib/web-chat/web-inbound-service.ts`).
> Dejó de participar en el pipeline de WhatsApp en la Etapa 7 (issue #37);
> WhatsApp lo atiende el agente Eve.

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
Web chat: clasifica intent → book_appointment
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
│        Web chat inbound (web-inbound-service.ts)            │
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
| **Web chat inbound** | `src/lib/web-chat/web-inbound-service.ts` | Routing y ejecución de acciones |

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

### 1. Mensaje llega al endpoint de web chat

```typescript
// app/api/web-chat/message/route.ts
POST /api/web-chat/message
  → processWebChatMessage({ sessionId, message, phone?, fullName? })
```

### 2. Se clasifica el intent

```typescript
// src/lib/web-chat/web-inbound-service.ts
const classification = classifyIntentSimple(message);

switch (classification.intent) {
  case 'book_appointment':
  case 'check_availability':
    return await handleBookingFlow(request, session);
  case 'inquiry':
    return { reply: await handleKnowledgeQuery(message) };
  // ...
}
```

### 3. Flow Engine ejecuta el flujo

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

### 4. Estado se persiste

```typescript
// src/lib/web-chat/store.ts
await updateWebChatSession(request.sessionId, {
  flow_state: response.flowState,
  last_intent: response.flowState.flowName,
  last_activity: new Date().toISOString(),
});
```

### 5. Respuesta se entrega al widget

```typescript
// src/lib/web-chat/web-inbound-service.ts
await insertWebChatMessage(request.sessionId, 'assistant', response.reply);
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

### 3. Agregar routing en el web chat

```typescript
// src/lib/web-chat/web-inbound-service.ts
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

## Sin feature flag

El engine no tiene interruptor de activación en runtime: los consumidores (web
chat) lo invocan directamente. La variable `WHATSAPP_FLOW_ENGINE_ENABLED` se
eliminó en la Etapa 7 junto con el path legacy de WhatsApp, así que ya no hay
rollback por flag: el rollback es de código (`git revert` + redeploy, ver
`docs/eve-runbook.md`).

## Persistencia

### Estructura del estado

```typescript
// web_chat_sessions.flow_state (jsonb)
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
| `0010_conversation_flow_state.sql` | Agrega la columna `flow_state` a `whatsapp_conversations` (histórica) |
| `0012_web_chat.sql` | Crea `web_chat_sessions` con `flow_state` (jsonb) y `web_chat_messages` |

## Testing

### Tests unitarios

```bash
npm test src/lib/flows/__tests__/
```

### Tests de integración

```bash
npm test app/api/web-chat/
```

## Monitoreo

El engine no emite eventos de observabilidad propios: es código puro que
transforma estado. Para revisar conversaciones en curso hay que mirar el store
del consumidor:

- `web_chat_sessions.flow_state` — estado actual, entidades y candidatos.
- `web_chat_sessions.last_intent` — último intent clasificado.

Para el canal WhatsApp (atendido por Eve) el monitoreo vive en el WhatsApp
Command Center y en el runbook: `docs/eve-runbook.md`.

### Métricas clave

- **Conversión de flujo**: % de flujos que llegan a `complete`
- **Tiempo promedio**: Mensajes por flujo completado
- **Abandono**: Estados donde los usuarios dejan de responder
- **Errores**: Acciones que fallan

## Troubleshooting

### El flujo no avanza

1. Verificar que las entidades requeridas están presentes
2. Revisar `web_chat_sessions.flow_state` (estado, entidades y `pendingAction`)
3. Verificar que el estado actual tiene transiciones definidas

### El estado no se persiste

1. Verificar que `web_chat_sessions.flow_state` existe
2. Revisar que `updateWebChatSession` se está llamando
3. Verificar permisos de RLS en Supabase

## Referencias

- **Spec**: `openspec/specs/flow-engine/spec.md`
- **Architecture**: `architecture.md` sección 8
- **Change**: `openspec/changes/2026-09-05-flow-engine-architecture/`
- **Tests**: `src/lib/flows/__tests__/`

## FAQ

**¿Hay un feature flag para activar el Flow Engine?**
No. `WHATSAPP_FLOW_ENGINE_ENABLED` se eliminó en la Etapa 7; el engine se invoca
directamente desde sus consumidores (web chat).

**¿Qué pasa con las conversaciones en curso?**
El estado (`flow_state`) se guarda por sesión, así que la conversación continúa
desde el último estado. Si pasaron más de 30 minutos sin actividad, la sesión se
considera expirada y arranca de nuevo.

**¿Cómo agrego un nuevo flujo?**
Ver sección "Definir un nuevo flujo" arriba.

**¿El Flow Engine funciona para consultas de knowledge?**
No. Las consultas de knowledge (`inquiry`) van directamente al LLM. El Flow
Engine es solo para flujos multi-paso como booking.

**¿Puedo usar el Flow Engine para otros canales?**
Sí, el engine es agnóstico al canal: solo necesita adaptadores para entrada/salida.
Hoy solo lo usa el web chat; WhatsApp lo atiende el agente Eve.
