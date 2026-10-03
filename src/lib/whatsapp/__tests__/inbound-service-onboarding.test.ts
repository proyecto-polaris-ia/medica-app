import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowState } from '@/lib/flows/types';
import type { WhatsAppStore } from '../store';

vi.mock('@/lib/observability/whatsapp-ai', () => ({
  createWhatsAppAiCorrelationContext: vi.fn(() => ({})),
  recordWhatsAppAiEvent: vi.fn(),
}));
vi.mock('@/lib/whatsapp/onboarding-flag', () => ({
  isOnboardingEnabled: vi.fn(() => false),
  isOnboardingNudgeEnabled: vi.fn(() => false),
}));
vi.mock('@/lib/whatsapp/onboarding-context', () => ({
  loadOnboardingStartContext: vi.fn().mockResolvedValue(null),
  hasFutureScheduledAppointment: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/admin/medical-history', () => ({
  upsertMedicalHistory: vi.fn(),
  getMedicalHistory: vi.fn(),
}));
vi.mock('@/lib/booking/catalog', () => ({
  listServices: vi.fn().mockResolvedValue([]),
  listProviders: vi.fn().mockResolvedValue([]),
  resolveProviderByName: vi.fn(),
  resolveServiceByName: vi.fn(),
}));
vi.mock('@/lib/booking/availability', () => ({ getFreeSlots: vi.fn() }));
vi.mock('@/lib/booking/booking', () => ({ bookAppointment: vi.fn() }));
vi.mock('@/lib/booking/patient-resolution', () => ({ resolvePatient: vi.fn() }));

import { upsertMedicalHistory } from '@/lib/admin/medical-history';
import { processWhatsAppInboundEvent } from '../inbound-service';

const PHONE = '+5215512345678';
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';

const ONBOARDING_FLOW: FlowState = {
  name: 'ask_conditions',
  entities: {},
  flowName: 'onboarding',
  lastActivity: new Date().toISOString(),
  metadata: {
    onboarding: {
      context: {
        patientId: PATIENT_ID,
        phone: PHONE,
        patientName: 'Ana López',
        sex: 'female',
        missingEmail: false,
      },
      allergies: ['penicilina'],
      medications: null,
      conditions: null,
      pregnancyStatus: null,
      smoking: null,
      alcohol: null,
      email: null,
    },
  },
};

function makeStore(initialFlowState: FlowState | null) {
  const state: { flowState: FlowState | null } = { flowState: initialFlowState };
  const mocks = {
    persistInboundEvent: vi.fn().mockResolvedValue({
      inserted: true,
      contactId: 'contact-1',
      conversationId: 'conversation-1',
      messageId: 'message-1',
    }),
    linkWhatsAppContactToPatient: vi.fn().mockResolvedValue(undefined),
    loadConversationContext: vi.fn(async () => ({
      bookingContext: null,
      lastIntent: null,
      summary: null,
      flowState: state.flowState,
    })),
    loadConversationHistory: vi.fn().mockResolvedValue([]),
    createIntent: vi.fn().mockResolvedValue({ id: 'intent-1' }),
    insertOutboundMessage: vi.fn().mockResolvedValue(undefined),
    createEscalation: vi.fn(),
    createCrmSyncEvent: vi.fn(),
    updateConversationStatus: vi.fn().mockResolvedValue(undefined),
    markInboundMessageProcessed: vi.fn().mockResolvedValue(undefined),
    persistStatusEvents: vi.fn(),
    updateConversationSummary: vi.fn().mockResolvedValue(undefined),
    updateConversationFlowState: vi.fn(async ({ flowState }: { flowState: FlowState | null }) => {
      state.flowState = flowState;
    }),
  };
  return { store: mocks as unknown as WhatsAppStore, mocks, state };
}

function event(body: string) {
  return {
    providerMessageId: `wamid-${body}`,
    fromPhone: PHONE,
    profileName: 'Ana López',
    messageType: 'text',
    body,
    occurredAt: '2026-10-05T13:00:00.000Z',
    rawMessage: {},
    rawValue: {},
  };
}

describe('processWhatsAppInboundEvent — urgencia durante onboarding', () => {
  beforeEach(() => {
    process.env.WHATSAPP_FLOW_ENGINE_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.WHATSAPP_FLOW_ENGINE_ENABLED;
  });

  it('escala, limpia el flow_state, crea la escalación por el port y no escribe', async () => {
    const { store, mocks } = makeStore(ONBOARDING_FLOW);
    const sendText = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const createEscalation = vi.fn().mockResolvedValue({ escalationId: 'esc-1' });

    const result = await processWhatsAppInboundEvent(
      event('tengo dolor fuerte e hinchazón'),
      { store, sendText, createEscalation, humanAlertPhone: '+5215599999999' }
    );

    expect(result.action).toBe('needs_human');
    expect(mocks.updateConversationFlowState).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      flowState: null,
    });
    expect(createEscalation).toHaveBeenCalledTimes(1);
    expect(createEscalation).toHaveBeenCalledWith(
      expect.objectContaining({ patientPhone: PHONE })
    );
    expect(mocks.updateConversationStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'escalated' })
    );
    expect(mocks.markInboundMessageProcessed).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'escalated' })
    );
    // Solo la respuesta al paciente: la alerta humana la maneja el port.
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0].to).toBe(PHONE);
    expect(upsertMedicalHistory).not.toHaveBeenCalled();
  });

  it('un mensaje posterior con el estado ya limpio no continúa el onboarding ni escribe', async () => {
    const { store, mocks } = makeStore(ONBOARDING_FLOW);
    const sendText = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const createEscalation = vi.fn().mockResolvedValue({ escalationId: 'esc-1' });

    await processWhatsAppInboundEvent(event('tengo dolor fuerte'), {
      store,
      sendText,
      createEscalation,
    });

    const second = await processWhatsAppInboundEvent(event('sí'), {
      store,
      sendText,
      createEscalation,
    });

    expect(upsertMedicalHistory).not.toHaveBeenCalled();
    expect(second.action).not.toBe('needs_human');
    expect(mocks.updateConversationFlowState).toHaveBeenCalledTimes(1);
    expect(createEscalation).toHaveBeenCalledTimes(1);
  });
});
