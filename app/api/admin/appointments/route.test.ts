import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../appointments/route';
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

vi.mock('@/lib/admin/appointments', () => ({
  listAppointments: vi.fn(),
  listAppointmentsRange: vi.fn(),
  createAppointment: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  createAppointment,
  listAppointments,
  listAppointmentsRange,
} from '@/lib/admin/appointments';

const USER = { id: 'user-1', email: 'a@b.c' };
const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('/api/admin/appointments', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('GET returns 401 without session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    const res = await GET(
      new Request('http://localhost/api/admin/appointments')
    );
    expect(res.status).toBe(401);
  });

  it('GET lists appointments', async () => {
    (listAppointments as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'appt-1', serviceId: SERVICE_ID, providerId: PROVIDER_ID },
    ]);
    const res = await GET(
      new Request('http://localhost/api/admin/appointments')
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.appointments).toHaveLength(1);
    expect(listAppointmentsRange).not.toHaveBeenCalled();
  });

  it('GET lists appointments in range when start and end are provided', async () => {
    (listAppointmentsRange as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'appt-1', serviceId: SERVICE_ID, providerId: PROVIDER_ID },
    ]);
    const res = await GET(
      new Request(
        'http://localhost/api/admin/appointments?start=2026-06-01T06:00:00.000Z&end=2026-07-01T06:00:00.000Z'
      )
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.appointments).toHaveLength(1);
    expect(listAppointmentsRange).toHaveBeenCalledWith(
      '2026-06-01T06:00:00.000Z',
      '2026-07-01T06:00:00.000Z'
    );
    expect(listAppointments).not.toHaveBeenCalled();
  });

  it('GET returns 400 for an invalid range', async () => {
    (listAppointmentsRange as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('end', 'end must be after start')
    );
    const res = await GET(
      new Request(
        'http://localhost/api/admin/appointments?start=2026-06-10T06:00:00.000Z&end=2026-06-09T06:00:00.000Z'
      )
    );
    expect(res.status).toBe(400);
  });

  it('POST creates an appointment', async () => {
    (createAppointment as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'appt-1',
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T14:30:00.000Z',
      status: 'requested',
    });
    const res = await POST(
      new Request('http://localhost/api/admin/appointments', {
        method: 'POST',
        body: JSON.stringify({
          serviceId: SERVICE_ID,
          providerId: PROVIDER_ID,
          startAt: '2026-09-10T14:00:00.000Z',
          endAt: '2026-09-10T14:30:00.000Z',
        }),
      })
    );
    expect(res.status).toBe(201);
  });

  it('POST returns 400 for invalid input', async () => {
    (createAppointment as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('endAt', 'Invalid endAt')
    );
    const res = await POST(
      new Request('http://localhost/api/admin/appointments', {
        method: 'POST',
        body: JSON.stringify({
          serviceId: SERVICE_ID,
          providerId: PROVIDER_ID,
          startAt: '2026-09-10T14:30:00.000Z',
          endAt: '2026-09-10T14:00:00.000Z',
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('POST returns 409 on overlap conflict', async () => {
    (createAppointment as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConflictError('Time slot overlaps with an existing appointment')
    );
    const res = await POST(
      new Request('http://localhost/api/admin/appointments', {
        method: 'POST',
        body: JSON.stringify({
          serviceId: SERVICE_ID,
          providerId: PROVIDER_ID,
          startAt: '2026-09-10T14:00:00.000Z',
          endAt: '2026-09-10T14:30:00.000Z',
        }),
      })
    );
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe('conflict');
  });
});
