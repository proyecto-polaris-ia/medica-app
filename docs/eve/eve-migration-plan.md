# Plan de Migración a Vercel Eve - Agente de WhatsApp

## Resumen Ejecutivo

Este documento detalla el plan completo para migrar el agente de WhatsApp de medica-app a Vercel Eve, manteniendo toda la funcionalidad actual (knowledge base, flujo de agendamiento, guardrails clínicos) y aprovechando las capacidades nativas de Eve (durabilidad, HITL, observabilidad).

---

## Estructura de Branches

La migración se realiza en 7 etapas, cada una con su propio branch. Todos los branches se integran en un branch padre antes de mergear a main.

```
main (intacto durante toda la migración)
  └── feat/eve-migration (branch padre de integración)
        ├── feat/eve-stage-1-setup          → Issue #31
        ├── feat/eve-stage-2-tools-read     → Issue #32
        ├── feat/eve-stage-3-tools-write    → Issue #33
        ├── feat/eve-stage-4-skills         → Issue #34
        ├── feat/eve-stage-5-channel        → Issue #35
        ├── feat/eve-stage-6-deploy         → Issue #36
        └── feat/eve-stage-7-cleanup        → Issue #37
```

### Flujo de Trabajo

1. **Trabajar en el branch de la etapa:**
   ```bash
   git checkout feat/eve-stage-X-<name>
   # Hacer cambios
   git add .
   git commit -m "feat: descripción"
   git push origin feat/eve-stage-X-<name>
   ```

2. **Crear PR hacia `feat/eve-migration` (NO hacia main):**
   ```bash
   gh pr create --base feat/eve-migration --title "Stage X: Descripción" --body "..."
   ```

3. **Review y merge a `feat/eve-migration`**

4. **Al finalizar todas las etapas**, crear PR final de `feat/eve-migration` hacia `main`

### Issues en GitHub

