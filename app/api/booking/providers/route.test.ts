import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/booking/catalog', () => ({
  listProviders: vi.fn(),
}));

vi.mock('../_lib/flag', () => ({
  isBookingUiEnabled: vi.fn(),
}));

import { listProviders } from '@/lib/booking/catalog';
import { isBookingUiEnabled } from '../_lib/flag';

describe('GET /api/booking/providers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 404 when the booking UI flag is off', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const res = await GET(
      new Request('http://localhost/api/booking/providers')
    );

    expect(res.status).toBe(404);
    expect(listProviders).not.toHaveBeenCalled();
  });

  it('returns the catalog when the flag is on', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (listProviders as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'pro-1', name: 'Dra. Ana López' },
    ]);

    const res = await GET(
      new Request('http://localhost/api/booking/providers')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      providers: [{ id: 'pro-1', name: 'Dra. Ana López' }],
    });
  });

  it('returns 500 when the catalog throws', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (listProviders as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db down')
    );

    const res = await GET(
      new Request('http://localhost/api/booking/providers')
    );

    expect(res.status).toBe(500);
  });
});
