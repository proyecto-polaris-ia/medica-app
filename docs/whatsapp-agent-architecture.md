# Arquitectura del Agente de WhatsApp — Diagrama de Componentes

> Documento de referencia técnica para la arquitectura del agente de WhatsApp.
> Última actualización: 2026-09-05

## Diagrama General

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              META WHATSAPP CLOUD API                            │
│                         (Webhook: POST /api/whatsapp/webhook)                   │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         app/api/whatsapp/webhook/route.ts                       │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ GET: Verificación de Meta (hub.mode, hub.verify_token, hub.challenge)    │  │
│  │ POST: Recepción de eventos entrantes                                     │  │
│  │   • Verifica firma (x-hub-signature-256)                                │  │
│  │   • Parsea JSON payload                                                 │  │
│  │   • Llama a processWhatsAppWebhookPayload()                             │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    src/lib/whatsapp/inbound-service.ts                          │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ processWhatsAppWebhookPayload()                                         │  │
│  │   • normalizeWhatsAppWebhookPayloadBundle() → separa inbound/status     │  │
│  │   • persistStatusEvents() → guarda callbacks de estado                  │  │
│  │   • processWhatsAppInboundEvents() → procesa cada evento inbound        │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                  │                                              │
│                                  ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ processWhatsAppInboundEvent()                                           │  │
│  │   1. persistInboundEvent() → guarda contacto, conversación, mensaje     │  │
│  │   2. loadConversationContext() → carga contexto previo + flowState      │  │
│  │   3. loadConversationHistory() → carga últimos 20 mensajes              │  │
│  │   4. isFlowEngineEnabled() → decide qué path usar                       │  │
│  │      ├─ true  → processWithFlowEngine()                                 │  │
│  │      └─ false → processWithLegacy()                                     │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              │                                     │
              ▼                                     ▼
