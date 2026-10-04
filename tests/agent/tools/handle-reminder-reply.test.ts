// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleReminderReply = vi.fn();
const isReminderReplyEnabled = vi.fn();

vi.mock('@/lib/citas/reminder-reply-service', () => ({ handleReminderReply }));
vi.mock('@/lib/citas/reminder-reply-flag', () => ({ isReminderReplyEnabled }));

const { default: tool } = await import('../../../agent/tools/handle-reminder-reply');
const execute = tool.execute as (input: {
  message: string;
  providerMessageId?: string;
  trustedContactSource?: 'whatsapp';
  trustedPatientPhone?: string;
}, ctx?: unknown) => Promise<unknown>;

const trustedCtx = (phone: string) => ({
  session: {
    auth: {
      current: { attributes: { trustedContactSource: 'whatsapp', trustedPatientPhone: phone } },
    },
  },
});

describe('handle-reminder-reply tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isReminderReplyEnabled.mockReturnValue(true);
    handleReminderReply.mockResolvedValue({
      handled: true,
      outcome: 'confirmation',
      responseText: 'Tu cita del martes 10:00 quedó confirmada.',
      needsHuman: false,
    });
  });

  it('refuses to run without a trusted WhatsApp phone and never calls the service', async () => {
    const result = await execute({ message: 'sí' });

    expect(result).toEqual({
      success: false,
      error: 'No puedo procesar la respuesta al recordatorio sin un teléfono confiable de WhatsApp.',
    });
    expect(handleReminderReply).not.toHaveBeenCalled();
  });

  it('returns handled: false when the reminder reply flag is disabled', async () => {
    isReminderReplyEnabled.mockReturnValue(false);

    const result = await execute({ message: 'sí' }, trustedCtx('+527224999206'));

    expect(result).toMatchObject({
      success: true,
      handled: false,
      outcome: 'none',
      responseText: '',
      needsHuman: false,
    });
    expect(handleReminderReply).not.toHaveBeenCalled();
  });

  it('passes through handled, outcome, responseText and needsHuman from the service', async () => {
    const result = await execute({ message: 'sí' }, trustedCtx('+527224999206'));

    expect(handleReminderReply).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      handled: true,
      outcome: 'confirmation',
      responseText: 'Tu cita del martes 10:00 quedó confirmada.',
      needsHuman: false,
    });
  });

  it('passes through an ambiguous outcome with needsHuman: true', async () => {
    handleReminderReply.mockResolvedValue({
      handled: true,
      outcome: 'ambiguous',
      responseText: 'Entiendo, un humano te dará seguimiento.',
      needsHuman: true,
    });

    const result = await execute({ message: 'sí, pero me duele' }, trustedCtx('+527224999206'));

    expect(result).toEqual({
      success: true,
      handled: true,
      outcome: 'ambiguous',
      responseText: 'Entiendo, un humano te dará seguimiento.',
      needsHuman: true,
    });
  });

  it('uses the trusted passthrough phone only when the context has none', async () => {
    const result = await execute({
      message: 'confirmo',
      trustedContactSource: 'whatsapp',
      trustedPatientPhone: '+527224999206',
    });

    expect(result).toMatchObject({ success: true, handled: true });
    expect(handleReminderReply).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+527224999206' }),
    );
  });

  it('surfaces service errors as success: false without throwing', async () => {
    handleReminderReply.mockRejectedValue(new Error('supabase down'));

    const result = await execute({ message: 'confirmo' }, trustedCtx('+527224999206'));

    expect(result).toEqual({ success: false, error: 'supabase down' });
  });

  it('synthesizes a stable providerMessageId for identical phone and message', async () => {
    await execute({ message: 'sí' }, trustedCtx('+527224999206'));
    await execute({ message: 'sí' }, trustedCtx('+527224999206'));

    const [first, second] = handleReminderReply.mock.calls;
    expect(first[0].providerMessageId).toMatch(/^reminder-reply:/);
    expect(first[0].providerMessageId).toBe(second[0].providerMessageId);
    expect(first[0].phone).toBe('+527224999206');
  });
});
