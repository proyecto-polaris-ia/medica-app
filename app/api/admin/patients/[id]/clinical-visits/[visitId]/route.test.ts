import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, PATCH } from './route';
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

vi.mock('@/lib/admin/clinical-visits', () => ({
  getClinicalVisit: vi.fn(),
  updateClinicalVisit: vi.fn(),
  deleteClinicalVisit: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  deleteClinicalVisit,
  getClinicalVisit,
  updateClinicalVisit,
} from '@/lib/admin/clinical-visits';

const USER = { id: 'user-1', email: 'a@b.c' };
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VISIT_ID = '660e8400-e29b-41d4-a716-446655440000';

const BASE_VISIT = {
  id: VISIT_ID,
  patientId: PATIENT_ID,
  appointmentId: null,
  providerId: null,
  subjective: 'Dolor',
  objective: null,
  assessment: null,
  plan: null,
  treatment: null,
  notes: null,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

function visitDetailRequest(
  method: 'GET' | 'PATCH' | 'DELETE',
  body?: Record<string, unknown>
) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(
    `http://localhost/api/admin/patients/${PATIENT_ID}/clinical-visits/${VISIT_ID}`,
    init
  );
}

describe('GET /api/admin/patients/[id]/clinical-visits/[visitId]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await GET(visitDetailRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID, visitId: VISIT_ID }),
    });

    expect(res.status).toBe(401);
    expect(getClinicalVisit).not.toHaveBeenCalled();
  });

  it('returns a clinical visit', async () => {
    (getClinicalVisit as ReturnType<typeof vi.fn>).mockResolvedValue(
      BASE_VISIT
    );

    const res = await GET(visitDetailRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID, visitId: VISIT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.clinicalVisit.subjective).toBe('Dolor');
    expect(getClinicalVisit).toHaveBeenCalledWith(PATIENT_ID, VISIT_ID);
  });

  it('returns 404 when the visit does not exist', async () => {
    (getClinicalVisit as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Clinical visit')
    );

    const res = await GET(visitDetailRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID, visitId: VISIT_ID }),
    });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/patients/[id]/clinical-visits/[visitId]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await PATCH(visitDetailRequest('PATCH', { subjective: 'X' }), {
      params: Promise.resolve({ id: PATIENT_ID, visitId: VISIT_ID }),
    });

    expect(res.status).toBe(401);
    expect(updateClinicalVisit).not.toHaveBeenCalled();
  });

  it('updates a clinical visit', async () => {
    (updateClinicalVisit as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_VISIT,
      assessment: 'Caries',
    });

    const res = await PATCH(
      visitDetailRequest('PATCH', { assessment: 'Caries' }),
      { params: Promise.resolve({ id: PATIENT_ID, visitId: VISIT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.clinicalVisit.assessment).toBe('Caries');
    expect(updateClinicalVisit).toHaveBeenCalledWith(PATIENT_ID, VISIT_ID, {
      assessment: 'Caries',
    });
  });

  it('returns 404 when the visit does not exist', async () => {
    (updateClinicalVisit as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Clinical visit')
    );

    const res = await PATCH(
      visitDetailRequest('PATCH', { assessment: 'Caries' }),
      { params: Promise.resolve({ id: PATIENT_ID, visitId: VISIT_ID }) }
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid input', async () => {
    (updateClinicalVisit as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('subjective', 'Invalid subjective')
    );

    const res = await PATCH(
      visitDetailRequest('PATCH', { subjective: '' }),
      { params: Promise.resolve({ id: PATIENT_ID, visitId: VISIT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('subjective');
  });
});

describe('DELETE /api/admin/patients/[id]/clinical-visits/[visitId]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await DELETE(visitDetailRequest('DELETE'), {
      params: Promise.resolve({ id: PATIENT_ID, visitId: VISIT_ID }),
    });

    expect(res.status).toBe(401);
    expect(deleteClinicalVisit).not.toHaveBeenCalled();
  });

  it('deletes a clinical visit', async () => {
    (deleteClinicalVisit as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );

    const res = await DELETE(visitDetailRequest('DELETE'), {
      params: Promise.resolve({ id: PATIENT_ID, visitId: VISIT_ID }),
    });

    expect(res.status).toBe(204);
    expect(deleteClinicalVisit).toHaveBeenCalledWith(PATIENT_ID, VISIT_ID);
  });

  it('returns 404 when the visit does not exist', async () => {
    (deleteClinicalVisit as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Clinical visit')
    );

    const res = await DELETE(visitDetailRequest('DELETE'), {
      params: Promise.resolve({ id: PATIENT_ID, visitId: VISIT_ID }),
    });

    expect(res.status).toBe(404);
  });
});
