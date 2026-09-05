import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, PATCH } from './route';
import { UnauthorizedError } from '@/lib/supabase/auth';
import { ValidationError } from '@/lib/admin/validate';
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

vi.mock('@/lib/admin/patients', () => ({
  updatePatient: vi.fn(),
  deletePatient: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import { deletePatient, updatePatient } from '@/lib/admin/patients';

const USER = { id: 'user-1', email: 'a@b.c' };
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('PATCH /api/admin/patients/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await PATCH(
      new Request(`http://localhost/api/admin/patients/${PATIENT_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ fullName: 'María', phoneE164: '+5215512345678' }),
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );

    expect(res.status).toBe(401);
  });

  it('updates a patient', async () => {
    (updatePatient as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: PATIENT_ID,
      fullName: 'María G.',
      phoneE164: '+5215512345678',
    });

    const res = await PATCH(
      new Request(`http://localhost/api/admin/patients/${PATIENT_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ fullName: 'María G.', phoneE164: '+5215512345678' }),
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.patient.fullName).toBe('María G.');
  });

  it('forwards an email-only update to the service', async () => {
    (updatePatient as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: PATIENT_ID, fullName: 'María', phoneE164: null, email: 'maria@example.com',
    });
    const res = await PATCH(
      new Request(`http://localhost/api/admin/patients/${PATIENT_ID}`, {
        method: 'PATCH', body: JSON.stringify({ fullName: 'María', phoneE164: null, email: 'maria@example.com' }),
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );

    expect(res.status).toBe(200);
    expect(updatePatient).toHaveBeenCalledWith(PATIENT_ID, {
      fullName: 'María', phoneE164: null, email: 'maria@example.com', notes: undefined,
    });
  });

  it('forwards both contacts on update', async () => {
    (updatePatient as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: PATIENT_ID, fullName: 'María', phoneE164: '+5215512345678', email: 'maria@example.com',
    });
    const res = await PATCH(
      new Request(`http://localhost/api/admin/patients/${PATIENT_ID}`, {
        method: 'PATCH', body: JSON.stringify({ fullName: 'María', phoneE164: '+5215512345678', email: 'maria@example.com' }),
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );

    expect(res.status).toBe(200);
    expect(updatePatient).toHaveBeenCalledWith(PATIENT_ID, {
      fullName: 'María', phoneE164: '+5215512345678', email: 'maria@example.com', notes: undefined,
    });
  });

  it('returns 404 when the patient does not exist', async () => {
    (updatePatient as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Patient')
    );

    const res = await PATCH(
      new Request(`http://localhost/api/admin/patients/${PATIENT_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ fullName: 'María', phoneE164: '+5215512345678' }),
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid input', async () => {
    (updatePatient as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('phoneE164', 'Invalid phoneE164')
    );

    const res = await PATCH(
      new Request(`http://localhost/api/admin/patients/${PATIENT_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ fullName: 'María', phoneE164: 'bad' }),
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.field).toBe('phoneE164');
  });
});

describe('DELETE /api/admin/patients/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await DELETE(
      new Request(`http://localhost/api/admin/patients/${PATIENT_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );

    expect(res.status).toBe(401);
  });

  it('deletes a patient', async () => {
    (deletePatient as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await DELETE(
      new Request(`http://localhost/api/admin/patients/${PATIENT_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );

    expect(res.status).toBe(204);
  });
});
