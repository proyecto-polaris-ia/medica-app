import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, PATCH } from './route';
import { UnauthorizedError } from '@/lib/supabase/auth';
import { NotFoundError } from '@/lib/admin/errors';

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

import { requireUser } from '@/lib/supabase/auth';
import { deleteProvider, updateProvider } from '@/lib/admin/providers';

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
});
