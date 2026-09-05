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

vi.mock('@/lib/admin/appointments', () => ({
  updateAppointment: vi.fn(),
  deleteAppointment: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  deleteAppointment,
  updateAppointment,
} from '@/lib/admin/appointments';

const USER = { id: 'user-1', email: 'a@b.c' };
const APPOINTMENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440001';
const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440002';

describe('/api/admin/appointments/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('PATCH returns 401 without session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );
    const res = await PATCH(
      new Request(
        `http://localhost/api/admin/appointments/${APPOINTMENT_ID}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            serviceId: SERVICE_ID,
            providerId: PROVIDER_ID,
            startAt: '2026-09-10T15:00:00.000Z',
            endAt: '2026-09-10T15:30:00.000Z',
            status: 'confirmed',
          }),
        }
      ),
      { params: Promise.resolve({ id: APPOINTMENT_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it('PATCH updates an appointment', async () => {
    (updateAppointment as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: APPOINTMENT_ID,
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      startAt: '2026-09-10T15:00:00.000Z',
      endAt: '2026-09-10T15:30:00.000Z',
      status: 'confirmed',
      notes: null,
    });
    const res = await PATCH(
      new Request(
        `http://localhost/api/admin/appointments/${APPOINTMENT_ID}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            serviceId: SERVICE_ID,
            providerId: PROVIDER_ID,
            startAt: '2026-09-10T15:00:00.000Z',
            endAt: '2026-09-10T15:30:00.000Z',
            status: 'confirmed',
          }),
        }
      ),
      { params: Promise.resolve({ id: APPOINTMENT_ID }) }
    );
    expect(res.status).toBe(200);
  });

  it('PATCH forwards notes to updateAppointment', async () => {
    (updateAppointment as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: APPOINTMENT_ID,
      serviceId: SERVICE_ID,
      providerId: PROVIDER_ID,
      startAt: '2026-09-10T15:00:00.000Z',
      endAt: '2026-09-10T15:30:00.000Z',
      status: 'confirmed',
      notes: 'Actualizar teléfono',
    });

    await PATCH(
      new Request(
        `http://localhost/api/admin/appointments/${APPOINTMENT_ID}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            serviceId: SERVICE_ID,
            providerId: PROVIDER_ID,
            startAt: '2026-09-10T15:00:00.000Z',
            endAt: '2026-09-10T15:30:00.000Z',
            status: 'confirmed',
            notes: 'Actualizar teléfono',
          }),
        }
      ),
      { params: Promise.resolve({ id: APPOINTMENT_ID }) }
    );

    expect(updateAppointment).toHaveBeenCalledWith(
      APPOINTMENT_ID,
      expect.objectContaining({ notes: 'Actualizar teléfono' })
    );
  });

  it('PATCH returns 404 when not found', async () => {
    (updateAppointment as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Appointment')
    );
    const res = await PATCH(
      new Request(
        `http://localhost/api/admin/appointments/${APPOINTMENT_ID}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            serviceId: SERVICE_ID,
            providerId: PROVIDER_ID,
            startAt: '2026-09-10T15:00:00.000Z',
            endAt: '2026-09-10T15:30:00.000Z',
            status: 'confirmed',
          }),
        }
      ),
      { params: Promise.resolve({ id: APPOINTMENT_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it('DELETE removes an appointment', async () => {
    (deleteAppointment as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const res = await DELETE(
      new Request(
        `http://localhost/api/admin/appointments/${APPOINTMENT_ID}`,
        {
          method: 'DELETE',
        }
      ),
      { params: Promise.resolve({ id: APPOINTMENT_ID }) }
    );
    expect(res.status).toBe(204);
  });
});