Cada etapa tiene su issue asociado con instrucciones detalladas:
- [#31 - Stage 1: Setup Eve Framework + Vercel KV](https://github.com/proyecto-polaris-ia/medica-app/issues/31)
- [#32 - Stage 2: Add Eve Tools for Catalog, Availability, and Knowledge](https://github.com/proyecto-polaris-ia/medica-app/issues/32)
- [#33 - Stage 3: Add Eve Tools for Booking and Patient Resolution](https://github.com/proyecto-polaris-ia/medica-app/issues/33)
- [#34 - Stage 4: Add Eve Skills for Booking Flow and Clinical Escalation](https://github.com/proyecto-polaris-ia/medica-app/issues/34)
- [#35 - Stage 5: Add Eve WhatsApp Channel with Chat SDK](https://github.com/proyecto-polaris-ia/medica-app/issues/35)
- [#36 - Stage 6: Deploy Eve Agent to Production with Feature Flag](https://github.com/proyecto-polaris-ia/medica-app/issues/36)
- [#37 - Stage 7: Remove Legacy WhatsApp Agent Code](https://github.com/proyecto-polaris-ia/medica-app/issues/37)

---

## 1. Arquitectura Actual vs. Nueva

### 1.1 Arquitectura Actual

```
Meta WhatsApp → Webhook (Next.js API) → inbound-service.ts → orchestrator.ts
                                              ↓
                                    flow-engine.ts
                                              ↓
                                    booking/*.ts (catalog, availability, booking)
                                              ↓
                                    Supabase (BD + RPC functions)
```

**Componentes actuales:**
- `app/api/whatsapp/webhook/route.ts` - Webhook handler
- `src/lib/whatsapp/normalize.ts` - Normalización de payloads Meta
- `src/lib/whatsapp/signature.ts` - Verificación HMAC
- `src/lib/whatsapp/client.ts` - Envío de mensajes
- `src/lib/whatsapp/store.ts` - Persistencia en Supabase
- `src/lib/whatsapp/inbound-service.ts` - Orquestación principal
- `src/lib/whatsapp/orchestrator.ts` - Routing por intent
- `src/lib/flows/flow-engine.ts` - Motor de flujos determinístico
- `src/lib/flows/flow-control.ts` - Control de flujo (timeout, cancelación)
- `src/lib/flows/definitions/book-appointment.flow.ts` - Definición del flujo
- `src/lib/ai/whatsapp-intent-classifier.ts` - Clasificador de intents
- `src/lib/ai/whatsapp-inbound-agent.ts` - Agente LLM (legacy)
- `src/lib/booking/*.ts` - Lógica de negocio de agendamiento

### 1.2 Arquitectura Nueva (Eve)

```
Meta WhatsApp → Eve Channel (Chat SDK) → Eve Agent
                                              ↓
                                    instructions.md (system prompt)
                                              ↓
                                    tools/*.ts (check_availability, book_appointment, etc.)
                                              ↓
                                    skills/*.md (booking-flow, clinical-escalation)
                                              ↓
                                    Supabase (BD + RPC functions) - SIN CAMBIOS
```

**Componentes Eve:**
- `agent/agent.ts` - Configuración del agente
- `agent/instructions.md` - System prompt con guardrails
- `agent/tools/*.ts` - Tools typed (un archivo = un tool)
- `agent/skills/*.md` - Skills markdown (procedimientos)
- `agent/channels/whatsapp.ts` - Canal WhatsApp (Chat SDK adapter)
- `agent/subagents/` - Subagentes especializados (opcional)

---

## 2. Qué se Migra vs. Qué se Quita

### 2.1 Se Migra (se mantiene la lógica)

| Componente Actual | Destino en Eve | Notas |
|------------------|----------------|-------|
| Guardrails clínicos | `agent/instructions.md` | System prompt con reglas clínicas |
| Flujo de agendamiento | `agent/skills/booking-flow.md` | Skill markdown con pasos |
| Knowledge base queries | `agent/tools/search-knowledge.ts` | Tool que consulta Supabase |
| Disponibilidad | `agent/tools/check-availability.ts` | Tool que llama `getFreeSlots` |
| Agendar cita | `agent/tools/book-appointment.ts` | Tool que llama `bookAppointment` |
| Catálogo servicios/doctores | `agent/tools/list-catalog.ts` | Tool que lista servicios y doctores |
| Resolución paciente | `agent/tools/resolve-patient.ts` | Tool que resuelve/crea paciente |
| Escalación clínica | `agent/instructions.md` + `agent/skills/clinical-escalation.md` | Reglas en prompt + skill |
| Supabase migrations | **SIN CAMBIOS** | Toda la BD se mantiene igual |
| WhatsApp Command Center | **SIN CAMBIOS** | UI Next.js se mantiene |

### 2.2 Se Quita (reemplazado por Eve)

| Componente Actual | Reemplazado por Eve | Razón |
|------------------|---------------------|-------|
| `flow-engine.ts` | Eve durable sessions | Eve maneja estado de sesión nativamente |
| `flow-control.ts` | Eve HITL + sessions | Eve maneja timeout, cancelación, confirmaciones |
| `whatsapp-intent-classifier.ts` | Eve model routing | Eve clasifica intents automáticamente |
| `orchestrator.ts` | Eve agent loop | Eve orquesta el flujo automáticamente |
| `whatsapp-inbound-agent.ts` | Eve agent + instructions | Eve maneja el LLM directamente |
| `whatsapp-llm-provider.ts` | Eve AI Gateway | Eve maneja llamadas al LLM |
| `normalize.ts` | Chat SDK WhatsApp adapter | Eve/Chat SDK normaliza payloads |
| `signature.ts` | Chat SDK WhatsApp adapter | Eve/Chat SDK verifica firmas |
| `client.ts` | Chat SDK WhatsApp adapter | Eve/Chat SDK envía mensajes |
| `store.ts` (whatsapp_*) | Eve sessions + state | Eve maneja estado de conversación |
| `inbound-service.ts` | Eve channel + agent | Eve orquesta todo |
| Feature flag `WHATSAPP_FLOW_ENGINE_ENABLED` | N/A | Eve siempre usa flujos durables |
| `debug-logger.ts` | Eve observability | Eve tiene Agent Runs nativo |

### 2.3 Se Mantiene Sin Cambios

| Componente | Razón |
|-----------|-------|
| `src/lib/booking/*.ts` | Lógica de negocio pura, independiente del agente |
| `src/lib/supabase/*.ts` | Cliente Supabase, usado por tools |
| `supabase/migrations/*.sql` | Esquema de BD, sin cambios |
| `app/(admin)/**` | UI administrativa |
| `app/api/admin/**` | APIs administrativas |
| `app/api/booking/**` | APIs de booking (web) |
| WhatsApp Command Center | UI de administración de WhatsApp |

---

## 3. Estructura de Archivos del Agente Eve

```
medica-app/
├── agent/                              # NUEVO - Agente Eve
│   ├── agent.ts                        # Configuración del agente
│   ├── instructions.md                 # System prompt con guardrails
│   │
│   ├── tools/                          # Tools typed (un archivo = un tool)
│   │   ├── check-availability.ts       # Consultar disponibilidad
│   │   ├── book-appointment.ts         # Agendar cita
│   │   ├── list-catalog.ts             # Listar servicios y doctores
│   │   ├── resolve-patient.ts          # Resolver/crear paciente
│   │   ├── search-knowledge.ts         # Buscar en knowledge base
│   │   └── get-next-available.ts       # Próxima disponibilidad
│   │
│   ├── skills/                         # Skills markdown (procedimientos)
│   │   ├── booking-flow.md             # Flujo de agendamiento paso a paso
│   │   ├── clinical-escalation.md      # Reglas de escalación clínica
│   │   └── knowledge-answers.md        # Cómo usar knowledge base
│   │
│   ├── channels/                       # Canales de mensajería
│   │   └── whatsapp.ts                 # Canal WhatsApp (Chat SDK)
│   │
│   └── subagents/                      # Subagentes especializados (opcional)
│       └── clinical-review/            # Subagente para revisiones clínicas
│           ├── agent.ts
│           └── instructions.md
│
├── src/lib/                            # EXISTENTE - Se mantiene
│   ├── booking/                        # Lógica de negocio (SIN CAMBIOS)
│   │   ├── availability.ts
│   │   ├── booking.ts
│   │   ├── catalog.ts
│   │   ├── patient-resolution.ts
│   │   └── next-available.ts
│   │
│   ├── supabase/                       # Cliente Supabase (SIN CAMBIOS)
│   │   └── server.ts
│   │
│   └── whatsapp/                       # SE ELIMINA (reemplazado por Eve)
│       ├── normalize.ts                # ❌ Eliminar
│       ├── signature.ts                # ❌ Eliminar
│       ├── client.ts                   # ❌ Eliminar
│       ├── store.ts                    # ❌ Eliminar
│       ├── inbound-service.ts          # ❌ Eliminar
│       ├── orchestrator.ts             # ❌ Eliminar
│       └── escalation.ts               # ❌ Eliminar
│
├── src/lib/flows/                      # SE ELIMINA (reemplazado por Eve)
│   ├── flow-engine.ts                  # ❌ Eliminar
│   ├── flow-control.ts                 # ❌ Eliminar
│   ├── types.ts                        # ❌ Eliminar
│   └── definitions/                    # ❌ Eliminar
│
├── src/lib/ai/                         # SE ELIMINA (reemplazado por Eve)
│   ├── whatsapp-intent-classifier.ts   # ❌ Eliminar
│   ├── whatsapp-inbound-agent.ts       # ❌ Eliminar
│   └── whatsapp-llm-provider.ts        # ❌ Eliminar
│
├── app/api/whatsapp/                   # SE ELIMINA (reemplazado por Eve channel)
│   └── webhook/route.ts                # ❌ Eliminar
│
└── supabase/migrations/                # SIN CAMBIOS
    └── *.sql
```

---

## 4. Implementación Detallada

### 4.1 Fase 1: Setup de Eve

**Pasos:**
1. Instalar Eve en el proyecto
2. Crear estructura de directorios `agent/`
3. Configurar `agent/agent.ts` con modelo y opciones
4. Configurar variables de entorno

**Archivos a crear:**
- `agent/agent.ts`
- `.env.local` (agregar variables de Eve)

**Comandos:**
```bash
npm install eve@latest
mkdir -p agent/tools agent/skills agent/channels agent/subagents
```

### 4.2 Fase 2: Instructions (System Prompt)

**Archivo:** `agent/instructions.md`

**Contenido:**
```markdown
# Agente de WhatsApp - Consultorio Dental

Eres el agente de WhatsApp de un consultorio dental. Tu tarea es ayudar a los pacientes
a agendar citas y resolver dudas sobre servicios, horarios y ubicación.

## Guardrails Clínicos (OBLIGATORIOS)

NUNCA hagas lo siguiente:
- No diagnostiques condiciones médicas
- No recetes medicamentos
- No des instrucciones clínicas
- No inventes horarios ni disponibilidad
- No des precios definitivos por WhatsApp

SIEMPRE escala a humano cuando:
- El paciente mencione dolor fuerte, urgencia, infección
- El paciente mencione alergias o reacciones adversas
- El paciente solicite medicamentos o recetas
- El paciente solicite diagnósticos
- El mensaje sea ambiguo o no puedas ayudar con confianza

## Idioma
- Responde únicamente en español de México profesional
- Sé cálido pero profesional
- Usa "tú" no "usted"

## Flujo de Agendamiento
Cuando un paciente quiera agendar una cita, sigue el flujo definido en el skill
"booking-flow.md". NO inventes disponibilidad, SIEMPRE usa las tools para consultar
la base de datos.

## Knowledge Base
Para preguntas sobre servicios, horarios, ubicación, usa la tool "search-knowledge"
para buscar en la base de conocimiento aprobada.
```

### 4.3 Fase 3: Tools

Cada tool es un archivo TypeScript que define una acción que el modelo puede ejecutar.

#### 4.3.1 `agent/tools/check-availability.ts`

```typescript
import { defineTool } from "eve/tools";
import { z } from "zod";
import { getFreeSlots } from "@/lib/booking/availability";
import { resolveServiceByName, resolveProviderByName } from "@/lib/booking/catalog";

export default defineTool({
  description: "Consulta disponibilidad de horarios para agendar una cita",
  inputSchema: z.object({
    serviceName: z.string().describe("Nombre del servicio (ej: 'Limpieza dental')"),
    providerName: z.string().describe("Nombre del doctor (ej: 'Dra. Ana Martínez')"),
    date: z.string().describe("Fecha en formato YYYY-MM-DD"),
  }),
  async execute({ serviceName, providerName, date }) {
    // Resolver servicio
    const service = await resolveServiceByName(serviceName);
    if (!service) {
      return { success: false, error: `Servicio no encontrado: ${serviceName}` };
    }

    // Resolver doctor
    const provider = await resolveProviderByName(providerName);
    if (!provider) {
      return { success: false, error: `Doctor no encontrado: ${providerName}` };
    }

    // Consultar disponibilidad
    const slots = await getFreeSlots({
      providerId: provider.id,
      serviceId: service.id,
      localDate: new Date(date),
    });

    if (slots.length === 0) {
      return {
        success: true,
        available: false,
        message: `No hay horarios disponibles para ${serviceName} con ${providerName} el ${date}.`,
      };
    }

    // Formatear horarios
    const formatter = new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit',
      minute: '2-digit',
    });

    const formattedSlots = slots.slice(0, 5).map(slot => ({
      start: formatter.format(slot.start_at),
      end: formatter.format(slot.end_at),
    }));

    return {
      success: true,
      available: true,
      slots: formattedSlots,
      service: service.name,
      provider: provider.name,
      date,
    };
  },
});
```

#### 4.3.2 `agent/tools/book-appointment.ts`

```typescript
import { defineTool } from "eve/tools";
import { z } from "zod";
import { bookAppointment } from "@/lib/booking/booking";
import { resolveServiceByName, resolveProviderByName } from "@/lib/booking/catalog";
import { resolvePatient } from "@/lib/booking/patient-resolution";

export default defineTool({
  description: "Agenda una cita con un paciente, servicio, doctor y horario específico",
  inputSchema: z.object({
    patientPhone: z.string().describe("Teléfono del paciente en formato E.164"),
    patientName: z.string().optional().describe("Nombre del paciente"),
    serviceName: z.string().describe("Nombre del servicio"),
    providerName: z.string().describe("Nombre del doctor"),
    startAt: z.string().describe("Fecha y hora de inicio en formato ISO"),
    endAt: z.string().describe("Fecha y hora de fin en formato ISO"),
    notes: z.string().optional().describe("Notas adicionales para el doctor"),
  }),
  async execute({ patientPhone, patientName, serviceName, providerName, startAt, endAt, notes }) {
    // Resolver servicio
    const service = await resolveServiceByName(serviceName);
    if (!service) {
      return { success: false, error: `Servicio no encontrado: ${serviceName}` };
    }

    // Resolver doctor
    const provider = await resolveProviderByName(providerName);
    if (!provider) {
      return { success: false, error: `Doctor no encontrado: ${providerName}` };
    }

    // Resolver/crear paciente
    const patient = await resolvePatient({
      phone: patientPhone,
      fullName: patientName,
    });

    // Agendar cita
    const result = await bookAppointment({
      patientId: patient.id,
      serviceId: service.id,
      providerId: provider.id,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      notes,
    });

    if ('type' in result) {
      return {
        success: false,
        error: result.message,
        conflict: true,
      };
    }

    // Formatear fecha para respuesta
    const formatter = new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });

    return {
      success: true,
      appointment: {
        patientName: patient.full_name,
        service: service.name,
        provider: provider.name,
        datetime: formatter.format(new Date(startAt)),
      },
    };
  },
});
```

#### 4.3.3 `agent/tools/list-catalog.ts`

```typescript
import { defineTool } from "eve/tools";
import { listServices, listProviders } from "@/lib/booking/catalog";

export default defineTool({
  description: "Lista todos los servicios y doctores disponibles en el consultorio",
  inputSchema: z.object({}).optional(),
  async execute() {
    const [services, providers] = await Promise.all([
      listServices(),
      listProviders(),
    ]);

    return {
      services: services.map(s => ({
        id: s.id,
        name: s.name,
        duration: `${s.durationMinutes} minutos`,
      })),
      providers: providers.map(p => ({
        id: p.id,
        name: p.name,
      })),
    };
  },
});
```

#### 4.3.4 `agent/tools/search-knowledge.ts`

```typescript
import { defineTool } from "eve/tools";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export default defineTool({
  description: "Busca en la base de conocimiento aprobada para responder preguntas frecuentes",
  inputSchema: z.object({
    query: z.string().describe("Pregunta o tema a buscar"),
  }),
  async execute({ query }) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Buscar en knowledge entries aprobadas
    const { data, error } = await supabase
      .from('whatsapp_knowledge_entries')
      .select('id, topic, question, answer, tags')
      .eq('status', 'approved')
      .limit(10);

    if (error || !data) {
      return { success: false, error: "Error al buscar en knowledge base" };
    }

    // Filtrar por relevancia (búsqueda simple por palabras clave)
    const queryLower = query.toLowerCase();
    const relevant = data.filter(entry => {
      const searchText = `${entry.topic} ${entry.question} ${entry.tags.join(' ')}`.toLowerCase();
      return queryLower.split(' ').some(word => searchText.includes(word));
    });

    if (relevant.length === 0) {
      return {
        success: true,
        found: false,
        message: "No encontré información específica sobre eso. ¿Te gustaría que te ayude con algo más?",
      };
    }

    return {
      success: true,
      found: true,
      entries: relevant.slice(0, 3).map(e => ({
        topic: e.topic,
        question: e.question,
        answer: e.answer,
      })),
    };
  },
});
```

### 4.4 Fase 4: Skills

Los skills son procedimientos markdown que el modelo carga bajo demanda.

#### 4.4.1 `agent/skills/booking-flow.md`

```markdown
# Flujo de Agendamiento de Citas

Cuando un paciente quiera agendar una cita, sigue estos pasos en orden:

## Paso 1: Confirmar intención
Si el paciente dice algo como "quiero agendar una cita" o "necesito una cita", confirma que quieres ayudarle.

## Paso 2: Recopilar información necesaria
Necesitas obtener estos datos del paciente:
- Servicio que necesita (ej: limpieza, valoración, blanqueamiento)
- Doctor preferido (opcional, puede ser cualquiera disponible)
- Fecha preferida
- Horario preferido (opcional)

## Paso 3: Consultar disponibilidad
Usa la tool `check-availability` con los datos recopilados:
- serviceName: nombre del servicio
- providerName: nombre del doctor (o "Cualquiera" si no tiene preferencia)
- date: fecha en formato YYYY-MM-DD

## Paso 4: Presentar opciones
Si hay disponibilidad, presenta los horarios disponibles al paciente de forma clara:
"Tengo estos horarios disponibles para [servicio] con [doctor] el [fecha]:
1) 10:00 AM
2) 11:30 AM
3) 2:00 PM
¿Cuál prefieres?"

## Paso 5: Confirmar y agendar
Una vez que el paciente elija un horario:
1. Confirma los detalles: "Perfecto, voy a agendar tu cita para [fecha y hora] con [doctor] para [servicio]. ¿Confirmas?"
2. Si confirma, usa la tool `book-appointment` con todos los datos
3. Si la cita se agenda exitosamente, confirma: "¡Listo! Tu cita quedó agendada para [fecha y hora]. Te enviaré un recordatorio."

## Paso 6: Manejar conflictos
Si no hay disponibilidad:
- Ofrece consultar otra fecha: "No hay horarios disponibles ese día. ¿Te gustaría consultar otro día?"
- Si el paciente acepta, repite desde el Paso 3 con la nueva fecha

Si hay un conflicto al agendar (el horario ya no está disponible):
- Informa al paciente: "Lo siento, ese horario acaba de ser ocupado. Déjame consultar la siguiente disponibilidad."
- Consulta nuevamente la disponibilidad y ofrece alternativas

## Notas importantes
- NUNCA inventes horarios, SIEMPRE consulta la base de datos
- Si el paciente no tiene preferencia de doctor, consulta disponibilidad con "Cualquiera"
- Si el paciente menciona síntomas clínicos (dolor fuerte, urgencia), escala a humano inmediatamente
- Si el paciente pregunta por precios, indica que los precios se confirman en la consulta
```

#### 4.4.2 `agent/skills/clinical-escalation.md`

```markdown
# Escalación Clínica

## Cuándo escalar a humano INMEDIATAMENTE

Escalación obligatoria cuando el paciente mencione:

### Síntomas de urgencia
- Dolor fuerte o insoportable
- Hinchazón significativa
- Sangrado que no se detiene
- Infección visible (pus, fiebre)
- Trauma dental (diente roto, caído)

### Condiciones médicas
- Alergia a medicamentos
- Reacción adversa a tratamiento previo
- Condiciones sistémicas (diabetes, problemas cardíacos) que puedan afectar el tratamiento

### Solicitudes inapropiadas
- Pedido de medicamentos específicos (antibióticos, analgésicos fuertes)
- Solicitudes de diagnóstico por WhatsApp
- Solicitudes de recetas

## Cómo escalar

Cuando detectes una situación de escalación:

1. **Responde con empatía**: "Entiendo tu situación y quiero asegurarme de que recibas la mejor atención."

2. **Explica la escalación**: "Por tu seguridad, necesito que un miembro de nuestro equipo te contacte directamente para evaluar tu caso."

3. **Confirma contacto**: "¿Confirmas que el número [número del paciente] es el mejor para contactarte?"

4. **Indica tiempo de respuesta**: "Te contactaremos en las próximas [X] horas."

5. **NO intentes dar consejos clínicos**: No sugieras medicamentos, no diagnostiques, no des instrucciones clínicas.

## Mensaje de escalación

Usa este template:
"Gracias por contactarnos. Por la naturaleza de tu consulta, necesito que un miembro de nuestro equipo médico te contacte directamente para brindarte la mejor atención. Te contactaremos al número [número] en las próximas horas. Si tu situación es una emergencia médica, por favor acude a urgencias inmediatamente."
```

### 4.5 Fase 5: Canal WhatsApp

#### 4.5.1 `agent/channels/whatsapp.ts`

```typescript
import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import { createRedisState } from "@chat-adapter/state-redis";
import type { Message, Thread } from "chat";
import { chatSdkChannel } from "eve/channels/chat-sdk";

export const { bot, channel, send } = chatSdkChannel({
  userName: "Consultorio Dental",
  adapters: {
    whatsapp: createWhatsAppAdapter({
      // Credenciales de Meta WhatsApp Cloud API
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN!,
      appSecret: process.env.WHATSAPP_APP_SECRET!,
    }),
  },
  state: createRedisState({
    url: process.env.REDIS_URL!,
  }),
  streaming: false, // WhatsApp no soporta streaming nativo
});

// Handler para nuevos mensajes
bot.onNewMention(async (thread: Thread, message: Message) => {
  await thread.subscribe();
  await send(message.text, { thread });
});

// Handler para mensajes en conversaciones activas
bot.onSubscribedMessage(async (thread: Thread, message: Message) => {
  await send(message.text, { thread });
});
```

### 4.6 Fase 6: Configuración del Agente

#### 4.6.1 `agent/agent.ts`

```typescript
import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-4o", // o el modelo que prefieras
  reasoning: "medium",
  limits: {
    sessionTimeoutMs: 30 * 60 * 1000, // 30 minutos de timeout
  },
});
```

### 4.7 Fase 7: Variables de Entorno

Agregar a `.env.local` y Vercel:

```bash
# Eve
AI_GATEWAY_API_KEY=...  # Si usas AI Gateway

# Meta WhatsApp (existing)
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_APP_SECRET=...

# Redis (para estado durable)
REDIS_URL=redis://...

# Supabase (existing)
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 5. Migración Paso a Paso

### Paso 1: Instalar Eve y crear estructura
```bash
npm install eve@latest @chat-adapter/whatsapp @chat-adapter/state-redis
mkdir -p agent/tools agent/skills agent/channels
```

### Paso 2: Crear agent.ts e instructions.md
Crear los archivos base del agente.

### Paso 3: Migrar tools
Crear cada tool migrando la lógica de `src/lib/booking/*.ts`.

### Paso 4: Crear skills
Crear los skills markdown con los procedimientos.

### Paso 5: Configurar canal WhatsApp
Crear `agent/channels/whatsapp.ts` con Chat SDK adapter.

### Paso 6: Probar localmente
```bash
npm run dev
# El agente estará disponible en http://localhost:3000/eve/v1/whatsapp
```

### Paso 7: Configurar webhook de Meta
En Meta Business Suite, cambiar la URL del webhook a:
```
https://tu-dominio.vercel.app/eve/v1/whatsapp
```

### Paso 8: Probar en producción
Enviar mensajes de prueba y verificar que el agente responda correctamente.

### Paso 9: Eliminar código legacy
Una vez confirmado que Eve funciona correctamente:
- Eliminar `src/lib/whatsapp/`
- Eliminar `src/lib/flows/`
- Eliminar `src/lib/ai/whatsapp-*.ts`
- Eliminar `app/api/whatsapp/webhook/`

### Paso 10: Limpiar variables de entorno
Eliminar `WHATSAPP_FLOW_ENGINE_ENABLED` (ya no es necesario).

---

## 6. Beneficios de la Migración

### 6.1 Durabilidad Nativa
- Eve maneja sesiones durables automáticamente
- No necesitas `flow-engine.ts` ni `flow-control.ts`
- El estado de la conversación sobrevive crashes y redeploys

### 6.2 HITL (Human-in-the-Loop)
- Eve maneja confirmaciones y aprobaciones nativamente
- No necesitas implementar lógica de confirmación manual
- Las sessions se pausan y reanudan automáticamente

### 6.3 Observabilidad
- Eve tiene Agent Runs nativo en el dashboard de Vercel
- Puedes ver cada turno, tool call, y el reasoning del modelo
- No necesitas `debug-logger.ts`

### 6.4 Menos Código
- Eliminas ~2000 líneas de código de orquestación
- Eve maneja el loop del agente, clasificación de intents, y routing
- Te enfocas en la lógica de negocio (tools y skills)

### 6.5 Escalabilidad
- Eve soporta subagentes nativamente
- Puedes delegar tareas especializadas a subagentes
- Fácil agregar nuevos canales (Slack, Discord, etc.)

---

## 7. Riesgos y Mitigaciones

### Riesgo 1: Eve está en Beta
**Mitigación:**
- Eve es mantenido por Vercel (respaldo sólido)
- Licencia Apache 2.0 (puedes fork si es necesario)
- El código actual se mantiene como fallback hasta confirmar estabilidad

### Riesgo 2: WhatsApp no es First-Class en Eve
**Mitigación:**
- Chat SDK adapter funciona con Meta Cloud API directo
- No necesitas intermediarios (BSP)
- Si hay problemas, puedes crear un custom channel con `defineChannel`

### Riesgo 3: Migración Compleja
**Mitigación:**
- Migración gradual: Eve corre en paralelo al código actual
- Feature flag para activar/desactivar Eve
- Rollback inmediato si hay problemas

### Riesgo 4: Dependencia de Redis
**Mitigación:**
- Redis es necesario para estado durable en producción
- Upstash ofrece Redis serverless con free tier generoso
- Alternativa: usar el state adapter de Postgres (Supabase)

---

## 8. Timeline Estimado

| Fase | Duración | Descripción |
|------|----------|-------------|
| Setup | 1 día | Instalar Eve, crear estructura, configurar |
| Tools | 2 días | Migrar 6 tools (check-availability, book-appointment, etc.) |
| Skills | 1 día | Crear 3 skills (booking-flow, clinical-escalation, knowledge-answers) |
| Channel | 1 día | Configurar canal WhatsApp con Chat SDK |
| Testing | 2 días | Probar localmente y en staging |
| Deploy | 1 día | Deploy a producción, configurar webhook de Meta |
| Cleanup | 1 día | Eliminar código legacy, limpiar variables de entorno |
| **Total** | **9 días** | |

---

## 9. Criterios de Éxito

El agente Eve se considera exitoso cuando:

1. ✅ Responde correctamente a preguntas de knowledge base
2. ✅ Completa el flujo de agendamiento de principio a fin
3. ✅ Escala a humano en casos clínicos
4. ✅ Mantiene contexto conversacional entre mensajes
5. ✅ Sobrevive redeploys sin perder estado de conversación
6. ✅ Tiempo de respuesta < 3 segundos
7. ✅ Zero errores de envío de mensajes

---

## 10. Próximos Pasos

1. **Aprobar este plan** - Revisar y aprobar la estrategia de migración
2. **Crear worktree** - Crear branch `feat/eve-whatsapp-agent` para el experimento
3. **Implementar Fase 1-5** - Setup, tools, skills, channel
4. **Probar localmente** - Verificar que el agente funciona correctamente
5. **Deploy a staging** - Probar en entorno de staging
6. **Deploy a producción** - Activar Eve en producción con feature flag
7. **Monitorear** - Observar métricas y logs durante 1 semana
8. **Cleanup** - Eliminar código legacy si todo funciona correctamente

---

## 11. Recursos Adicionales

- [Documentación de Eve](https://eve.dev/docs)
- [Ejemplos de Eve](https://github.com/vercel/eve/tree/main/examples)
- [Chat SDK WhatsApp Adapter](https://chat-sdk.dev/adapters/whatsapp)
- [Eve Channels Overview](https://eve.dev/docs/channels/overview)
- [Eve Tools Guide](https://eve.dev/docs/tools)
- [Eve Skills Guide](https://eve.dev/docs/skills)
