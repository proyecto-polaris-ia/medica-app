import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  getPatientRecord: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import { getPatientRecord } from '@/lib/admin/patient-record';

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('GET /api/admin/patients/[id]/record', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
  });

  it('returns 401 without an authenticated session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(new UnauthorizedError());

    const res = await GET(
      new Request(`http://localhost/api/admin/patients/${PATIENT_ID}/record`),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );

    expect(res.status).toBe(401);
    expect(getPatientRecord).not.toHaveBeenCalled();
  });

  it('returns the patient record for authenticated admins', async () => {
    (getPatientRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
      patient: { id: PATIENT_ID, fullName: 'Daniel Rodríguez' },
      upcomingAppointments: [],
      attendedAppointments: [],
    });

    const res = await GET(
      new Request(`http://localhost/api/admin/patients/${PATIENT_ID}/record`),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getPatientRecord).toHaveBeenCalledWith(PATIENT_ID);
    expect(body.record.patient.fullName).toBe('Daniel Rodríguez');
  });

  it('returns 404 when the patient does not exist', async () => {
    (getPatientRecord as ReturnType<typeof vi.fn>).mockRejectedValue(new NotFoundError('Patient'));

    const res = await GET(
      new Request(`http://localhost/api/admin/patients/${PATIENT_ID}/record`),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );

    expect(res.status).toBe(404);
  });
});