┌─────────────────────────────┐       ┌─────────────────────────────────────────┐
│  processWithFlowEngine()    │       │         processWithLegacy()             │
│  (WHATSAPP_FLOW_ENGINE_     │       │    (Path legacy, backward compatible)   │
│   ENABLED=true)             │       │                                         │
│                             │       │  • decideWhatsAppInboundMessage()       │
│  → orchestrate()            │       │    (LLM decide intent + flujo + resp)   │
│                             │       │  • runBookingTool()                     │
│                             │       │  • Escalación directa                   │
└──────────────┬──────────────┘       └─────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      src/lib/whatsapp/orchestrator.ts                           │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ orchestrate(context)                                                    │  │
│  │   1. classifyIntent() → clasifica intent (sin LLM)                      │  │
│  │   2. Routing según intent:                                              │  │
│  │      ├─ inquiry         → handleKnowledgeQuery()                        │  │
│  │      ├─ book_appointment→ handleBookingFlow()                           │  │
│  │      ├─ check_availability→ handleBookingFlow()                         │  │
│  │      ├─ support/handoff → handleEscalation()                            │  │
│  │      └─ default         → handleFallback()                              │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ classifyIntent()                                                        │  │
│  │   • classifyIntentSimple() → patrones regex (sin LLM)                   │  │
│  │   • extractEntities() → extrae fecha, servicio, doctor, hora            │  │
│  │   • Retorna WhatsAppInboundAgentDecision con intent + entidades         │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ handleBookingFlow()                                                     │  │
│  │   1. getFlowDefinition('book_appointment')                              │  │
│  │   2. flowEngine.createInitialState() o cargar flowState existente       │  │
│  │   3. extractEntitiesFromClassification()                                │  │
│  │   4. flowEngine.execute(flow, flowState, entities)                      │  │
│  │   5. Loop: mientras action != 'ask' y != 'complete':                    │  │
│  │      • executeFlowAction() → ejecuta acción del estado                  │  │
│  │      • flowEngine.advance() → avanza al siguiente estado                │  │
│  │   6. generateFlowResponse() → genera respuesta con placeholders         │  │
│  │   7. Retorna OrchestratorResult con flowState + responseText            │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ executeFlowAction()                                                     │  │
│  │   • getFreeSlots → availability.getFreeSlots()                          │  │
│  │   • bookAppointment → booking.bookAppointment()                         │  │
│  │   • resolveService → catalog.resolveServiceByName()                     │  │
│  │   • resolveProvider → catalog.resolveProviderByName()                   │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       src/lib/flows/flow-engine.ts                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ FlowEngine (singleton: flowEngine)                                      │  │
│  │                                                                          │  │
│  │ execute(flow, currentState, newEntities):                               │  │
│  │   • Merge entidades previas + nuevas                                    │  │
│  │   • Si estado terminal → return { action: 'complete' }                  │  │
│  │   • Si faltan entidades requeridas → return { action: 'ask' }           │  │
│  │   • Si hay acción definida → return { action: stateDef.action }         │  │
│  │   • Si no → transicionar al siguiente estado                            │  │
│  │                                                                          │  │
│  │ advance(flow, currentState, actionResult, additionalEntities):          │  │
│  │   • Busca transición por actionResult                                   │  │
│  │   • Merge entidades + metadata adicionales                              │  │
│  │   • Retorna nuevo FlowResult                                            │  │
│  │                                                                          │  │
│  │ createInitialState(flow, initialEntities?):                             │  │
│  │   • Crea FlowState con flow.initialState                                │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│              src/lib/flows/definitions/book-appointment.flow.ts                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ bookAppointmentFlow: FlowDefinition                                     │  │
│  │                                                                          │  │
│  │ Estados:                                                                 │  │
│  │   collect_date      → required: [localDate]                             │  │
│  │   collect_service   → required: [serviceId]                             │  │
│  │   collect_provider  → required: [providerId]                            │  │
│  │   check_availability→ action: 'getFreeSlots'                            │  │
│  │   select_slot       → required: [startAt, endAt]                        │  │
│  │   confirm_booking   → action: 'bookAppointment'                         │  │
│  │   collect_notes     → optional: [notes]                                 │  │
│  │   suggest_alternative (si no hay slots)                                 │  │
│  │   complete          → terminal: true                                    │  │
│  │                                                                          │  │
│  │ flowRegistry: { book_appointment: bookAppointmentFlow }                 │  │
│  │ getFlowDefinition(name): FlowDefinition                                 │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          src/lib/ai/ (Inteligencia Artificial)                  │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ whatsapp-intent-classifier.ts                                          │    │
│  │   • classifyIntentSimple(message) → ClassificationResult               │    │
│  │     - Patrones regex para support/inquiry/booking                      │    │
│  │     - Extrae entidades: fecha, hora, servicio, doctor                  │    │
│  │     - Prioridad: support > inquiry > booking                           │    │
│  │   • extractEntities(message) → entities                                │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ whatsapp-inbound-agent.ts (Legacy)                                     │    │
│  │   • decideWhatsAppInboundMessage() → WhatsAppInboundAgentDecision      │    │
│  │     - Preflight clínico (dolor, urgencia, medicamento)                 │    │
│  │     - LLM provider (whatsapp-llm-provider)                             │    │
│  │     - Fallback a knowledge local                                       │    │
│  │     - Fallback a localBookingDecision                                  │    │
│  │   • buildWhatsAppClinicalEscalationDecision()                          │    │
│  │   • loadApprovedWhatsAppKnowledgeEntries()                             │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ whatsapp-llm-provider.ts                                               │    │
│  │   • createWhatsAppLLMProvider() → WhatsAppInboundAgentProvider         │    │
│  │     - Config: apiKey, baseUrl, model, apiStyle, timeoutMs              │    │
│  │     - buildSystemPrompt() con contexto temporal                        │    │
│  │     - buildUserPrompt() con mensaje + knowledge + catalog              │    │
│  │     - Soporta chat_completions y responses API                         │    │
│  │     - Timeout: 12s default                                             │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          src/lib/booking/ (Lógica de Negocio)                   │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ availability.ts                                                        │    │
│  │   • getFreeSlots({ providerId, serviceId, localDate })                 │    │
│  │     - Obtiene duración del servicio                                    │    │
│  │     - Llama a Supabase RPC: booking_free_slots()                       │    │
│  │     - Retorna Slot[] (start_at, end_at)                                │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ booking.ts                                                             │    │
│  │   • bookAppointment({ patientId, serviceId, providerId, startAt,       │    │
│  │                       endAt, notes })                                   │    │
│  │     - Inserta en appointments con status 'requested'                   │    │
│  │     - Maneja conflictos (exclusion_violation 23P01)                    │    │
│  │     - Retry con backoff (3 intentos)                                   │    │
│  │     - Retorna { ok: true } o BookingConflict                           │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ catalog.ts                                                             │    │
│  │   • listServices() → Service[]                                         │    │
│  │   • listProviders() → Provider[]                                       │    │
│  │   • resolveServiceByName(name) → Service | null                        │    │
│  │   • resolveProviderByName(name) → Provider | null                      │    │
│  │   • resolveKnowledgeToService(knowledgeEntry) → Service | null         │    │
│  │     - Busca link explícito en whatsapp_knowledge_service_links         │    │
│  │     - Fallback a fuzzy matching (normalizeForMatch)                    │    │
│  │     - Default a "Valoración general"                                   │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ patient-resolution.ts                                                  │    │
│  │   • resolvePatient({ phone, fullName }) → Patient                      │    │
│  │     - Busca o crea paciente por phone_e164                             │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ next-available.ts                                                      │    │
│  │   • findNextAvailable({ providerId, serviceId, after })                │    │
│  │     - Busca próximo slot disponible después de una fecha               │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       src/lib/whatsapp/ (Infraestructura WhatsApp)              │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ store.ts                                                               │    │
│  │   • persistInboundEvent() → upsert contact, conversation, message      │    │
│  │   • loadConversationContext() → booking_context, last_intent,          │    │
│  │                                  summary, flow_state                   │    │
│  │   • loadConversationHistory() → últimos 20 mensajes                    │    │
│  │   • createIntent() → guarda intent detectado                           │    │
│  │   • insertOutboundMessage() → guarda mensaje enviado                   │    │
│  │   • createEscalation() → guarda escalación                             │    │
│  │   • updateConversationStatus() → actualiza status, last_intent         │    │
│  │   • updateConversationSummary() → actualiza resumen (max 500 chars)    │    │
│  │   • updateConversationFlowState() → actualiza flow_state (jsonb)       │    │
│  │   • markInboundMessageProcessed() → marca mensaje como procesado       │    │
│  │   • persistStatusEvents() → guarda callbacks de estado                 │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ client.ts                                                              │    │
│  │   • sendWhatsAppTextMessage({ to, body }) → WhatsAppSendResult         │    │
│  │     - POST a Graph API: /{phone-number-id}/messages                    │    │
│  │     - Headers: Authorization Bearer, Content-Type JSON                 │    │
│  │     - Body: messaging_product, recipient_type, to, type, text          │    │
│  │     - Retorna ok, status, providerMessageId, error                     │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ normalize.ts                                                           │    │
│  │   • normalizeWhatsAppWebhookPayload() → NormalizedWhatsAppInboundEvent[]│   │
│  │     - Extrae: providerMessageId, fromPhone, profileName, messageType,  │    │
│  │              body, occurredAt, rawMessage, rawValue                    │    │
│  │   • normalizeWhatsAppWebhookPayloadBundle() → { inboundEvents,         │    │
│  │                                                  statusEvents }        │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ signature.ts                                                           │    │
│  │   • verifyWhatsAppWebhookSignature({ rawBody, signatureHeader })       │    │
│  │     - Verifica HMAC-SHA256 con WHATSAPP_APP_SECRET                     │    │
│  │     - Retorna { ok: boolean, reason?: string }                         │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ escalation.ts                                                          │    │
│  │   • buildWhatsAppEscalationWork(event, decision)                       │    │
│  │     - Genera reason, priority, summary, customerFollowUpText,          │    │
│  │       humanAlertText                                                   │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    src/lib/observability/whatsapp-ai.ts                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ recordWhatsAppAiEvent({ type, outcome, diagnostics })                   │  │
│  │   • Tipos: webhook.received, webhook.accepted, webhook.rejected,        │  │
│  │            persistence.finished, duplicate.skipped, ai.decision,        │  │
│  │            ai.provider.started, ai.provider.finished, ai.provider.failed│  │
│  │            tool.finished, send.finished, escalation.created             │  │
│  │   • Outcomes: success, failure, skipped                                 │  │
│  │   • Correlation context: correlationId, requestId, providerMessageId    │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Supabase (PostgreSQL)                              │
│                                                                                  │
│  Tablas principales:                                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ whatsapp_contacts                                                      │    │
│  │   • id, phone_e164 (unique), whatsapp_profile_name, display_name,      │    │
│  │     source, last_seen_at, last_message_at                              │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ whatsapp_conversations                                                 │    │
│  │   • id, contact_id, channel, status (open/escalated/resolved/archived) │    │
│  │   • booking_context (jsonb), last_intent, summary, flow_state (jsonb)  │    │
│  │   • last_message_at, last_inbound_at, created_at, updated_at           │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ whatsapp_messages                                                      │    │
│  │   • id, conversation_id, contact_id, whatsapp_message_id (unique)      │    │
│  │   • direction (inbound/outbound), message_type, body, media (jsonb)    │    │
│  │   • payload (jsonb), status, occurred_at, processed_at, created_at     │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ whatsapp_intents                                                       │    │
│  │   • id, conversation_id, message_id, contact_id                        │    │
│  │   • intent_type, confidence, summary, entities (jsonb), status         │    │
│  │   • detected_at                                                        │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ whatsapp_escalations                                                   │    │
│  │   • id, conversation_id, contact_id, message_id, intent_id             │    │
│  │   • reason, priority, summary, status (open/resolved), resolved_at     │    │
│  │   • created_at, updated_at                                             │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ whatsapp_knowledge_entries                                             │    │
│  │   • id, topic, question, answer, tags (text[]), source, status         │    │
│  │   • approved_at, created_at, updated_at                                │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ whatsapp_knowledge_service_links                                       │    │
│  │   • id, knowledge_entry_id, service_id, created_at                     │    │
│  │   • UNIQUE(knowledge_entry_id, service_id)                             │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ whatsapp_message_status_callbacks                                      │    │
│  │   • id, message_id, whatsapp_message_id, status, recipient_phone       │    │
│  │   • occurred_at, payload (jsonb), callback_key (unique), created_at    │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ crm_sync_events                                                        │    │
│  │   • id, source_table, source_id, event_type, aggregate_type            │    │
│  │   • aggregate_id, event_key (unique), payload (jsonb), status          │    │
│  │   • attempts, available_at, processed_at, error, created_at            │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ patients, services, providers, business_hours, appointments            │    │
│  │   (Tablas del dominio de agenda)                                       │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Funciones SQL:                                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ booking_free_slots(provider_id, duration, target_date, clinic_tz)      │    │
│  │   • Calcula slots libres restando appointments de business_hours       │    │
│  │   • Retorna tabla(start_at, end_at)                                    │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Flujo de Datos Paso a Paso

