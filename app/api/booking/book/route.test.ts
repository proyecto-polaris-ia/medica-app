import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/booking/booking', () => ({
  bookAppointment: vi.fn(),
}));

vi.mock('@/lib/booking/next-available', () => ({
  findNextAvailable: vi.fn(),
}));

vi.mock('@/lib/booking/patient-resolution', () => ({
  resolvePatient: vi.fn(),
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

import { bookAppointment } from '@/lib/booking/booking';
import { findNextAvailable } from '@/lib/booking/next-available';
import { resolvePatient } from '@/lib/booking/patient-resolution';
import { isBookingUiEnabled } from '../_lib/flag';
import { requireUser, UnauthorizedError } from '@/lib/supabase/auth';

const USER = { id: 'user-1', email: 'a@b.c' };

const validBody = {
  serviceId: '550e8400-e29b-41d4-a716-446655440000',
  providerId: '550e8400-e29b-41d4-a716-446655440001',
  startAt: '2026-09-10T14:00:00.000Z',
  endAt: '2026-09-10T14:30:00.000Z',
  phone: '+5215512345678',
  fullName: 'María García',
};

describe('POST /api/booking/book', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await POST(
      new Request('http://localhost/api/booking/book', {
        method: 'POST',
        body: JSON.stringify(validBody),
      })
    );

    expect(res.status).toBe(401);
    expect(resolvePatient).not.toHaveBeenCalled();
  });

  it('returns 404 when the booking UI flag is off', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const res = await POST(
      new Request('http://localhost/api/booking/book', {
        method: 'POST',
        body: JSON.stringify(validBody),
      })
    );

    expect(res.status).toBe(404);
    expect(resolvePatient).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid phone', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const res = await POST(
      new Request('http://localhost/api/booking/book', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, phone: '5512345678' }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.field).toBe('phone');
    expect(resolvePatient).not.toHaveBeenCalled();
  });

  it('returns 201 on a successful booking', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (resolvePatient as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pat-1',
      full_name: 'María García',
    });
    (bookAppointment as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
    });

    const res = await POST(
      new Request('http://localhost/api/booking/book', {
        method: 'POST',
        body: JSON.stringify(validBody),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.status).toBe('booked');
    expect(body.confirmation).toEqual({
      serviceName: '',
      providerName: '',
      patientName: 'María García',
      startAt: validBody.startAt,
      endAt: validBody.endAt,
    });
  });

  it('returns 409 with the next available slot on conflict', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (resolvePatient as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pat-1',
      full_name: 'María García',
    });
    (bookAppointment as ReturnType<typeof vi.fn>).mockResolvedValue({
      type: 'conflict',
      message: 'Slot taken',
    });
    (findNextAvailable as ReturnType<typeof vi.fn>).mockResolvedValue({
      start_at: new Date('2026-09-10T15:00:00.000Z'),
      end_at: new Date('2026-09-10T15:30:00.000Z'),
    });

    const res = await POST(
      new Request('http://localhost/api/booking/book', {
        method: 'POST',
        body: JSON.stringify(validBody),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.status).toBe('conflict');
    expect(body.nextAvailable).toEqual({
      startAt: '2026-09-10T15:00:00.000Z',
      endAt: '2026-09-10T15:30:00.000Z',
    });
  });

  it('returns 409 with null nextAvailable when nothing is found', async () => {
    (isBookingUiEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (resolvePatient as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pat-1',
      full_name: 'María García',
    });
    (bookAppointment as ReturnType<typeof vi.fn>).mockResolvedValue({
      type: 'conflict',
      message: 'Slot taken',
    });
    (findNextAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(
      new Request('http://localhost/api/booking/book', {
        method: 'POST',
        body: JSON.stringify(validBody),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.nextAvailable).toBeNull();
  });
});
