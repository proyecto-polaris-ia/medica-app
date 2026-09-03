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

vi.mock('@/lib/admin/services', () => ({
  updateService: vi.fn(),
  deleteService: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import { deleteService, updateService } from '@/lib/admin/services';

const USER = { id: 'user-1', email: 'a@b.c' };
const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('/api/admin/services/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('PATCH returns 401 without session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    const res = await PATCH(
      new Request(`http://localhost/api/admin/services/${SERVICE_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Limpieza', durationMinutes: 60 }),
      }),
      { params: Promise.resolve({ id: SERVICE_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it('PATCH updates a service', async () => {
    (updateService as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: SERVICE_ID,
      name: 'Limpieza',
      durationMinutes: 60,
    });
    const res = await PATCH(
      new Request(`http://localhost/api/admin/services/${SERVICE_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Limpieza', durationMinutes: 60 }),
      }),
      { params: Promise.resolve({ id: SERVICE_ID }) }
    );
    expect(res.status).toBe(200);
  });

  it('PATCH returns 404 when not found', async () => {
    (updateService as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Service')
    );
    const res = await PATCH(
      new Request(`http://localhost/api/admin/services/${SERVICE_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Limpieza', durationMinutes: 60 }),
      }),
      { params: Promise.resolve({ id: SERVICE_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it('DELETE removes a service', async () => {
    (deleteService as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const res = await DELETE(
      new Request(`http://localhost/api/admin/services/${SERVICE_ID}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: SERVICE_ID }) }
    );
    expect(res.status).toBe(204);
  });
});
