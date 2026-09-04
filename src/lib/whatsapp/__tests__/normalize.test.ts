import { describe, expect, it } from 'vitest';
import { normalizeWhatsAppWebhookPayloadBundle } from '../normalize';

describe('normalizeWhatsAppWebhookPayloadBundle', () => {
  it('normalizes inbound text messages', () => {
    const bundle = normalizeWhatsAppWebhookPayloadBundle({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'biz' }, contacts: [{ wa_id: '521555', profile: { name: 'María' } }], messages: [{ id: 'wamid.1', from: '521555', timestamp: '1700000000', type: 'text', text: { body: 'hola' } }] } }] }] });
    expect(bundle.inboundEvents[0]).toMatchObject({ providerMessageId: 'wamid.1', fromPhone: '521555', profileName: 'María', businessPhoneNumberId: 'biz', messageType: 'text', body: 'hola' });
  });
});
