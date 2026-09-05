import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, PATCH } from './route';
import { UnauthorizedError } from '@/lib/supabase/auth';
import { NotFoundError } from '@/lib/admin/errors';
import { ValidationError } from '@/lib/admin/validate';

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
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
}));

vi.mock('@/lib/admin/provider-snapshot', () => ({
  getProviderSnapshot: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import { deleteProvider, updateProvider } from '@/lib/admin/providers';
import { getProviderSnapshot } from '@/lib/admin/provider-snapshot';

const USER = { id: 'user-1', email: 'a@b.c' };
const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('/api/admin/providers/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('PATCH returns 401 without session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    const res = await PATCH(
      new Request(`http://localhost/api/admin/providers/${PROVIDER_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Dra. Ana' }),
      }),
      { params: Promise.resolve({ id: PROVIDER_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it('PATCH updates a provider', async () => {
    (updateProvider as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: PROVIDER_ID,
      name: 'Dra. Ana López',
    });
    const res = await PATCH(
      new Request(`http://localhost/api/admin/providers/${PROVIDER_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Dra. Ana López' }),
      }),
      { params: Promise.resolve({ id: PROVIDER_ID }) }
    );
    expect(res.status).toBe(200);
  });

  it('PATCH returns 404 when not found', async () => {
    (updateProvider as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Provider')
    );
    const res = await PATCH(
      new Request(`http://localhost/api/admin/providers/${PROVIDER_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Dra. Ana' }),
      }),
      { params: Promise.resolve({ id: PROVIDER_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it('DELETE removes a provider', async () => {
    (deleteProvider as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const res = await DELETE(
      new Request(`http://localhost/api/admin/providers/${PROVIDER_ID}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: PROVIDER_ID }) }
    );
    expect(res.status).toBe(204);
  });

  describe('GET', () => {
    it('returns 401 without session', async () => {
      (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
        new UnauthorizedError()
      );
      const res = await GET(
        new Request(`http://localhost/api/admin/providers/${PROVIDER_ID}`),
        { params: Promise.resolve({ id: PROVIDER_ID }) }
      );
      expect(res.status).toBe(401);
    });

    it('returns 200 with a snapshot', async () => {
      const snapshot = {
        provider: { id: PROVIDER_ID, name: 'Dra. García' },
        upcoming: [],
        today: [],
        recentClients: [],
        clientsHref: `/appointments?providerId=${PROVIDER_ID}`,
      };
      (getProviderSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(snapshot);
      const res = await GET(
        new Request(`http://localhost/api/admin/providers/${PROVIDER_ID}`),
        { params: Promise.resolve({ id: PROVIDER_ID }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(snapshot);
    });

    it('returns 404 when provider does not exist', async () => {
      (getProviderSnapshot as ReturnType<typeof vi.fn>).mockRejectedValue(
        new NotFoundError('Provider')
      );
      const res = await GET(
        new Request(`http://localhost/api/admin/providers/${PROVIDER_ID}`),
        { params: Promise.resolve({ id: PROVIDER_ID }) }
      );
      expect(res.status).toBe(404);
    });

    it('returns 400 for a malformed id', async () => {
      (getProviderSnapshot as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ValidationError('id', 'Invalid id')
      );
      const res = await GET(
        new Request(`http://localhost/api/admin/providers/not-a-uuid`),
        { params: Promise.resolve({ id: 'not-a-uuid' }) }
      );
      expect(res.status).toBe(400);
    });
  });
});
