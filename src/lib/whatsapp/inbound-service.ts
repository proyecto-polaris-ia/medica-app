import { bookAppointment } from '@/lib/booking/booking';
import { getFreeSlots } from '@/lib/booking/availability';
import { findNextAvailable } from '@/lib/booking/next-available';
import { resolvePatient } from '@/lib/booking/patient-resolution';
import { listProviders, listServices } from '@/lib/booking/catalog';
import {
  decideWhatsAppInboundMessage,
  type WhatsAppDynamicToolResult,
  type WhatsAppInboundAgentDecision,
  type WhatsAppInboundAgentProvider,
  type WhatsAppKnowledgeEntry,
  type WhatsAppToolAction,
} from '@/lib/ai/whatsapp-inbound-agent';
import { createWhatsAppAiCorrelationContext, recordWhatsAppAiEvent, type WhatsAppAiCorrelationContext } from '@/lib/observability/whatsapp-ai';
import { buildWhatsAppEscalationWork } from './escalation';
import { sendWhatsAppTextMessage, type WhatsAppSendResult } from './client';
import { normalizeWhatsAppWebhookPayloadBundle, type NormalizedWhatsAppInboundEvent } from './normalize';
import {
  createCrmSyncEvent,
  createWhatsAppEscalation,
  insertWhatsAppOutboundMessage,
  loadWhatsAppConversationContext,
  markWhatsAppInboundMessageProcessed,
  persistWhatsAppInboundEvent,
  persistWhatsAppStatusEvents,
  updateWhatsAppConversationStatus,
  type JsonPayload,
  type PersistedWhatsAppInboundEvent,
  type WhatsAppStatusPersistenceResult,
  type WhatsAppStore,
} from './store';

export type WhatsAppInboundServiceResult = { received: number; processed: number; duplicates: number; autoAnswered: number; booked: number; escalated: number; sendFailures: number; events: WhatsAppInboundEventResult[] };
export type WhatsAppWebhookProcessingResult = WhatsAppInboundServiceResult & { statusCallbacks: WhatsAppStatusPersistenceResult };
export type WhatsAppInboundEventResult = { providerMessageId: string; action: 'duplicate_skipped' | 'auto_answer' | 'tool_action' | 'needs_human' | 'unsupported_escalated'; decision?: WhatsAppInboundAgentDecision; customerSend?: WhatsAppSendResult; humanAlertSend?: WhatsAppSendResult };

export type WhatsAppInboundServiceOptions = {
  store?: WhatsAppStore;
  agent?: typeof decideWhatsAppInboundMessage;
  agentProvider?: WhatsAppInboundAgentProvider;
  knowledgeEntries?: WhatsAppKnowledgeEntry[];
  sendText?: typeof sendWhatsAppTextMessage;
  humanAlertPhone?: string;
  observabilityContext?: WhatsAppAiCorrelationContext;
};

const defaultStore: WhatsAppStore = {
  persistInboundEvent: persistWhatsAppInboundEvent,
  loadConversationContext: loadWhatsAppConversationContext,
  createIntent: async (input) => {
    const { createWhatsAppIntent } = await import('./store');
    return createWhatsAppIntent(input);
  },
  insertOutboundMessage: insertWhatsAppOutboundMessage,
  createEscalation: createWhatsAppEscalation,
  createCrmSyncEvent,
  updateConversationStatus: updateWhatsAppConversationStatus,
  markInboundMessageProcessed: markWhatsAppInboundMessageProcessed,
  persistStatusEvents: persistWhatsAppStatusEvents,
};

function unsupportedDecision(event: NormalizedWhatsAppInboundEvent): WhatsAppInboundAgentDecision {
  return { intent: 'handoff', summary: `Mensaje ${event.messageType} recibido por WhatsApp`, confidence: 1, decision: 'needs_human', escalationReason: 'El mensaje no es texto y requiere revisión humana.', responseText: 'Gracias por escribirnos. Por ahora solo puedo procesar mensajes de texto; una persona del consultorio revisará tu mensaje y te dará seguimiento.', citedKnowledgeIds: [], citedToolCallIds: [] };
}

