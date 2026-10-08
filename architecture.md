# Arquitectura — medica-app (MVP 0)

Referencia técnica del MVP. Define stack, componentes, modelo de datos y el
mapa de reutilización desde TravelHub.

## 1. Stack

- **Vercel** — Next.js (App Router) + TypeScript. Webhook, API y agente viven
  en el mismo proyecto.
- **Supabase** — Postgres como fuente de verdad (agenda, pacientes, servicios,
  proveedores, conocimiento, conversaciones). Auth para roles. Storage en fase
  posterior.
- **Meta WhatsApp Cloud API** — canal de entrada/salida de mensajes.
- **LLM configurable** — interpreta intención y redacta respuestas. No decide
  disponibilidad ni escribe en BD.

## 2. Reutilización desde TravelHub (opción A: copiar + adaptar)

Base: `src/` del agente inbound de
`/Volumes/Data Coding/Desarrollo/AI-workspace/travelhub-app`.

| Archivo (TravelHub) | Acción | Cambios para medica-app |
|---|---|---|
| `lib/whatsapp/normalize.ts` | Copiar | ninguno |
| `lib/whatsapp/client.ts` | Copiar | ninguno |
| `lib/ai/whatsapp-llm-provider.ts` | Copiar | ninguno |
| `app/api/whatsapp/webhook/route.ts` | Copiar | ninguno |
| `scripts/whatsapp-simulate-inbound.mjs` | Copiar | URL default |
| `lib/whatsapp/store.ts` | Adaptar | `assigned_trip_id` → contexto de booking; `linked_client_id` → `linked_patient_id` |
| `lib/ai/whatsapp-inbound-agent.ts` | Adaptar | intents de booking + `tool_action`; preflight clínico |
| `lib/whatsapp/inbound-service.ts` | Adaptar | rama `tool_action` (reservar) |
| `lib/whatsapp/escalation.ts` | Adaptar | textos → consultorio dental |
| `loadApprovedWhatsAppKnowledgeEntries` + `whatsapp_knowledge_entries` | Copiar | FAQ estático |
| Migración `whatsapp_inbound_data_foundation.sql` | Copiar + adaptar | FK a `patients`; incluir `set_updated_at()` (hoy en `0016`) |

