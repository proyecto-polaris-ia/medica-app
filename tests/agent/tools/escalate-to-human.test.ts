// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createEveWhatsAppEscalation = vi.fn();

vi.mock('@/lib/whatsapp/eve-escalation', () => ({ createEveWhatsAppEscalation }));

const { default: tool } = await import('../../../agent/tools/escalate-to-human');
const execute = tool.execute as (input: {
  patientPhone?: string;
  trustedContactSource?: 'whatsapp';
  trustedPatientPhone?: string;
  reason: string;
  summary?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  patientMessage?: string;
}, ctx?: unknown) => Promise<unknown>;

describe('escalate-to-human tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createEveWhatsAppEscalation.mockResolvedValue({
      escalationId: 'esc-1',
      created: true,
      contactId: 'contact-1',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      humanAlertPhoneConfigured: true,
      humanAlertSend: { ok: true, status: 200 },
    });
  });

  it('uses the trusted WhatsApp sender phone to create an escalation', async () => {
    const result = await execute({
      patientPhone: '+521000000000',
      reason: 'Dolor fuerte',
      summary: 'Paciente reporta dolor fuerte',
      priority: 'urgent',
      patientMessage: 'Me duele mucho',
    }, { session: { auth: { current: { attributes: { trustedContactSource: 'whatsapp', trustedPatientPhone: '+527224999206' } } } } });

    expect(createEveWhatsAppEscalation).toHaveBeenCalledWith({
      patientPhone: '+527224999206',
      reason: 'Dolor fuerte',
      summary: 'Paciente reporta dolor fuerte',
      priority: 'urgent',
      patientMessage: 'Me duele mucho',
      intent: 'support',
    });
    expect(result).toMatchObject({
      success: true,
      escalation: { id: 'esc-1', status: 'open' },
      humanAlert: { configured: true, sent: true, skipped: false },
    });
  });

  it('refuses to create an escalation without a trusted WhatsApp phone', async () => {
    const result = await execute({ reason: 'Caso ambiguo' });

    expect(result).toEqual({
      success: false,
      error: 'No puedo crear una escalación segura sin un teléfono confiable de WhatsApp.',
    });
    expect(createEveWhatsAppEscalation).not.toHaveBeenCalled();
  });
});
