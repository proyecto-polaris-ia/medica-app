// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/observability/whatsapp-ai', () => ({
  createWhatsAppAiCorrelationContext: vi.fn((input: Record<string, unknown>) => ({
    correlationId: input.requestId ?? 'wa_corr_test',
  })),
  recordWhatsAppAiEvent: vi.fn(),
}));

vi.mock('@/lib/whatsapp/inbound-service', () => ({
  processWhatsAppWebhookPayload: vi.fn().mockResolvedValue({ received: 1 }),
}));

vi.mock('@/lib/whatsapp/signature', () => ({
  verifyWhatsAppWebhookSignature: vi.fn().mockReturnValue({ ok: true }),
}));

vi.mock('@/lib/whatsapp/store', () => ({
  WhatsAppStoreConfigurationError: class extends Error {},
}));

import { POST } from './route';
import type { NextRequest } from 'next/server';
import { processWhatsAppWebhookPayload } from '@/lib/whatsapp/inbound-service';
import { verifyWhatsAppWebhookSignature } from '@/lib/whatsapp/signature';

const RAW_BODY = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: { messages: [{ id: 'wamid.test', type: 'text', text: { body: 'Hola' } }] } }] }],
});

function makeRequest(signatureHeader = 'sha256=abc'): NextRequest {
  return new Request('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    headers: { 'x-hub-signature-256': signatureHeader },
    body: RAW_BODY,
  }) as unknown as NextRequest;
}

describe('POST /api/whatsapp/webhook routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    delete process.env.WHATSAPP_EVE_ENABLED;
    (verifyWhatsAppWebhookSignature as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true });
    (processWhatsAppWebhookPayload as ReturnType<typeof vi.fn>).mockResolvedValue({ received: 1 });
  });

  it('routes to legacy when the flag is unset', async () => {
    const fetchMock = vi.mocked(fetch);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(processWhatsAppWebhookPayload).toHaveBeenCalledTimes(1);
  });

  it('routes to legacy when the flag is false', async () => {
    process.env.WHATSAPP_EVE_ENABLED = 'false';
    const fetchMock = vi.mocked(fetch);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(processWhatsAppWebhookPayload).toHaveBeenCalledTimes(1);
  });

  it('forwards to Eve when the flag is true', async () => {
    process.env.WHATSAPP_EVE_ENABLED = 'true';
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/eve/v1/whatsapp');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['x-hub-signature-256']).toBe('sha256=abc');
    expect(processWhatsAppWebhookPayload).not.toHaveBeenCalled();
  });

  it('falls back to legacy when the Eve forward throws', async () => {
    process.env.WHATSAPP_EVE_ENABLED = 'true';
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(processWhatsAppWebhookPayload).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid signature before any routing', async () => {
    (verifyWhatsAppWebhookSignature as ReturnType<typeof vi.fn>).mockReturnValue({ ok: false, reason: 'invalid_signature' });
    process.env.WHATSAPP_EVE_ENABLED = 'true';
    const fetchMock = vi.mocked(fetch);

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(processWhatsAppWebhookPayload).not.toHaveBeenCalled();
  });
});
