// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/observability/whatsapp-ai', () => ({
  createWhatsAppAiCorrelationContext: vi.fn((input: Record<string, unknown>) => ({
    correlationId: input.requestId ?? 'wa_corr_test',
  })),
  recordWhatsAppAiEvent: vi.fn(),
}));

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppTypingIndicator: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
}));

vi.mock('@/lib/whatsapp/signature', () => ({
  verifyWhatsAppWebhookSignature: vi.fn().mockReturnValue({ ok: true }),
}));

import { POST } from './route';
import type { NextRequest } from 'next/server';
import { sendWhatsAppTypingIndicator } from '@/lib/whatsapp/client';
import { verifyWhatsAppWebhookSignature } from '@/lib/whatsapp/signature';

function makeRawBody(message: Record<string, unknown> = { id: 'wamid.test', type: 'text', text: { body: 'Hola' } }) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [message] } }] }],
  });
}

const RAW_BODY = makeRawBody();

function makeRequest(signatureHeader = 'sha256=abc', body = RAW_BODY): NextRequest {
  return new Request('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    headers: { 'x-hub-signature-256': signatureHeader },
    body,
  }) as unknown as NextRequest;
}

const UNSUPPORTED_RAW_BODY = makeRawBody({
  id: 'wamid.image',
  type: 'image',
  image: { id: 'media.test' },
});

/**
 * Phase 3.2 contracts only (unconditional Eve forwarding). Phase 6 rewrites this
 * suite to the full always-forward contract (signature-before-forward,
 * forward-failure surfacing, no legacy invocation, GET verification).
 */
describe('POST /api/whatsapp/webhook forwards to Eve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    (verifyWhatsAppWebhookSignature as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true });
    (sendWhatsAppTypingIndicator as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });
  });

  it('forwards every inbound request to Eve', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/eve/v1/whatsapp');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['x-hub-signature-256']).toBe('sha256=abc');
    expect(sendWhatsAppTypingIndicator).toHaveBeenCalledWith({ messageId: 'wamid.test' });
  });

  it('continues forwarding when the typing indicator request fails', async () => {
    (sendWhatsAppTypingIndicator as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      error: 'typing failed',
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(sendWhatsAppTypingIndicator).toHaveBeenCalledWith({ messageId: 'wamid.test' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not send a typing indicator for unsupported inbound message types', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    const res = await POST(makeRequest('sha256=abc', UNSUPPORTED_RAW_BODY));
    expect(res.status).toBe(200);
    expect(sendWhatsAppTypingIndicator).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a forward failure with an error status instead of falling back to legacy', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
  });

  it('rejects an invalid signature before forwarding', async () => {
    (verifyWhatsAppWebhookSignature as ReturnType<typeof vi.fn>).mockReturnValue({ ok: false, reason: 'invalid_signature' });
    const fetchMock = vi.mocked(fetch);

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendWhatsAppTypingIndicator).not.toHaveBeenCalled();
  });
});
