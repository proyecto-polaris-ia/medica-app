export class TurnstileUnavailableError extends Error {
  constructor() {
    super('Turnstile is not configured');
    this.name = 'TurnstileUnavailableError';
  }
}

export async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new TurnstileUnavailableError();
  }

  const params = new URLSearchParams({ secret, response: token });

  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    }
  );

  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}
