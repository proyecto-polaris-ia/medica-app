import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../services/route';
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

vi.mock('@/lib/admin/services', () => ({
  listServices: vi.fn(),
  createService: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import { createService, listServices } from '@/lib/admin/services';

const USER = { id: 'user-1', email: 'a@b.c' };

describe('/api/admin/services', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('GET returns 401 without session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    const res = await GET(new Request('http://localhost/api/admin/services'));
    expect(res.status).toBe(401);
  });

  it('GET lists services', async () => {
    (listServices as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'svc-1', name: 'Consulta', durationMinutes: 30 },
    ]);
    const res = await GET(new Request('http://localhost/api/admin/services'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.services).toHaveLength(1);
  });

  it('POST creates a service', async () => {
    (createService as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'svc-1',
      name: 'Consulta',
      durationMinutes: 30,
    });
    const res = await POST(
      new Request('http://localhost/api/admin/services', {
        method: 'POST',
        body: JSON.stringify({ name: 'Consulta', durationMinutes: 30 }),
      })
    );
    expect(res.status).toBe(201);
  });

  it('POST returns 400 for invalid input', async () => {
    (createService as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('durationMinutes', 'Invalid durationMinutes')
    );
    const res = await POST(
      new Request('http://localhost/api/admin/services', {
        method: 'POST',
        body: JSON.stringify({ name: 'Consulta', durationMinutes: 0 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('POST returns 409 on conflict', async () => {
    (createService as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConflictError('Service conflict')
    );
    const res = await POST(
      new Request('http://localhost/api/admin/services', {
        method: 'POST',
        body: JSON.stringify({ name: 'Consulta', durationMinutes: 30 }),
      })
    );
    expect(res.status).toBe(409);
  });
});
