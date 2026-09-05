import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/booking/booking', () => ({
  bookAppointment: vi.fn(),
}));

vi.mock('@/lib/booking/patient-resolution', () => ({
  resolvePatient: vi.fn(),
  resolvePatientById: vi.fn(),
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

vi.mock('../../../_lib/responses', () => ({
  parseJsonBody: vi.fn(async (request: Request) => await request.json()),
}));

import { bookAppointment } from '@/lib/booking/booking';
import {
  resolvePatient,
  resolvePatientById,
} from '@/lib/booking/patient-resolution';
import { requireUser, UnauthorizedError } from '@/lib/supabase/auth';

const USER = { id: 'user-1', email: 'a@b.c' };

const slotBody = {
  serviceId: '550e8400-e29b-41d4-a716-446655440000',
  providerId: '550e8400-e29b-41d4-a716-446655440001',
  startAt: '2026-09-10T14:00:00.000Z',
  endAt: '2026-09-10T14:30:00.000Z',
};

describe('POST /api/admin/booking/book', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await POST(
      new Request('http://localhost/api/admin/booking/book', {
        method: 'POST',
        body: JSON.stringify({ ...slotBody, patientId: 'pat-1' }),
      })
    );

    expect(res.status).toBe(401);
    expect(resolvePatientById).not.toHaveBeenCalled();
  });

  it('returns 201 resolving by patientId', async () => {
    (resolvePatientById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pat-1',
      full_name: 'María García',
    });
    (bookAppointment as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
    });

    const res = await POST(
      new Request('http://localhost/api/admin/booking/book', {
        method: 'POST',
        body: JSON.stringify({ ...slotBody, patientId: 'pat-1' }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(resolvePatientById).toHaveBeenCalledWith('pat-1');
    expect(resolvePatient).not.toHaveBeenCalled();
    expect(body.status).toBe('booked');
  });

  it('returns 201 resolving by phone and fullName', async () => {
    (resolvePatient as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pat-2',
      full_name: 'Juan Pérez',
    });
    (bookAppointment as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
    });

    const res = await POST(
      new Request('http://localhost/api/admin/booking/book', {
        method: 'POST',
        body: JSON.stringify({
          ...slotBody,
          phone: '+5215587654321',
          fullName: 'Juan Pérez',
        }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(resolvePatient).toHaveBeenCalledWith({
      phone: '+5215587654321',
      fullName: 'Juan Pérez',
    });
    expect(resolvePatientById).not.toHaveBeenCalled();
    expect(body.status).toBe('booked');
  });

  it('returns 400 when neither patientId nor phone/fullName is provided', async () => {
    const res = await POST(
      new Request('http://localhost/api/admin/booking/book', {
        method: 'POST',
        body: JSON.stringify(slotBody),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.field).toBe('patient');
  });
});
