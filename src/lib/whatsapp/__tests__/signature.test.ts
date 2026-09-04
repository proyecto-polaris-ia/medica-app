import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWhatsAppWebhookSignature } from '../signature';

describe('verifyWhatsAppWebhookSignature', () => {
  it('accepts a valid Meta signature', () => {
    const rawBody = JSON.stringify({ ok: true });
    const appSecret = 'secret';
    const digest = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
    expect(verifyWhatsAppWebhookSignature({ rawBody, appSecret, signatureHeader: `sha256=${digest}` })).toEqual({ ok: true });
  });

  it('rejects invalid signatures', () => {
    expect(verifyWhatsAppWebhookSignature({ rawBody: '{}', appSecret: 'secret', signatureHeader: 'sha256=bad' }).ok).toBe(false);
  });
});
