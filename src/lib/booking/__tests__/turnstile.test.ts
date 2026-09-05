import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import {
  TurnstileUnavailableError,
  verifyTurnstile,
} from '../turnstile';

describe('verifyTurnstile', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('returns true when Cloudflare confirms success', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-key';
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      Response.json({ success: true })
    );

    const result = await verifyTurnstile('valid-token');

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: expect.stringContaining('secret=secret-key'),
      })
    );
  });

  it('returns false when Cloudflare rejects the token', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-key';
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      Response.json({ success: false })
    );

    const result = await verifyTurnstile('invalid-token');

    expect(result).toBe(false);
  });

  it('throws TurnstileUnavailableError when the secret key is missing', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;

    await expect(verifyTurnstile('any-token')).rejects.toThrow(
      TurnstileUnavailableError
    );
    await expect(verifyTurnstile('any-token')).rejects.toThrow(
      'Turnstile is not configured'
    );
  });
});
