import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WhatsAppStore } from '../store';

vi.mock('@/lib/booking/patient-resolution', () => ({ resolvePatient: vi.fn() }));
vi.mock('@/lib/booking/booking', () => ({ bookAppointment: vi.fn() }));
vi.mock('@/lib/booking/catalog', () => ({
  listServices: vi.fn().mockResolvedValue([{ id: 'service-1', name: 'Limpieza dental' }]),
  listProviders: vi.fn().mockResolvedValue([{ id: 'provider-1', name: 'Dra. Ana' }]),
  resolveProviderByName: vi.fn(),
  resolveServiceByName: vi.fn(),
}));
vi.mock('@/lib/observability/whatsapp-ai', () => ({
  createWhatsAppAiCorrelationContext: vi.fn(() => ({})),
  recordWhatsAppAiEvent: vi.fn(),
}));
vi.mock('@/lib/citas/reminder-reply-flag', () => ({
  isReminderReplyEnabled: vi.fn(),
}));
vi.mock('@/lib/citas/reminder-reply-service', () => ({
  handleReminderReply: vi.fn(),
}));
vi.mock('@/lib/whatsapp/orchestrator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/whatsapp/orchestrator')>();
  return { ...actual, orchestrate: vi.fn() };
});

import { isReminderReplyEnabled } from '@/lib/citas/reminder-reply-flag';
import { handleReminderReply } from '@/lib/citas/reminder-reply-service';
import { orchestrate } from '@/lib/whatsapp/orchestrator';
import type { NormalizedWhatsAppInboundEvent } from '../normalize';
import { processWhatsAppInboundEvent, type WhatsAppInboundServiceOptions } from '../inbound-service';

const FLOW_ENGINE_ENV = 'WHATSAPP_FLOW_ENGINE_ENABLED';

const CONFIRMATION_ACK = '¡Listo! Tu cita quedó confirmada para el lunes a las 10:00.';

function textEvent(overrides: Partial<NormalizedWhatsAppInboundEvent> = {}): NormalizedWhatsAppInboundEvent {
  return {
    providerMessageId: 'wamid-1',
    fromPhone: '+5215512345678',
    profileName: 'Paciente Prueba',
    messageType: 'text',
    body: '1',
    occurredAt: '2026-09-05T12:00:00.000Z',
    rawMessage: {},
    rawValue: {},
    ...overrides,
  } as NormalizedWhatsAppInboundEvent;
}

const orchestrateResult = {
  decision: {
    intent: 'inquiry',
    summary: 'Consulta general',
    confidence: 1,
    decision: 'auto_answer',
    responseText: 'Respuesta del orquestador',
    citedKnowledgeIds: [],
    citedToolCallIds: [],
  },
  responseText: 'Respuesta del orquestador',
  needsHuman: false,
  booked: false,
} as unknown as Awaited<ReturnType<typeof orchestrate>>;

