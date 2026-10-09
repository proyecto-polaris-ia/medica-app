import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { GET } from './route';
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

vi.mock('@/lib/admin/patient-record', () => ({
  listPatientAttendedAppointmentsPage: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import { listPatientAttendedAppointmentsPage } from '@/lib/admin/patient-record';

const USER = { id: '880e8400-e29b-41d4-a716-446655440000' };
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';

const APPOINTMENT = {
  id: '660e8400-e29b-41d4-a716-446655440000',
  patientId: PATIENT_ID,
  serviceId: '770e8400-e29b-41d4-a716-446655440000',
  providerId: '880e8400-e29b-41d4-a716-446655440001',
  startAt: '2026-08-20T17:00:00.000Z',
  endAt: '2026-08-20T17:30:00.000Z',
  status: 'attended' as const,
  notes: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  serviceName: 'Limpieza dental',
  providerName: 'Dra. Ana Martínez',
};

function get(query = '') {
  return GET(
    new Request(
      `http://localhost/api/admin/patients/${PATIENT_ID}/appointments/attended${query}`
    ),
    { params: Promise.resolve({ id: PATIENT_ID }) }
  );
}

describe('GET /api/admin/patients/[id]/appointments/attended', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as Mock).mockResolvedValue(USER);
  });

  it('returns 401 without an authenticated session', async () => {
    (requireUser as Mock).mockRejectedValue(new UnauthorizedError());

    const res = await get();

    expect(res.status).toBe(401);
    expect(listPatientAttendedAppointmentsPage).not.toHaveBeenCalled();
  });

  it('uses the default page and pageSize and returns pagination metadata', async () => {
    (listPatientAttendedAppointmentsPage as Mock).mockResolvedValue({
      appointments: [APPOINTMENT],
      total: 45,
    });

    const res = await get();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listPatientAttendedAppointmentsPage).toHaveBeenCalledWith(
      PATIENT_ID,
      1,
      10
    );
    expect(body).toEqual({
      appointments: [APPOINTMENT],
      pagination: { total: 45, page: 1, pageSize: 10, totalPages: 5 },
    });
  });

  it('forwards page and pageSize to the data layer', async () => {
    (listPatientAttendedAppointmentsPage as Mock).mockResolvedValue({
      appointments: [APPOINTMENT],
      total: 21,
    });

    const res = await get('?page=3&pageSize=10');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listPatientAttendedAppointmentsPage).toHaveBeenCalledWith(
      PATIENT_ID,
      3,
      10
    );
    expect(body.pagination).toEqual({
      total: 21,
      page: 3,
      pageSize: 10,
      totalPages: 3,
    });
  });

  it('returns an empty history and total 0 when the patient has no attended appointments', async () => {
    (listPatientAttendedAppointmentsPage as Mock).mockResolvedValue({
      appointments: [],
      total: 0,
    });

    const res = await get();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      appointments: [],
      pagination: { total: 0, page: 1, pageSize: 10, totalPages: 0 },
    });
  });

  it.each([
    '?page=0',
    '?page=-1',
    '?page=abc',
    '?page=1.5',
    '?pageSize=0',
    '?pageSize=51',
    '?pageSize=abc',
  ])('returns 400 without data for invalid pagination (%s)', async (query) => {
    const res = await get(query);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: 'invalid_request', field: expect.any(String) });
    expect(body).not.toHaveProperty('appointments');
    expect(listPatientAttendedAppointmentsPage).not.toHaveBeenCalled();
  });

  it('returns 404 when the patient does not exist', async () => {
    (listPatientAttendedAppointmentsPage as Mock).mockRejectedValue(
      new NotFoundError('Patient')
    );

    const res = await get();

    expect(res.status).toBe(404);
  });

  it('returns 404 for a malformed patient id without querying data', async () => {
    const res = await GET(
      new Request(
        'http://localhost/api/admin/patients/not-a-uuid/appointments/attended'
      ),
      { params: Promise.resolve({ id: 'not-a-uuid' }) }
    );

    expect(res.status).toBe(404);
    expect(listPatientAttendedAppointmentsPage).not.toHaveBeenCalled();
  });
});
