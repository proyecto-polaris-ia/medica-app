import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/booking/catalog', () => ({
  listServices: vi.fn(),
}));

vi.mock('../_lib/flag', () => ({
  isBookingUiEnabled: vi.fn(),
}));

vi.mock('@/lib/supabase/auth', () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class extends Error {
    constructor() {
      super('Unauthorized');
      this.name = 'UnauthorizedError';
    }
  },
}));

import { listServices } from '@/lib/booking/catalog';
import { isBookingUiEnabled } from '../_lib/flag';
import { requireUser, UnauthorizedError } from '@/lib/supabase/auth';

const USER = { id: 'user-1', email: 'a@b.c' };

describe('GET /api/booking/services', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 404 when the booking UI flag is off', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const res = await GET(new Request('http://localhost/api/booking/services'));

    expect(res.status).toBe(404);
    expect(listServices).not.toHaveBeenCalled();
  });

  it('returns the catalog when the flag is on', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (listServices as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'svc-1', name: 'Consulta', durationMinutes: 30 },
    ]);

    const res = await GET(new Request('http://localhost/api/booking/services'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      services: [{ id: 'svc-1', name: 'Consulta', durationMinutes: 30 }],
    });
  });

  it('returns the catalog for an anonymous caller', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    (listServices as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'svc-1', name: 'Consulta', durationMinutes: 30 },
    ]);

    const res = await GET(new Request('http://localhost/api/booking/services'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      services: [{ id: 'svc-1', name: 'Consulta', durationMinutes: 30 }],
    });
  });

  it('returns 500 when the catalog throws', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (listServices as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db down')
    );

    const res = await GET(new Request('http://localhost/api/booking/services'));

    expect(res.status).toBe(500);
  });
});
