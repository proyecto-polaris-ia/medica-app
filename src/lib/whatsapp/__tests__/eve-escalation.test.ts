import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistWhatsAppInboundEvent = vi.fn();
const createWhatsAppIntent = vi.fn();
const createWhatsAppEscalation = vi.fn();
const updateWhatsAppConversationStatus = vi.fn();
const markWhatsAppInboundMessageProcessed = vi.fn();
const insertWhatsAppOutboundMessage = vi.fn();
const sendWhatsAppTextMessage = vi.fn();
const from = vi.fn();
const select = vi.fn();
const eq = vi.fn();
const maybeSingle = vi.fn();

vi.mock('@/lib/whatsapp/store', () => ({
  persistWhatsAppInboundEvent,
  createWhatsAppIntent,
  createWhatsAppEscalation,
  updateWhatsAppConversationStatus,
  insertWhatsAppOutboundMessage,
  markWhatsAppInboundMessageProcessed,
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({ from }),
}));

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppTextMessage,
}));

const { createEveWhatsAppEscalation } = await import('../eve-escalation');

describe('createEveWhatsAppEscalation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({ data: null, error: null });
    eq.mockReturnValue({ maybeSingle });
    select.mockReturnValue({ eq });
    from.mockReturnValue({ select });
    persistWhatsAppInboundEvent.mockResolvedValue({
      inserted: true,
      contactId: 'contact-1',
      conversationId: 'conversation-1',
      messageId: 'message-1',
    });
    createWhatsAppIntent.mockResolvedValue({ id: 'intent-1' });
    createWhatsAppEscalation.mockResolvedValue({ id: 'escalation-1' });
    updateWhatsAppConversationStatus.mockResolvedValue(undefined);
    insertWhatsAppOutboundMessage.mockResolvedValue(undefined);
    sendWhatsAppTextMessage.mockResolvedValue({ ok: true, status: 200, providerMessageId: 'wamid.human-alert' });
    markWhatsAppInboundMessageProcessed.mockResolvedValue(undefined);
    delete process.env.WHATSAPP_HUMAN_ALERT_PHONE;
  });

  it('persists an Eve escalation through the existing WhatsApp tables', async () => {
    const result = await createEveWhatsAppEscalation({
      patientPhone: '+527224999206',
      profileName: 'Daniel Rodriguez',
      reason: 'El paciente reporta dolor fuerte',
      summary: 'Dolor fuerte en muela',
      patientMessage: 'Tengo dolor fuerte',
      occurredAt: '2026-09-13T02:00:00.000Z',
      idempotencyKey: 'wamid.test',
      humanAlertPhone: '+5215512345678',
    });

    expect(persistWhatsAppInboundEvent).toHaveBeenCalledWith(expect.objectContaining({
      providerMessageId: 'eve:escalation:wamid.test',
      fromPhone: '+527224999206',
      body: 'Tengo dolor fuerte',
    }));
    expect(createWhatsAppIntent).toHaveBeenCalledWith(expect.objectContaining({
      persisted: expect.objectContaining({ messageId: 'message-1' }),
      decision: expect.objectContaining({ intent: 'support', summary: 'Dolor fuerte en muela' }),
    }));
    expect(createWhatsAppEscalation).toHaveBeenCalledWith({
      persisted: expect.objectContaining({ messageId: 'message-1' }),
      intentId: 'intent-1',
      reason: 'El paciente reporta dolor fuerte',
      priority: 'urgent',
      summary: 'Dolor fuerte en muela',
    });
    expect(updateWhatsAppConversationStatus).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      status: 'escalated',
      lastIntent: 'support',
    });
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith({
      to: '+5215512345678',
      body: expect.stringContaining('Escalación WhatsApp (urgent)'),
    });
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining('Teléfono: +527224999206'),
    }));
    expect(insertWhatsAppOutboundMessage).toHaveBeenCalledWith({
      persisted: expect.objectContaining({ messageId: 'message-1' }),
      body: expect.stringContaining('Daniel Rodriguez'),
      sendResult: { ok: true, status: 200, providerMessageId: 'wamid.human-alert' },
      purpose: 'human_alert',
    });
    expect(markWhatsAppInboundMessageProcessed).toHaveBeenCalledWith({
      messageId: 'message-1',
      status: 'escalated',
    });
    expect(result).toEqual({
      escalationId: 'escalation-1',
      created: true,
      contactId: 'contact-1',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      humanAlertSend: { ok: true, status: 200, providerMessageId: 'wamid.human-alert' },
      humanAlertPhoneConfigured: true,
    });
  });

  it('reuses an existing escalation for the same persisted message', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'existing-escalation' }, error: null });

    const result = await createEveWhatsAppEscalation({
      patientPhone: '+527224999206',
      reason: 'Escalar',
      idempotencyKey: 'same-message',
    });

    expect(createWhatsAppIntent).not.toHaveBeenCalled();
    expect(createWhatsAppEscalation).not.toHaveBeenCalled();
    expect(sendWhatsAppTextMessage).not.toHaveBeenCalled();
    expect(insertWhatsAppOutboundMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ escalationId: 'existing-escalation', created: false });
  });

  it('creates the escalation without sending a human alert when no alert phone is configured', async () => {
    const result = await createEveWhatsAppEscalation({
      patientPhone: '+527224999206',
      reason: 'Escalar por caso ambiguo',
      summary: 'Caso ambiguo',
      idempotencyKey: 'no-alert-phone',
    });

    expect(sendWhatsAppTextMessage).not.toHaveBeenCalled();
    expect(insertWhatsAppOutboundMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      escalationId: 'escalation-1',
      created: true,
      humanAlertPhoneConfigured: false,
      humanAlertSend: undefined,
    });
  });

});