> **Nota (Etapa 7, issue #37):** esta tabla es el registro histórico de la
> reutilización desde TravelHub. Los archivos `lib/ai/whatsapp-llm-provider.ts`,
> `lib/ai/whatsapp-inbound-agent.ts`, `lib/whatsapp/inbound-service.ts` y
> `lib/whatsapp/escalation.ts` ya **no existen**: el pipeline legacy de WhatsApp
> se eliminó y Eve es el único runtime conversacional de ese canal.

**Nuevo (sin equivalente en TravelHub):**

```
src/lib/booking/
├── availability.ts    # slots libres = business_hours − appointments
├── booking.ts         # reserva atómica (constraint de exclusión)
├── next-available.ts  # recomendar próxima hora libre
└── booking-state.ts   # estado multi-turno de selección de slot
src/lib/ai/booking-agent.ts   # intents book_appointment / check_availability
```

## 3. Componentes

### 3.1 Webhook de WhatsApp (`app/api/whatsapp/webhook/route.ts`)
`GET` atiende la verificación de Meta (`hub.mode`, `hub.verify_token`,
`hub.challenge`). `POST` verifica la firma `x-hub-signature-256`, parsea el
payload, emite el indicador de "escribiendo" y un registro de observabilidad, y
**siempre** reenvía el cuerpo crudo a `/eve/v1/whatsapp` (propagando la cabecera
de firma de Meta) y refleja la respuesta de Eve. No hay rama legacy ni
alternativa: si el reenvío falla responde `502` y registra `webhook.failed`.

### 3.2 Agentes raíz (`agents/<name>/agent/`)
Workspace multi-agente: cada agente raíz vive en `agents/<name>/agent/` con su
propio canal y se despliega como servicio Vercel independiente
(`eve-eva` → `/eva/eve/v1/*`, `eve-mora` → `/mora/eve/v1/*`; ver `vercel.json`).

- **Eva** (`agents/eva/agent/`): recepción y citas por WhatsApp.
  `instructions.md` define instrucciones y guardrails; `tools/*.ts` expone las
  acciones deterministas (catálogo, disponibilidad, reserva, escalación) y
  `skills/*.md` los procedimientos.
- **Mora** (`agents/mora/agent/`): cobranza y saldos, con canal Discord propio
  (`channels/discord.ts`, ruta `/mora/eve/v1/discord`), tools
  (`find-patient`, `get-patient-balance`, `list-overdue-balances`,
  `register-payment-intent`), skill `payment-collection.md` y módulo de acceso
  `access.ts` (allowlist de doctores + resolución del paciente nombrado).
  Los doctores le hablan directo por Discord; la autorización es fail-closed
  vía `MORA_DISCORD_DOCTOR_IDS`.
- En WhatsApp, Eva escala las intenciones de cobranza a un humano
  (`escalate-to-human`); la delegación a subagentes se retiró con el issue
  #159.

El LLM interpreta y redacta; las tools ejecutan contra Supabase. Los webhooks
solo reenvían: el LLM no escribe en BD ni envía mensajes por sí mismo.

### 3.3 Tipos compartidos de decisión inbound (`lib/whatsapp/inbound-decision.ts`)
`WhatsAppInboundIntent` y la forma de decisión que consume el store
(`WhatsAppInboundAgentDecision`) viven en este módulo. Lo usan
`lib/whatsapp/eve-escalation.ts`, `lib/whatsapp/store.ts` y
`lib/ai/whatsapp-intent-classifier.ts` (web chat), módulos que sobrevivieron a la
limpieza de la Etapa 7.

### 3.4 Motor de disponibilidad y reserva (`lib/booking/`)
Slots libres derivados de `business_hours − appointments`. La reserva es
atómica (constraint de exclusión por proveedor). `next-available.ts` calcula la
siguiente hora libre cuando el rango pedido no tiene espacio.

### 3.5 Escalación humana (`lib/whatsapp/eve-escalation.ts`)
Crea la escalación en Supabase y genera el texto de alerta al WhatsApp humano. La
invocan las tools de Eve `escalate-to-human` y `register-payment-intent`.

## 4. Modelo de datos (Supabase)

### Dominio de agenda

| Tabla | Campos clave | Nota |
|---|---|---|
| `patients` | id, full_name, phone_e164 (unique), notes | el cliente/paciente |
| `services` | id, name, duration_minutes | duración define el slot |
| `providers` | id, name | Jorge, hijo |
| `business_hours` | provider_id, day_of_week, start_time, end_time | horario **por proveedor** |
| `appointments` | patient_id, service_id, provider_id, start_at, end_at, status | la cita |

Estados de cita: `solicitada / confirmada / pendiente / cancelada /
reprogramada / no_asistió / atendida`.

### Canal WhatsApp (adaptado de TravelHub)

`whatsapp_contacts`, `whatsapp_conversations` (con `booking_context` jsonb),
`whatsapp_messages`, `whatsapp_intents`, `whatsapp_escalations`,
`whatsapp_knowledge_entries`, `crm_sync_events`.

### Migraciones

Supabase acepta tanto nomenclatura secuencial como timestamp (y aplica los
archivos en orden lexicográfico). La **convención vigente en este repo es
timestamp**: `supabase/migrations/YYYYMMDDHHMMSS_descripcion_snake_case.sql`
(p. ej. `20250115103000_payment_intents_reminders.sql`), con la fecha/hora en
UTC. La numeración secuencial `NNNN_descripcion.sql`
(p. ej. `0017_payment_intents_reminders.sql`) está **deprecada**: los archivos
existentes no se renombran, pero no debe extenderse con migraciones nuevas.

Reglas:

- Toda migración nueva usa timestamp `YYYYMMDDHHMMSS_descripcion.sql`.
- El timestamp se toma al momento de crear el archivo (UTC), no se reutiliza ni
  se inventa.
- Los archivos secuenciales existentes (`0001`–`00NN`) se conservan tal cual;
  no se renumeran ni se convierten a timestamp.
- Supabase aplica el orden lexicográfico, así que los archivos timestamp se
  ejecutan después de los secuenciales; si eso importa para una migración
  nueva, verificar dependencias contra el estado real del esquema, no contra el
  número secuencial.

Reglas de contenido: instantes de fecha/hora siempre `timestamptz`
(presentación en `America/Mexico_City`, ver `src/lib/admin/clinic-time.ts`);
cambios de estado de cita escriben su columna de transición
(`confirmed_at`, `cancelled_at`, `no_show_at`) además del `status`
(ver decisiones en issues #86–#89).

## 5. Flujos conversacionales

Hay dos canales y cada uno tiene su propio runtime.

### 5.1 WhatsApp (Eve)

```
mensaje → webhook verifica firma → Eve agent (/eve/v1/whatsapp)
 ├─ guardrail clínico (dolor/urgencia/medicamento/receta/infección) → escalar a humano
 ├─ intención de costo/precio → invitar a valoración
 ├─ intención de agendamiento → tools (catálogo, disponibilidad, reserva)
 └─ intención FAQ → conocimiento aprobado
```

El webhook solo verifica y reenvía; la orquestación y el estado de la
conversación viven en Eve, no en este repo.

### 5.2 Web chat (Flow Engine)

```
mensaje → app/api/web-chat/message → lib/web-chat/web-inbound-service
 ├─ inquiry → handler de conocimiento
 ├─ book_appointment / check_availability → Flow Engine (flujo book_appointment)
 └─ support / handoff → handoff a humano
```

El Flow Engine sigue siendo el runtime determinístico del web chat (sección 8).

## 6. Guardrails (reglas duras, en backend)

- No diagnosticar ni recetar.
- No inventar horarios: disponibilidad solo desde la BD.
- No dar precios definitivos por WhatsApp.
- Escalar dolor fuerte, urgencia, infección, alergia, medicamento/receta.
- El LLM propone; el backend valida y ejecuta.

## 7. Riesgos técnicos

- **Doble reserva:** `EXCLUDE USING gist (provider_id with =,
  tstzrange(start_at, end_at) with &&)`. Una cita cancelada sigue ocupando el
  rango → al cancelar se anula el rango (`start_at = end_at`) o se borra.
- **Zona horaria:** `America/Mexico_City`; todo `timestamptz`.
- **Idempotencia:** `whatsapp_message_id` único (ya resuelto en el copiado).
- **Webhook rápido:** el procesamiento pesado/LLM no debe bloquear el `200 OK`.

## 8. Flow Engine (arquitectura de flujos conversacionales)

> **Alcance (Etapa 7, issue #37):** el Flow Engine es el runtime determinístico
> **exclusivo del web chat** (`app/api/web-chat/message/route.ts` →
> `src/lib/web-chat/web-inbound-service.ts`). Su consumidor de WhatsApp
> (orchestrator) se eliminó y el engine ya no se usa para ese canal.

### 8.1 Problema resuelto

El agente anterior dependía completamente del LLM para:
1. Clasificar el intent
2. Decidir el siguiente paso del flujo
3. Generar la respuesta

Esto causaba inconsistencias: el agente perdía el hilo de la conversación, no seguía un proceso definido para agendar citas, y escalaba a humano innecesariamente.

### 8.2 Arquitectura de tres capas

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

### 8.3 Componentes

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| **Flow Engine** | `src/lib/flows/flow-engine.ts` | Motor determinístico que ejecuta flujos conversacionales |
| **Flow Definitions** | `src/lib/flows/definitions/*.flow.ts` | Configuración declarativa de flujos |
| **Types** | `src/lib/flows/types.ts` | Definiciones de tipos (FlowState, FlowResult, etc.) |
| **Web chat inbound** | `src/lib/web-chat/web-inbound-service.ts` | Routing basado en intent, ejecuta acciones de negocio |

### 8.4 Routing de intents (web chat)

| Intent | Handler | Usa Flow Engine? |
|--------|---------|------------------|
| `inquiry` | Knowledge Handler (LLM directo) | ❌ No |
| `book_appointment` | Flow Engine | ✅ Sí |
| `check_availability` | Flow Engine | ✅ Sí |
| `support` | Escalation Handler (directo) | ❌ No |
| `unknown` | Fallback | ❌ No |

### 8.5 Flujo de booking (book_appointment)

```
collect_date → collect_service → collect_provider → check_availability 
    → select_slot → confirm_booking → collect_notes → complete
```

**Estados:**
1. `collect_date` — Pregunta por la fecha
2. `collect_service` — Pregunta por el servicio
3. `collect_provider` — Pregunta por el doctor
4. `check_availability` — Consulta horarios disponibles (acción: `getFreeSlots`)
5. `select_slot` — Usuario selecciona horario
6. `confirm_booking` — Confirma y agenda (acción: `bookAppointment`)
7. `collect_notes` — Pregunta por notas adicionales
8. `complete` — Flujo terminado

### 8.6 Persistencia de estado

El estado del flujo se persiste por conversación en el store del consumidor. En
web chat se guarda en `web_chat_sessions.flow_state` (jsonb):

```typescript
type FlowState = {
  name: string;           // nombre del estado actual
  entities: ExtractedEntities;  // entidades recolectadas
  candidates?: Array<{...}>;    // slots disponibles (si aplica)
  metadata?: Record<string, unknown>;  // datos adicionales
  flowName?: string;      // nombre del flujo activo
  lastActivity?: string;  // timestamp ISO de la última actividad
};
```

### 8.7 Sin feature flag

El engine no tiene interruptor de activación en runtime: sus consumidores
(web chat) lo invocan directamente. La variable `WHATSAPP_FLOW_ENGINE_ENABLED`
se eliminó en la Etapa 7.

### 8.8 Ventajas

| Característica | Beneficio |
|----------------|-----------|
| **Determinístico** | El flujo no depende del LLM |
| **Escalable** | Agregar flujos es agregar configuración |
| **Testeable** | Flows son código puro, fácil de testear |
| **Mantenible** | Separación clara entre lógica y lenguaje |
| **Auditable** | Cada transición de estado queda registrada |

### 8.9 Agregar un nuevo flujo

1. Crear definición en `src/lib/flows/definitions/nuevo-flow.flow.ts`
2. Registrar en `flowRegistry`
3. Agregar routing en `src/lib/web-chat/web-inbound-service.ts`
4. Agregar tests unitarios

Ejemplo de definición:
```typescript
export const rescheduleFlow: FlowDefinition = {
  name: 'reschedule_appointment',
  initialState: 'find_appointment',
  states: {
    find_appointment: {
      required: ['appointmentId'],
      prompt: '¿Cuál cita quieres reprogramar?',
      transitions: { found: 'select_new_date' },
    },
    // ... más estados
  },
};
```

## 9. Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_HUMAN_ALERT_PHONE=
WHATSAPP_AGENT_LLM_API_KEY=
WHATSAPP_AGENT_LLM_MODEL=
WHATSAPP_AGENT_LLM_BASE_URL=
```

Todas server-side; ninguna con prefijo `NEXT_PUBLIC_` salvo las dos primeras. Las
variables de referencia viven en `.env.local.example`.

## 9. Estrategia de pruebas de datos (Supabase local)

Las suites de datos (`src/lib/admin/__tests__/`, `src/lib/booking/__tests__/booking|catalog|reschedule`,
`src/lib/wcc-*`, `src/lib/admin/__tests__/rls`) corren **contra una base Supabase local
(CLI)**, no contra mocks del query builder. Los mocks a mano de Postgres se eliminaron:
ocultaban bugs reales (errores PGRST116 devueltos como 500 en vez de 404, traducciones de
código muertas, errores de BD tragados como "sin historial").

- **Levantar**: `supabase start` (puertos locales desplazados en `config.toml`: API 54331,
  Postgres 54332, Studio 54333, para no chocar con otros stacks de Supabase en la misma
  máquina). Tras arrancar de un backup, correr `supabase db reset` (aplica migraciones +
  `supabase/seed.sql`).
- **Correr**: `npm run test:local` (equivale a `SUPABASE_LOCAL=1 vitest run`). Sin esa
  variable, las suites de datos se omiten (`npm run test` sigue funcionando sin Docker).
- **Aislamiento**: cada suite trunca el esquema `public` (`truncateAllTables`) y se
  serializa entre archivos con un advisory lock (`acquireDbSuiteLock`), porque vitest
  corre los archivos en paralelo. Helper: `src/test-utils/local-db.ts`.
- **Lo que se mockea y qué no**: los tests de datos no mockean Supabase; sí conservan
  mocks legítimos de frontera (tests de rutas API que prueban contrato HTTP, lógica pura,
  Turnstile, cliente de WhatsApp). La inyección de fallas de red se hace a nivel `fetch`.
- **RLS**: las tablas con política `*_admin_all` (TO authenticated) y las tablas con RLS
  sin políticas (solo service_role) están cubiertas en `src/lib/admin/__tests__/rls.test.ts`.
- **Seed**: `supabase/seed.sql` con datos mínimos deterministas; las suites crean sus
  propios fixtures vía funciones de dominio.
- **CI**: job `test-local-db` en `.github/workflows/ci.yml` levanta Supabase local sin
  credenciales de producción y corre `npm run test:local`.
- **Troubleshooting — contenedores obsoletos tras actualizar la CLI**: `supabase start`
  y `supabase db reset` **no recrean contenedores**; si el stack se levantó con una
  versión anterior de la CLI, siguen corriendo las imágenes viejas (por ejemplo,
  storage-api v1.71.0 genera `INSERT ... ON CONFLICT (name, bucket_id)` en
  `storage.objects` que PostgreSQL 17 no puede resolver contra índices únicos parciales,
  error `42P10` / `infer_arbiter_indexes`, y rompe los uploads de
  `patient-files.test.ts`). Síntoma típico: fallas locales deterministas que CI
  (`test-local-db`, con stack fresco en cada run) no reproduce. Tras actualizar la CLI,
  recrear el stack completo:

  ```sh
  supabase stop --no-backup && supabase start && supabase db reset
  npm run test:local
  ```
