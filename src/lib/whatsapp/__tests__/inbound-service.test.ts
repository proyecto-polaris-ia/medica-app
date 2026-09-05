import { describe, expect, it, vi } from 'vitest';
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

import { bookAppointment } from '@/lib/booking/booking';
import { resolvePatient } from '@/lib/booking/patient-resolution';
import { processWhatsAppInboundEvent } from '../inbound-service';

describe('processWhatsAppInboundEvent', () => {
  it('creates and links a patient for a WhatsApp booking while nullable patient contacts do not trigger notifications', async () => {
    const linkContact = vi.fn().mockResolvedValue(undefined);
    const sendText = vi.fn().mockResolvedValue({ ok: true, skipped: true, status: 0 });
    const store = {
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
      linkWhatsAppContactToPatient: linkContact,
    } as unknown as WhatsAppStore & { linkWhatsAppContactToPatient: typeof linkContact };
    vi.mocked(resolvePatient).mockResolvedValue({ id: 'patient-1', full_name: 'Paciente sin correo' });
    vi.mocked(bookAppointment).mockResolvedValue({ ok: true });

    const result = await processWhatsAppInboundEvent({
      providerMessageId: 'wamid-1', fromPhone: '+5215512345678', profileName: 'Paciente sin correo', messageType: 'text', body: 'Quiero reservar', occurredAt: '2026-09-05T12:00:00.000Z', rawMessage: {}, rawValue: {},
    }, {
      store,
      sendText,
      agent: vi.fn().mockResolvedValue({
        intent: 'book_appointment', confidence: 1, summary: 'Reserva', decision: 'tool_action', responseText: '', citedKnowledgeIds: [], citedToolCallIds: [],
        toolAction: { name: 'book_appointment', args: { serviceId: 'service-1', providerId: 'provider-1', startAt: '2026-09-06T18:00:00.000Z', endAt: '2026-09-06T18:30:00.000Z' } },
      }),
    });

    expect(resolvePatient).toHaveBeenCalledWith({ phone: '+5215512345678', fullName: 'Paciente sin correo' });
    expect(linkContact).toHaveBeenCalledWith({ contactId: 'contact-1', patientId: 'patient-1' });
    expect(bookAppointment).toHaveBeenCalledWith(expect.objectContaining({ patientId: 'patient-1' }));
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(store.insertOutboundMessage).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'booking' }));
    expect(result).toMatchObject({ action: 'tool_action' });
  });
});
