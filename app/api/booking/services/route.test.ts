import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/booking/catalog', () => ({
  listServices: vi.fn(),
}));

vi.mock('../_lib/flag', () => ({
  isBookingUiEnabled: vi.fn(),
}));

import { listServices } from '@/lib/booking/catalog';
import { isBookingUiEnabled } from '../_lib/flag';

describe('GET /api/booking/services', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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

  it('returns 500 when the catalog throws', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (listServices as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db down')
    );

    const res = await GET(new Request('http://localhost/api/booking/services'));

    expect(res.status).toBe(500);
  });
});
