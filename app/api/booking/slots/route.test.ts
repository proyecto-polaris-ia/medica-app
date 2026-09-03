import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/booking/availability', () => ({
  getFreeSlots: vi.fn(),
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

import { getFreeSlots } from '@/lib/booking/availability';
import { isBookingUiEnabled } from '../_lib/flag';
import { requireUser, UnauthorizedError } from '@/lib/supabase/auth';

const USER = { id: 'user-1', email: 'a@b.c' };

describe('GET /api/booking/slots', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await GET(
      new Request(
        'http://localhost/api/booking/slots?providerId=550e8400-e29b-41d4-a716-446655440000&serviceId=550e8400-e29b-41d4-a716-446655440001&date=2026-09-10'
      )
    );

    expect(res.status).toBe(401);
    expect(getFreeSlots).not.toHaveBeenCalled();
  });

  it('returns 404 when the booking UI flag is off', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const res = await GET(
      new Request(
        'http://localhost/api/booking/slots?providerId=550e8400-e29b-41d4-a716-446655440000&serviceId=550e8400-e29b-41d4-a716-446655440001&date=2026-09-10'
      )
    );

    expect(res.status).toBe(404);
    expect(getFreeSlots).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid providerId', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const res = await GET(
      new Request(
        'http://localhost/api/booking/slots?providerId=bad&serviceId=550e8400-e29b-41d4-a716-446655440001&date=2026-09-10'
      )
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('providerId');
  });

  it('returns 400 for a malformed date', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const res = await GET(
      new Request(
        'http://localhost/api/booking/slots?providerId=550e8400-e29b-41d4-a716-446655440000&serviceId=550e8400-e29b-41d4-a716-446655440001&date=13-45-99'
      )
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.field).toBe('date');
  });

  it('calls getFreeSlots with a noon-UTC date', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (getFreeSlots as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await GET(
      new Request(
        'http://localhost/api/booking/slots?providerId=550e8400-e29b-41d4-a716-446655440000&serviceId=550e8400-e29b-41d4-a716-446655440001&date=2026-09-10'
      )
    );

    expect(getFreeSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: '550e8400-e29b-41d4-a716-446655440000',
        serviceId: '550e8400-e29b-41d4-a716-446655440001',
        localDate: new Date('2026-09-10T12:00:00Z'),
      })
    );
  });

  it('returns empty slots when none are available', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (getFreeSlots as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(
      new Request(
        'http://localhost/api/booking/slots?providerId=550e8400-e29b-41d4-a716-446655440000&serviceId=550e8400-e29b-41d4-a716-446655440001&date=2026-09-10'
      )
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.slots).toEqual([]);
  });

  it('serializes slot dates as startAt and endAt', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (getFreeSlots as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        start_at: new Date('2026-09-10T14:00:00.000Z'),
        end_at: new Date('2026-09-10T14:30:00.000Z'),
      },
    ]);

    const res = await GET(
      new Request(
        'http://localhost/api/booking/slots?providerId=550e8400-e29b-41d4-a716-446655440000&serviceId=550e8400-e29b-41d4-a716-446655440001&date=2026-09-10'
      )
    );
    const body = await res.json();

    expect(body.slots).toEqual([
      {
        startAt: '2026-09-10T14:00:00.000Z',
        endAt: '2026-09-10T14:30:00.000Z',
      },
    ]);
  });
});