function createStore(overrides: Record<string, unknown> = {}): WhatsAppStore {
  return {
    persistInboundEvent: vi.fn().mockResolvedValue({ inserted: true, contactId: 'contact-1', conversationId: 'conversation-1', messageId: 'message-1' }),
    loadConversationContext: vi.fn().mockResolvedValue({ bookingContext: null, lastIntent: null, summary: null, flowState: null }),
    loadConversationHistory: vi.fn().mockResolvedValue([]),
    createIntent: vi.fn().mockResolvedValue({ id: 'intent-1' }),
    insertOutboundMessage: vi.fn().mockResolvedValue(undefined),
    createEscalation: vi.fn(),
    createCrmSyncEvent: vi.fn(),
    updateConversationStatus: vi.fn().mockResolvedValue(undefined),
    markInboundMessageProcessed: vi.fn().mockResolvedValue(undefined),
    persistStatusEvents: vi.fn(),
    updateConversationSummary: vi.fn().mockResolvedValue(undefined),
    updateConversationFlowState: vi.fn().mockResolvedValue(undefined),
    linkWhatsAppContactToPatient: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as WhatsAppStore;
}

function makeSendText() {
  return vi.fn().mockResolvedValue({ ok: true, skipped: true, status: 0 });
}

async function run(options: {
  event?: NormalizedWhatsAppInboundEvent;
  store?: WhatsAppStore;
  overrides?: WhatsAppInboundServiceOptions;
} = {}) {
  const store = options.store ?? createStore();
  const sendText = makeSendText();
  const result = await processWhatsAppInboundEvent(options.event ?? textEvent(), {
    store,
    sendText,
    ...options.overrides,
  });
  return { store, sendText, result };
}

/**
 * Fase 3.5 — el gancho de respuesta a recordatorio en `processWhatsAppInboundEvent`
 * (design.md decisión 2). Un solo punto de inserción después de
 * `loadConversationContext`/`loadConversationHistory` y antes del branch de flow
 * engine. Precedencia: flag → texto → body → sesión de flujo activa.
 */
describe('processWhatsAppInboundEvent — gancho de respuesta a recordatorio', () => {
  beforeEach(() => {
    vi.stubEnv(FLOW_ENGINE_ENV, 'true');
    vi.mocked(isReminderReplyEnabled).mockReturnValue(true);
    vi.mocked(orchestrate).mockResolvedValue(orchestrateResult);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('con el flag apagado no evalúa el gancho y el pipeline sigue intacto', async () => {
    vi.mocked(isReminderReplyEnabled).mockReturnValue(false);

    const { result } = await run();

    expect(handleReminderReply).not.toHaveBeenCalled();
    expect(orchestrate).toHaveBeenCalledTimes(1);
    expect(result.action).toBe('auto_answer');
  });

  it('con una sesión de flow engine activa no hay transición ni escalación y el flujo continúa (aceptación #87)', async () => {
    const store = createStore({
      loadConversationContext: vi.fn().mockResolvedValue({
        bookingContext: null,
        lastIntent: 'book_appointment',
        summary: null,
        flowState: { name: 'collect_date', entities: {}, lastActivity: new Date().toISOString() },
      }),
    });

    const { result } = await run({ store });

    expect(handleReminderReply).not.toHaveBeenCalled();
    expect(orchestrate).toHaveBeenCalledTimes(1);
    expect(store.markInboundMessageProcessed).toHaveBeenCalledWith({ messageId: 'message-1', status: 'responded' });
    expect(result.action).toBe('auto_answer');
  });

  it('con `handled: true` corto-circuita: responde el acuse y no llama al orquestador', async () => {
    vi.mocked(handleReminderReply).mockResolvedValue({
      handled: true,
      outcome: 'confirmation',
      responseText: CONFIRMATION_ACK,
      needsHuman: false,
    });

    const { store, sendText, result } = await run();

    expect(handleReminderReply).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+5215512345678', message: '1', providerMessageId: 'wamid-1' })
    );
    expect(orchestrate).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ to: '+5215512345678', body: CONFIRMATION_ACK }));
    expect(store.insertOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: CONFIRMATION_ACK, purpose: 'auto_answer' })
    );
    expect(store.markInboundMessageProcessed).toHaveBeenCalledWith({ messageId: 'message-1', status: 'responded' });
    expect(store.updateConversationSummary).toHaveBeenCalledTimes(1);
    expect(result.action).toBe('auto_answer');
    expect(result.decision?.responseText).toBe(CONFIRMATION_ACK);
  });

  it('con `handled: true` y `needsHuman` marca el mensaje como escalado', async () => {
    vi.mocked(handleReminderReply).mockResolvedValue({
      handled: true,
      outcome: 'cancellation',
      responseText: 'Entendido, cancelamos tu cita.',
      needsHuman: true,
    });

    const { store, sendText, result } = await run();

    expect(orchestrate).not.toHaveBeenCalled();
    expect(store.insertOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'customer_escalation' })
    );
    expect(store.markInboundMessageProcessed).toHaveBeenCalledWith({ messageId: 'message-1', status: 'escalated' });
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(result.action).toBe('needs_human');
  });

  it('con `handled: false` deja el mensaje al pipeline normal sin corto-circuito', async () => {
    vi.mocked(handleReminderReply).mockResolvedValue({
      handled: false,
      outcome: 'none',
      responseText: '',
      needsHuman: false,
    });

    const { result } = await run();

    expect(handleReminderReply).toHaveBeenCalledTimes(1);
    expect(orchestrate).toHaveBeenCalledTimes(1);
    expect(result.decision?.responseText).toBe('Respuesta del orquestador');
  });

  it('reconoce la respuesta en el path legacy con el flow engine apagado', async () => {
    vi.stubEnv(FLOW_ENGINE_ENV, 'false');
    vi.mocked(handleReminderReply).mockResolvedValue({
      handled: true,
      outcome: 'confirmation',
      responseText: CONFIRMATION_ACK,
      needsHuman: false,
    });
    const agent = vi.fn();

    const { sendText, result } = await run({ overrides: { agent } });

    expect(agent).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ body: CONFIRMATION_ACK }));
    expect(result.action).toBe('auto_answer');
  });

  it('un duplicado por ledger no repite transición ni acuse', async () => {
    const store = createStore({
      persistInboundEvent: vi.fn().mockResolvedValue({ inserted: false, contactId: 'contact-1', conversationId: 'conversation-1', messageId: 'message-1' }),
    });

    const { sendText, result } = await run({ store });

    expect(handleReminderReply).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(orchestrate).not.toHaveBeenCalled();
    expect(result.action).toBe('duplicate_skipped');
  });

  it('un mensaje no-texto no entra al gancho y sigue el pipeline', async () => {
    const { result } = await run({ event: textEvent({ messageType: 'image', body: undefined }) });

    expect(handleReminderReply).not.toHaveBeenCalled();
    expect(orchestrate).toHaveBeenCalledTimes(1);
    expect(result.action).toBe('auto_answer');
  });

  it('una sesión expirada no bloquea y sí aplica el manejo', async () => {
    const store = createStore({
      loadConversationContext: vi.fn().mockResolvedValue({
        bookingContext: null,
        lastIntent: null,
        summary: null,
        flowState: {
          name: 'collect_date',
          entities: {},
          lastActivity: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
        },
      }),
    });
    vi.mocked(handleReminderReply).mockResolvedValue({
      handled: true,
      outcome: 'confirmation',
      responseText: CONFIRMATION_ACK,
      needsHuman: false,
    });

    const { result } = await run({ store });

    expect(handleReminderReply).toHaveBeenCalledTimes(1);
    expect(result.action).toBe('auto_answer');
  });

  it('con el flag apagado una confirmación elegible llega al pipeline normal (regresión)', async () => {
    vi.stubEnv(FLOW_ENGINE_ENV, 'false');
    vi.mocked(isReminderReplyEnabled).mockReturnValue(false);
    const agent = vi.fn().mockResolvedValue({
      intent: 'inquiry',
      summary: 'Consulta',
      confidence: 1,
      decision: 'auto_answer',
      responseText: 'Respuesta legacy',
      citedKnowledgeIds: [],
      citedToolCallIds: [],
    });

    await run({ overrides: { agent } });

    expect(handleReminderReply).not.toHaveBeenCalled();
    expect(agent).toHaveBeenCalledTimes(1);
    expect(agent.mock.calls[0][0]).toMatchObject({ messageText: '1' });
  });

  it('una sesión `complete` no bloquea y sí aplica el manejo', async () => {
    const store = createStore({
      loadConversationContext: vi.fn().mockResolvedValue({
        bookingContext: null,
        lastIntent: null,
        summary: null,
        flowState: { name: 'complete', entities: {}, lastActivity: new Date().toISOString() },
      }),
    });
    vi.mocked(handleReminderReply).mockResolvedValue({
      handled: true,
      outcome: 'confirmation',
      responseText: CONFIRMATION_ACK,
      needsHuman: false,
    });

    const { result } = await run({ store });

    expect(handleReminderReply).toHaveBeenCalledTimes(1);
    expect(result.action).toBe('auto_answer');
  });
});