### Escenario: Usuario quiere agendar una cita

```
1. Usuario envía: "quiero hacer una cita para el 15 de septiembre"
   │
   ▼
2. Meta WhatsApp Cloud API → POST /api/whatsapp/webhook
   │
   ▼
3. webhook/route.ts
   • Verifica firma (x-hub-signature-256)
   • Parsea JSON
   • Llama processWhatsAppWebhookPayload()
   │
   ▼
4. inbound-service.ts → processWhatsAppWebhookPayload()
   • normalizeWhatsAppWebhookPayloadBundle()
     → { inboundEvents: [...], statusEvents: [...] }
   • persistStatusEvents() → guarda callbacks de estado
   • processWhatsAppInboundEvents() → procesa cada evento
   │
   ▼
5. inbound-service.ts → processWhatsAppInboundEvent()
   • persistInboundEvent()
     → upsertWhatsAppContact() → whatsapp_contacts
     → getOrCreateOpenWhatsAppConversation() → whatsapp_conversations
     → insertInboundMessage() → whatsapp_messages
   • loadConversationContext()
     → SELECT booking_context, last_intent, summary, flow_state
   • loadConversationHistory()
     → SELECT direction, body ORDER BY occurred_at DESC LIMIT 20
   • isFlowEngineEnabled() → true (WHATSAPP_FLOW_ENGINE_ENABLED=true)
   │
   ▼
6. inbound-service.ts → processWithFlowEngine()
   • Construye OrchestratorContext
   • Llama orchestrate(context)
   │
   ▼
7. orchestrator.ts → orchestrate()
   • classifyIntent()
     → classifyIntentSimple("quiero hacer una cita para el 15 de septiembre")
       → { intent: 'book_appointment', confidence: 0.85,
           entities: { localDate: '15 septiembre' } }
     → extractEntities()
       → { localDate: '15 septiembre' }
   • Routing: intent === 'book_appointment'
     → handleBookingFlow()
   │
   ▼
8. orchestrator.ts → handleBookingFlow()
   • getFlowDefinition('book_appointment')
   • flowState = conversation.flowState || flowEngine.createInitialState()
     → { name: 'collect_date', entities: {} }
   • extractEntitiesFromClassification()
     → { localDate: '15 septiembre' }
   • flowEngine.execute(flow, flowState, entities)
     │
     ▼
9. flow-engine.ts → execute()
   • mergedEntities = { localDate: '15 septiembre' }
   • stateDef = flow.states['collect_date']
     → { required: ['localDate'], prompt: '¿Para qué día...?' }
   • findMissingEntities(['localDate'], mergedEntities)
     → [] (localDate está presente)
   • stateDef no tiene action
   • Transiciona a 'collect_service'
   • nextStateDef = flow.states['collect_service']
     → { required: ['serviceId'], prompt: '¿Qué servicio necesitas?...' }
   • findMissingEntities(['serviceId'], mergedEntities)
     → ['serviceId'] (falta serviceId)
   • Retorna:
     { nextState: { name: 'collect_service', entities: { localDate: '15 septiembre' } },
       action: 'ask',
       prompt: '¿Qué servicio necesitas? Tenemos: {services}',
       missingEntity: 'serviceId' }
   │
   ▼
10. orchestrator.ts → handleBookingFlow() (continuación)
    • result.action === 'ask' → sale del loop
    • generateFlowResponse(result, context)
      → Reemplaza {services} con lista de servicios de catalog.listServices()
      → "¿Qué servicio necesitas? Tenemos: Consulta general, Limpieza dental, Blanqueamiento..."
    • Retorna OrchestratorResult:
      { decision: classification,
        flowState: { name: 'collect_service', entities: { localDate: '15 septiembre' } },
        responseText: "¿Qué servicio necesitas? Tenemos: Consulta general, Limpieza dental, Blanqueamiento..." }
    │
    ▼
11. inbound-service.ts → processWithFlowEngine() (continuación)
    • updateConversationFlowState()
      → UPDATE whatsapp_conversations SET flow_state = {...}
    • sendAndPersist()
      → sendWhatsAppTextMessage({ to: event.fromPhone, body: responseText })
        → POST https://graph.facebook.com/v20.0/{phone-number-id}/messages
      → insertWhatsAppOutboundMessage()
        → INSERT INTO whatsapp_messages (direction: 'outbound', ...)
    • markInboundMessageProcessed({ status: 'responded' })
    • updateConversationSummary()
      → UPDATE whatsapp_conversations SET summary = '...'
    │
    ▼
12. Respuesta enviada al usuario:
    "¿Qué servicio necesitas? Tenemos: Consulta general, Limpieza dental, Blanqueamiento..."
```

