import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../providers/route';
import { UnauthorizedError } from '@/lib/supabase/auth';
import { ValidationError } from '@/lib/admin/validate';
import { ConflictError } from '@/lib/admin/errors';

vi.mock('@/lib/supabase/auth', () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class extends Error {
    constructor() {
      super('Unauthorized');
      this.name = 'UnauthorizedError';
    }
  },
}));

vi.mock('@/lib/admin/providers', () => ({
  listProviders: vi.fn(),
  createProvider: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import { createProvider, listProviders } from '@/lib/admin/providers';

const USER = { id: 'user-1', email: 'a@b.c' };

describe('/api/admin/providers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('GET returns 401 without session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    const res = await GET(new Request('http://localhost/api/admin/providers'));
    expect(res.status).toBe(401);
  });

  it('GET lists providers', async () => {
    (listProviders as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'pro-1', name: 'Dra. Ana' },
    ]);
    const res = await GET(new Request('http://localhost/api/admin/providers'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.providers).toHaveLength(1);
  });

  it('POST creates a provider', async () => {
    (createProvider as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pro-1',
      name: 'Dra. Ana',
    });
    const res = await POST(
      new Request('http://localhost/api/admin/providers', {
        method: 'POST',
        body: JSON.stringify({ name: 'Dra. Ana' }),
      })
    );
    expect(res.status).toBe(201);
  });

  it('POST returns 400 for invalid input', async () => {
    (createProvider as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('name', 'Invalid name')
    );
    const res = await POST(
      new Request('http://localhost/api/admin/providers', {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('POST returns 409 on conflict', async () => {
    (createProvider as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConflictError('Provider conflict')
    );
    const res = await POST(
      new Request('http://localhost/api/admin/providers', {
        method: 'POST',
        body: JSON.stringify({ name: 'Dra. Ana' }),
      })
    );
    expect(res.status).toBe(409);
  });
});
