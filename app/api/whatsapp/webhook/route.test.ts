// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { recordWhatsAppAiEvent } from '@/lib/observability/whatsapp-ai';
import { sendWhatsAppTypingIndicator } from '@/lib/whatsapp/client';
import { verifyWhatsAppWebhookSignature } from '@/lib/whatsapp/signature';

function makeRawBody(message: Record<string, unknown> = { id: 'wamid.test', type: 'text', text: { body: 'Hola' } }) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [message] } }] }],
  });
}

const RAW_BODY = makeRawBody();

const UNSUPPORTED_RAW_BODY = makeRawBody({
  id: 'wamid.image',
  type: 'image',
  image: { id: 'media.test' },
});

function makePostRequest(signatureHeader = 'sha256=abc', body = RAW_BODY): NextRequest {
  return new NextRequest('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    headers: { 'x-hub-signature-256': signatureHeader },
    body,
  });
}

function makeGetRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/whatsapp/webhook');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

const VERIFY_TOKEN = 'verify-token';

describe('GET /api/whatsapp/webhook (Meta verification)', () => {
  beforeEach(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
  });

  afterEach(() => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
  });

  it('returns the hub challenge when mode and token are valid', async () => {
    const res = await GET(makeGetRequest({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '12345' }));

    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe('12345');
  });

  it('rejects verification when the token does not match', async () => {
    const res = await GET(makeGetRequest({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '12345' }));

    expect(res.status).toBe(403);
  });

  it('rejects verification when the mode is not subscribe', async () => {
    const res = await GET(makeGetRequest({ 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '12345' }));

    expect(res.status).toBe(403);
  });
});

describe('POST /api/whatsapp/webhook (Eve-only forwarding)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    delete process.env.WHATSAPP_EVE_ENABLED;
    (verifyWhatsAppWebhookSignature as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true });
    (sendWhatsAppTypingIndicator as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WHATSAPP_EVE_ENABLED;
  });

  it('always forwards a verified text message to Eve, with no routing flag', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await POST(makePostRequest());

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/eva/eve/v1/whatsapp');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['x-hub-signature-256']).toBe('sha256=abc');
    expect(init?.body).toBe(RAW_BODY);
    expect(sendWhatsAppTypingIndicator).toHaveBeenCalledWith({ messageId: 'wamid.test' });
  });

  it('returns Eve\'s response status and body unchanged', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ handled: true }), { status: 202 }));

    const res = await POST(makePostRequest());

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({ handled: true });
  });

  it('verifies the signature before forwarding and before the typing indicator', async () => {
    (verifyWhatsAppWebhookSignature as ReturnType<typeof vi.fn>).mockReturnValue({ ok: false, reason: 'invalid_signature' });
    const fetchMock = vi.mocked(fetch);

    const res = await POST(makePostRequest());

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendWhatsAppTypingIndicator).not.toHaveBeenCalled();
  });

  it('returns 503 when the signing secret is not configured', async () => {
    (verifyWhatsAppWebhookSignature as ReturnType<typeof vi.fn>).mockReturnValue({ ok: false, reason: 'missing_secret' });
    const fetchMock = vi.mocked(fetch);

    const res = await POST(makePostRequest());

    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid JSON payload without forwarding', async () => {
    const fetchMock = vi.mocked(fetch);

    const res = await POST(makePostRequest('sha256=abc', 'not-json'));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('continues forwarding when the typing indicator request fails', async () => {
    (sendWhatsAppTypingIndicator as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 400, error: 'typing failed' });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    const res = await POST(makePostRequest());

    expect(res.status).toBe(200);
    expect(sendWhatsAppTypingIndicator).toHaveBeenCalledWith({ messageId: 'wamid.test' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not send a typing indicator for unsupported inbound message types', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    const res = await POST(makePostRequest('sha256=abc', UNSUPPORTED_RAW_BODY));

    expect(res.status).toBe(200);
    expect(sendWhatsAppTypingIndicator).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a forward failure as 502 instead of falling back to a legacy path', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    const res = await POST(makePostRequest());

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: 'WhatsApp webhook processing failed' });
  });

  it('records the Eve forwarding target and success outcome for a verified message', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));

    await POST(makePostRequest());

    expect(recordWhatsAppAiEvent).toHaveBeenCalledWith({
      context: { correlationId: 'wa_corr_test' },
      type: 'webhook.accepted',
      outcome: 'success',
      identifiers: { forwardingTarget: 'eve', inboundMessageId: 'wamid.test' },
    });
  });

  it('records the Eve forwarding failure outcome when the forward fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    await POST(makePostRequest());

    expect(recordWhatsAppAiEvent).toHaveBeenCalledWith({
      context: { correlationId: 'wa_corr_test' },
      type: 'webhook.failed',
      outcome: 'failure',
      identifiers: { forwardingTarget: 'eve', inboundMessageId: 'wamid.test' },
      diagnostics: { reason: 'eve_forward_failed' },
    });
  });

  it('records the rejection when the signature is invalid', async () => {
    (verifyWhatsAppWebhookSignature as ReturnType<typeof vi.fn>).mockReturnValue({ ok: false, reason: 'invalid_signature' });

    await POST(makePostRequest());

    expect(recordWhatsAppAiEvent).toHaveBeenCalledWith({
      context: { correlationId: 'wa_corr_test' },
      type: 'webhook.rejected',
      outcome: 'failure',
      diagnostics: { reason: 'invalid_signature' },
    });
  });
});
