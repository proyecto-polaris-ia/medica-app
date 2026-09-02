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
Recibe `GET` (verificación de Meta) y `POST` (eventos entrantes). Valida token,
normaliza, persiste raw, responde rápido `200 OK`, delega al orquestador.

### 3.2 Orquestador inbound (`lib/whatsapp/inbound-service.ts`)
Único componente que coordina el flujo: normaliza → persiste → carga contexto →
invoca al agente → ejecuta la acción decidida (responder, reservar, escalar) →
registra. El webhook no implementa lógica; el LLM no escribe ni envía.

### 3.3 Agente dual (`lib/ai/whatsapp-inbound-agent.ts` + `booking-agent.ts`)
Clasifica intención y devuelve decisión estructurada:

```
decision ∈ auto_answer (FAQ) | tool_action (booking) | needs_human (escalar)
```

- **`auto_answer`**: responde con conocimiento aprobado (`citedKnowledgeIds`).
- **`tool_action`**: propone `{ name: "check_availability"|"book", args }`; el
  backend calcula disponibilidad y reserva.
- **`needs_human`**: escalación (dolor, urgencia, receta, costo, ambigüedad).

### 3.4 Motor de disponibilidad y reserva (`lib/booking/`)
Slots libres derivados de `business_hours − appointments`. La reserva es
atómica (constraint de exclusión por proveedor). `next-available.ts` calcula la
siguiente hora libre cuando el rango pedido no tiene espacio.

### 3.5 Escalación humana (`lib/whatsapp/escalation.ts`)
Crea escalación en Supabase, alerta al WhatsApp humano y responde al paciente
que una persona dará seguimiento.

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

## 5. Flujo del agente dual

```
mensaje → normalize → persist → preflight
 ├─ patrón clínico (dolor/urgencia/medicamento/receta/infección) → needs_human
 ├─ patrón costo/precio → needs_human (invitar valoración)
 ├─ intención booking → tool_action
 │    ├─ check_availability → SQL calcula slots → proponer → guardar booking_context
 │    ├─ book → reserva atómica → éxito: confirmar | conflicto: recomendar próxima hora
 │    └─ paciente elige opción del contexto → book
 └─ intención FAQ → auto_answer con conocimiento aprobado
```

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

## 8. Variables de entorno

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
WHATSAPP_AGENT_LLM_API_STYLE=
```

Todas server-side; ninguna con prefijo `NEXT_PUBLIC_` salvo las dos primeras.
