import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendWhatsAppTemplateMessage } from '../client';

const ORIGINAL_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const ORIGINAL_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ORIGINAL_GRAPH = process.env.WHATSAPP_GRAPH_VERSION;

function buildResponse({ ok, body }: { ok: boolean; body: unknown }): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === 'content-type') return 'application/json';
        return null;
      },
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('sendWhatsAppTemplateMessage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_GRAPH_VERSION;
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = ORIGINAL_TOKEN;
    if (ORIGINAL_PHONE_ID === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = ORIGINAL_PHONE_ID;
    if (ORIGINAL_GRAPH === undefined) delete process.env.WHATSAPP_GRAPH_VERSION;
    else process.env.WHATSAPP_GRAPH_VERSION = ORIGINAL_GRAPH;
  });

  it('returns { ok:false, skipped:true } when WhatsApp credentials are missing', async () => {
    const fetchImpl = vi.fn();

    const result = await sendWhatsAppTemplateMessage(
      {
        to: '+5215512345678',
        templateName: 'recordatorio_pago',
        bodyParameters: [{ type: 'text', text: 'María' }],
      },
      fetchImpl
    );

    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.status).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('POSTs a template payload to the WhatsApp Cloud API when credentials are present', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    process.env.WHATSAPP_GRAPH_VERSION = 'v20.0';

    const fetchImpl = vi.fn().mockResolvedValue(
      buildResponse({
        ok: true,
        body: { messages: [{ id: 'wamid.template-1' }] },
      })
    );

    const result = await sendWhatsAppTemplateMessage(
      {
        to: '+5215512345678',
        templateName: 'recordatorio_pago',
        bodyParameters: [
          { type: 'text', text: 'María' },
          { type: 'text', text: '$1,200 MXN' },
          { type: 'text', text: '30' },
        ],
      },
      fetchImpl
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v20.0/1234567890/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    });

    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+5215512345678',
      type: 'template',
      template: {
        name: 'recordatorio_pago',
        language: { code: 'es_MX' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'María' },
              { type: 'text', text: '$1,200 MXN' },
              { type: 'text', text: '30' },
            ],
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.providerMessageId).toBe('wamid.template-1');
    expect(result.status).toBe(200);
  });

  it('defaults the template language to es_MX when not provided', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';

    const fetchImpl = vi.fn().mockResolvedValue(
      buildResponse({ ok: true, body: { messages: [{ id: 'wamid.template-2' }] } })
    );

    await sendWhatsAppTemplateMessage(
      {
        to: '+5215512345678',
        templateName: 'recordatorio_pago',
        bodyParameters: [{ type: 'text', text: 'María' }],
      },
      fetchImpl
    );

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.template.language).toEqual({ code: 'es_MX' });
  });

  it('returns a typed error result when the upstream returns a non-OK status', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';

    const fetchImpl = vi.fn().mockResolvedValue(
      buildResponse({ ok: false, body: { error: { message: 'template not approved' } } })
    );

    const result = await sendWhatsAppTemplateMessage(
      {
        to: '+5215512345678',
        templateName: 'recordatorio_pago',
        bodyParameters: [{ type: 'text', text: 'María' }],
      },
      fetchImpl
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toContain('500');
    expect(result.response).toEqual({ error: { message: 'template not approved' } });
  });
});