function serializeSlot(slot: { start_at: Date; end_at: Date }) {
  return { startAt: slot.start_at.toISOString(), endAt: slot.end_at.toISOString() };
}

function formatSlot(slot: { start_at: Date; end_at: Date }) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(slot.start_at);
}

function parseLocalDate(value?: string) {
  if (!value) return new Date();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-06:00` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function readCandidate(context: Record<string, unknown> | null | undefined, index: number) {
  const candidates = Array.isArray(context?.candidates) ? context.candidates : [];
  const candidate = candidates[index];
  if (!candidate || typeof candidate !== 'object') return null;
  const row = candidate as Record<string, unknown>;
  if (typeof row.startAt !== 'string' || typeof row.endAt !== 'string') return null;
  return { startAt: row.startAt, endAt: row.endAt, providerId: typeof row.providerId === 'string' ? row.providerId : undefined, serviceId: typeof row.serviceId === 'string' ? row.serviceId : undefined };
}

async function defaultBookingContext() {
  const [services, providers] = await Promise.all([listServices(), listProviders()]);
  return { services, providers };
}

async function runBookingTool(action: WhatsAppToolAction, event: NormalizedWhatsAppInboundEvent, context: Record<string, unknown> | null | undefined): Promise<{ responseText: string; bookingContext: JsonPayload | null; toolResults: WhatsAppDynamicToolResult[]; booked: boolean }> {
  const priorServiceId = typeof context?.serviceId === 'string' ? context.serviceId : undefined;
  const priorProviderId = typeof context?.providerId === 'string' ? context.providerId : undefined;
  const selected = typeof action.args.selectedCandidateIndex === 'number' ? readCandidate(context, action.args.selectedCandidateIndex) : null;
  const serviceId = action.args.serviceId ?? selected?.serviceId ?? priorServiceId;
  const providerId = action.args.providerId ?? selected?.providerId ?? priorProviderId;

  if (!serviceId || !providerId) {
    const catalog = await defaultBookingContext();
    return { responseText: 'Claro, te ayudo a revisar disponibilidad. Por favor indícame el servicio y el doctor con el que quieres agendar.', bookingContext: { ...context, ...catalog, step: 'needs_booking_details' }, toolResults: [{ id: 'booking:catalog', tool: 'booking_catalog', status: 'blocked', reason: 'Faltan serviceId o providerId.' }], booked: false };
  }

  if (action.name === 'book_appointment') {
    const startAt = new Date(action.args.startAt ?? selected?.startAt ?? '');
    const endAt = new Date(action.args.endAt ?? selected?.endAt ?? '');
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return { responseText: 'Ya tengo el contexto de la cita, pero necesito que me confirmes cuál horario deseas reservar.', bookingContext: { ...context, serviceId, providerId, step: 'selecting_slot' }, toolResults: [{ id: 'booking:missing_slot', tool: 'book_appointment', status: 'blocked', reason: 'Falta horario seleccionado.' }], booked: false };
    }
    const patient = await resolvePatient({ phone: event.fromPhone, fullName: action.args.fullName ?? event.profileName });
    const result = await bookAppointment({ patientId: patient.id, serviceId, providerId, startAt, endAt });
    if ('type' in result) {
      const next = await findNextAvailable({ providerId, serviceId, after: startAt });
      return { responseText: next ? `Ese horario ya no está disponible. La siguiente opción que encontré es ${formatSlot(next)}. ¿Quieres que la reserve?` : 'Ese horario ya no está disponible y no encontré otra opción cercana. Una persona del consultorio te dará seguimiento.', bookingContext: next ? { serviceId, providerId, candidates: [{ ...serializeSlot(next), serviceId, providerId }], step: 'selecting_slot' } : null, toolResults: [{ id: 'booking:conflict', tool: 'book_appointment', status: 'blocked', reason: result.message }], booked: false };
    }
    return { responseText: `Tu cita quedó solicitada para ${formatSlot({ start_at: startAt, end_at: endAt })}. Gracias por contactarnos.`, bookingContext: null, toolResults: [{ id: 'booking:created', tool: 'book_appointment', status: 'success', data: { patientId: patient.id, startAt: startAt.toISOString(), endAt: endAt.toISOString() } }], booked: true };
  }

  const slots = await getFreeSlots({ providerId, serviceId, localDate: parseLocalDate(action.args.localDate) });
  const candidates = slots.slice(0, 3).map((slot) => ({ ...serializeSlot(slot), serviceId, providerId }));
  if (!candidates.length) {
    const next = await findNextAvailable({ providerId, serviceId, after: parseLocalDate(action.args.localDate) });
    if (!next) return { responseText: 'No encontré horarios disponibles cercanos. Una persona del consultorio te dará seguimiento.', bookingContext: null, toolResults: [{ id: 'booking:no_slots', tool: 'check_availability', status: 'not_found' }], booked: false };
    candidates.push({ ...serializeSlot(next), serviceId, providerId });
  }
  const options = candidates.map((slot, index) => `${index + 1}) ${formatSlot({ start_at: new Date(slot.startAt), end_at: new Date(slot.endAt) })}`).join('\n');
  return { responseText: `Tengo estas opciones disponibles:\n${options}\nResponde con el número de la opción que prefieras para solicitar la cita.`, bookingContext: { serviceId, providerId, candidates, step: 'selecting_slot' }, toolResults: candidates.map((slot, index) => ({ id: `booking:slot:${index + 1}`, tool: 'check_availability', status: 'success', data: slot })), booked: false };
}

async function sendAndPersist(input: { store: WhatsAppStore; persisted: PersistedWhatsAppInboundEvent; to: string; body: string; purpose: 'auto_answer' | 'customer_escalation' | 'human_alert' | 'booking'; sendText: typeof sendWhatsAppTextMessage }) {
  const sendResult = await input.sendText({ to: input.to, body: input.body });
  await input.store.insertOutboundMessage({ persisted: input.persisted, body: input.body, sendResult, purpose: input.purpose });
  recordWhatsAppAiEvent({ type: 'send.finished', outcome: sendResult.ok || sendResult.skipped ? 'success' : 'failure', diagnostics: { purpose: input.purpose, status: sendResult.status } });
  return sendResult;
}

export async function processWhatsAppInboundEvent(event: NormalizedWhatsAppInboundEvent, options: WhatsAppInboundServiceOptions = {}): Promise<WhatsAppInboundEventResult> {
  const store = options.store ?? defaultStore;
  const sendText = options.sendText ?? sendWhatsAppTextMessage;
  const persisted = await store.persistInboundEvent(event);
  recordWhatsAppAiEvent({ context: options.observabilityContext, type: 'persistence.finished', outcome: 'success', identifiers: { providerMessageId: event.providerMessageId } });
  if (!persisted.inserted) {
    recordWhatsAppAiEvent({ context: options.observabilityContext, type: 'duplicate.skipped', outcome: 'skipped', identifiers: { providerMessageId: event.providerMessageId } });
    return { providerMessageId: event.providerMessageId, action: 'duplicate_skipped' };
  }

  const conversation = await store.loadConversationContext(persisted.conversationId);
  const decision = event.messageType === 'text' && event.body ? await (options.agent ?? decideWhatsAppInboundMessage)({ messageText: event.body, contact: { id: persisted.contactId, phone: event.fromPhone, profileName: event.profileName }, conversation: { id: persisted.conversationId, bookingContext: conversation.bookingContext, lastIntent: conversation.lastIntent } }, { provider: options.agentProvider, knowledgeEntries: options.knowledgeEntries, observabilityContext: options.observabilityContext }) : unsupportedDecision(event);

  let finalDecision = decision;
  let action: WhatsAppInboundEventResult['action'] = decision.decision;
  let booked = false;

  if (decision.decision === 'tool_action' && decision.toolAction) {
    const tool = await runBookingTool(decision.toolAction, event, conversation.bookingContext);
    booked = tool.booked;
    finalDecision = { ...decision, responseText: tool.responseText, citedToolCallIds: tool.toolResults.map((result) => result.id), dynamicToolResults: tool.toolResults };
    await store.updateConversationStatus({ conversationId: persisted.conversationId, status: 'open', lastIntent: finalDecision.intent, bookingContext: tool.bookingContext });
  }

  const intent = await store.createIntent({ persisted, decision: finalDecision });
  recordWhatsAppAiEvent({ context: options.observabilityContext, type: 'ai.decision', outcome: 'success', diagnostics: { decision: finalDecision.decision, intent: finalDecision.intent } });

  if (finalDecision.decision === 'auto_answer' || finalDecision.decision === 'tool_action') {
    const body = finalDecision.responseText || 'Gracias por escribirnos. Una persona del consultorio dará seguimiento.';
    const customerSend = await sendAndPersist({ store, persisted, to: event.fromPhone, body, purpose: finalDecision.decision === 'tool_action' ? 'booking' : 'auto_answer', sendText });
    await store.markInboundMessageProcessed({ messageId: persisted.messageId, status: 'responded' });
    return { providerMessageId: event.providerMessageId, action, decision: finalDecision, customerSend };
  }

  const escalation = buildWhatsAppEscalationWork(event, finalDecision);
  await store.createEscalation({ persisted, intentId: intent.id, reason: escalation.reason, priority: escalation.priority, summary: escalation.summary });
  await store.updateConversationStatus({ conversationId: persisted.conversationId, status: 'escalated', lastIntent: finalDecision.intent, bookingContext: conversation.bookingContext ?? null });
  const customerSend = await sendAndPersist({ store, persisted, to: event.fromPhone, body: escalation.customerFollowUpText, purpose: 'customer_escalation', sendText });
  const humanPhone = options.humanAlertPhone ?? process.env.WHATSAPP_HUMAN_ALERT_PHONE;
  const humanAlertSend = humanPhone ? await sendAndPersist({ store, persisted, to: humanPhone, body: escalation.humanAlertText, purpose: 'human_alert', sendText }) : undefined;
  recordWhatsAppAiEvent({ context: options.observabilityContext, type: 'escalation.created', outcome: 'success' });
  await store.markInboundMessageProcessed({ messageId: persisted.messageId, status: 'escalated' });
  return { providerMessageId: event.providerMessageId, action: 'needs_human', decision: finalDecision, customerSend, humanAlertSend };
}

export async function processWhatsAppInboundEvents(events: NormalizedWhatsAppInboundEvent[], options: WhatsAppInboundServiceOptions = {}): Promise<WhatsAppInboundServiceResult> {
  const results: WhatsAppInboundEventResult[] = [];
  for (const event of events) {
    const context = createWhatsAppAiCorrelationContext({ ...options.observabilityContext, providerMessageId: event.providerMessageId });
    results.push(await processWhatsAppInboundEvent(event, { ...options, observabilityContext: context }));
  }
  return {
    received: events.length,
    processed: results.filter((r) => r.action !== 'duplicate_skipped').length,
    duplicates: results.filter((r) => r.action === 'duplicate_skipped').length,
    autoAnswered: results.filter((r) => r.action === 'auto_answer').length,
    booked: results.filter((r) => r.action === 'tool_action' && r.decision?.dynamicToolResults?.some((t) => t.id === 'booking:created')).length,
    escalated: results.filter((r) => r.action === 'needs_human' || r.action === 'unsupported_escalated').length,
    sendFailures: results.filter((r) => r.customerSend && !r.customerSend.ok && !r.customerSend.skipped).length,
    events: results,
  };
}

export async function processWhatsAppWebhookPayload(payload: unknown, options: WhatsAppInboundServiceOptions = {}): Promise<WhatsAppWebhookProcessingResult> {
  const bundle = normalizeWhatsAppWebhookPayloadBundle(payload);
  const store = options.store ?? defaultStore;
  const statusCallbacks = await store.persistStatusEvents(bundle.statusEvents);
  const inbound = await processWhatsAppInboundEvents(bundle.inboundEvents, options);
  return { ...inbound, statusCallbacks };
}