## Resumen de Componentes Clave

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| **Webhook** | `app/api/whatsapp/webhook/route.ts` | Recibe eventos de Meta, verifica firma |
| **Inbound Service** | `src/lib/whatsapp/inbound-service.ts` | Orquesta procesamiento, routing Flow Engine vs Legacy |
| **Orchestrator** | `src/lib/whatsapp/orchestrator.ts` | Clasifica intent, routing a handlers, ejecuta Flow Engine |
| **Flow Engine** | `src/lib/flows/flow-engine.ts` | Motor determinístico de flujos conversacionales |
| **Flow Definitions** | `src/lib/flows/definitions/*.flow.ts` | Configuración declarativa de flujos |
| **Intent Classifier** | `src/lib/ai/whatsapp-intent-classifier.ts` | Clasificación simple sin LLM (regex) |
| **LLM Provider** | `src/lib/ai/whatsapp-llm-provider.ts` | Integración con LLM (Legacy) |
| **Booking Service** | `src/lib/booking/*.ts` | Lógica de negocio: disponibilidad, reserva, catálogo |
| **Store** | `src/lib/whatsapp/store.ts` | Persistencia en Supabase |
| **Client** | `src/lib/whatsapp/client.ts` | Envío de mensajes vía Graph API |
| **Normalize** | `src/lib/whatsapp/normalize.ts` | Normalización de payloads de Meta |
| **Observability** | `src/lib/observability/whatsapp-ai.ts` | Logging y métricas |

## Feature Flags

```bash
WHATSAPP_FLOW_ENGINE_ENABLED=true   # Activa Flow Engine (determinístico)
                                    # false o no definido = Legacy (LLM)
```

## Variables de Entorno

```bash
# Meta WhatsApp
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_HUMAN_ALERT_PHONE=

# LLM (Legacy)
WHATSAPP_AGENT_LLM_API_KEY=
WHATSAPP_AGENT_LLM_MODEL=
WHATSAPP_AGENT_LLM_BASE_URL=
WHATSAPP_AGENT_LLM_API_STYLE=

# Feature Flags
WHATSAPP_FLOW_ENGINE_ENABLED=true
```

## Referencias Relacionadas

- **Flow Engine**: `docs/flow-engine.md`
- **Spec Flow Engine**: `openspec/specs/flow-engine/spec.md`
- **Spec WhatsApp**: `openspec/specs/whatsapp-inbound-automation/spec.md`
- **Architecture**: `architecture.md` sección 8
