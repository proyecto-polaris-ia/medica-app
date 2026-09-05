# Flow Engine Architecture

## Resumen

Implementación de una arquitectura de Flow Engine determinística para manejar flujos conversacionales multi-paso en el agente de WhatsApp. Esta arquitectura separa la lógica de flujo (determinística) del procesamiento de lenguaje natural (LLM).

## Problema

El agente anterior dependía completamente del LLM para:
1. Clasificar el intent
2. Decidir el siguiente paso del flujo
3. Generar la respuesta

Esto causaba inconsistencias:
- El agente perdía el hilo de la conversación
- No seguía un proceso definido para agendar citas
- Escalaba a humano innecesariamente cuando podía continuar el flujo

## Solución

### Arquitectura de tres capas

```
┌─────────────────────────────────────────────────────────────┐
│                    WhatsApp Orchestrator                     │
│  (Routing basado en intent: flows vs handlers directos)     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
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

#### 1. Flow Engine (`src/lib/flows/flow-engine.ts`)
Motor determinístico que ejecuta flujos conversacionales.

**Responsabilidades:**
- Mantener estado del flujo
- Validar entidades requeridas
- Ejecutar transiciones entre estados
- Determinar siguiente acción

**No hace:**
- Clasificación de intent (lo hace el LLM)
- Generación de respuesta natural (lo hace el Orchestrator)
- Ejecución de acciones de negocio (lo hace el Orchestrator)

#### 2. Flow Definitions (`src/lib/flows/definitions/`)
Configuración declarativa de flujos.

**Ejemplo: book-appointment.flow.ts**
```typescript
{
  name: 'book_appointment',
  initialState: 'collect_date',
  states: {
    collect_date: {
      required: ['localDate'],
      prompt: '¿Para qué día te gustaría agendar?',
      transitions: { has_date: 'collect_service' }
    },
    collect_service: {
      required: ['serviceId'],
      prompt: '¿Qué servicio necesitas?',
      transitions: { has_service: 'collect_provider' }
    },
    // ... más estados
  }
}
```

#### 3. Orchestrator (`src/lib/whatsapp/orchestrator.ts`)
Orquesta el procesamiento de mensajes.

**Responsabilidades:**
- Clasificar intent con LLM
- Routing: flow engine vs handlers directos
- Ejecutar acciones de negocio (getFreeSlots, bookAppointment)
- Generar respuesta natural con placeholders

#### 4. Types (`src/lib/flows/types.ts`)
Definiciones de tipos para el sistema de flows.

**Tipos principales:**
- `ExtractedEntities`: Entidades extraídas del mensaje
- `FlowState`: Estado actual del flujo
- `FlowDefinition`: Definición de un flujo
- `FlowResult`: Resultado de ejecutar un paso

## Flujos implementados

### book_appointment
Flujo para agendar citas.

**Estados:**
1. `collect_date` → Pregunta por la fecha
2. `collect_service` → Pregunta por el servicio
3. `collect_provider` → Pregunta por el doctor
4. `check_availability` → Consulta horarios disponibles
5. `select_slot` → Usuario selecciona horario
6. `confirm_booking` → Confirma y agenda
7. `collect_notes` → Pregunta por notas adicionales
8. `complete` → Flujo terminado

## Routing de intents

| Intent | Handler | Usa Flow Engine? |
|--------|---------|------------------|
| `inquiry` | Knowledge Handler (LLM) | ❌ No |
| `book_appointment` | Flow Engine | ✅ Sí |
| `check_availability` | Flow Engine | ✅ Sí |
| `support` | Escalation Handler | ❌ No |
| `unknown` | Fallback | ❌ No |

## Ventajas

1. **Determinístico**: El flujo no depende del LLM
2. **Escalable**: Agregar nuevos flujos es agregar configuración
3. **Testeable**: Flows son código puro, fácil de testear
4. **Mantenible**: Separación clara entre lógica y lenguaje
5. **Auditable**: Cada transición de estado queda registrada

## Testing

- ✅ 8 tests unitarios del Flow Engine
- ✅ 277 tests totales (todos pasando)
- ✅ TypeScript strict mode

## Archivos creados

```
src/lib/flows/
├── types.ts                          # Tipos base
├── flow-engine.ts                    # Motor determinístico
├── definitions/
│   └── book-appointment.flow.ts      # Flujo de agendamiento
└── __tests__/
    └── flow-engine.test.ts           # Tests unitarios

src/lib/whatsapp/
└── orchestrator.ts                   # Orchestrator principal
```

## Próximos pasos

1. **Integración completa**: Reemplazar `inbound-service.ts` con `orchestrator.ts`
2. **Persistencia de estado**: Guardar `FlowState` en `whatsapp_conversations`
3. **Más flujos**: Implementar `reschedule`, `cancel`, `support`
4. **Admin UI**: Interfaz para definir flujos sin código
5. **Analytics**: Métricas de conversión por flujo

## Migración

La integración con el código existente es incremental:
- El `orchestrator.ts` puede coexistir con `inbound-service.ts`
- Feature flag para activar/desactivar Flow Engine
- Rollback inmediato si hay problemas

## Referencias

- State Machine pattern: https://en.wikipedia.org/wiki/Finite-state_machine
- Flow-based programming: https://en.wikipedia.org/wiki/Flow-based_programming
- Conversational AI patterns: https://www.dialogue.design/conversational-design-patterns
