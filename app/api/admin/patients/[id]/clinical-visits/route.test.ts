import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
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
  listClinicalVisits: vi.fn(),
  createClinicalVisit: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  createClinicalVisit,
  listClinicalVisits,
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

function visitRequest(method: 'GET' | 'POST', body?: Record<string, unknown>) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(
    `http://localhost/api/admin/patients/${PATIENT_ID}/clinical-visits`,
    init
  );
}

describe('GET /api/admin/patients/[id]/clinical-visits', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await GET(visitRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });

    expect(res.status).toBe(401);
    expect(listClinicalVisits).not.toHaveBeenCalled();
  });

  it('lists visits in descending order', async () => {
    const visits = [
      { ...BASE_VISIT, id: 'visit-2', createdAt: '2026-01-02T00:00:00.000Z' },
      { ...BASE_VISIT, id: 'visit-1', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    (listClinicalVisits as ReturnType<typeof vi.fn>).mockResolvedValue(visits);

    const res = await GET(visitRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.clinicalVisits).toHaveLength(2);
    expect(body.clinicalVisits[0].id).toBe('visit-2');
    expect(body.clinicalVisits[1].id).toBe('visit-1');
    expect(listClinicalVisits).toHaveBeenCalledWith(PATIENT_ID);
  });

  it('returns an empty list when the patient has no visits', async () => {
    (listClinicalVisits as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(visitRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.clinicalVisits).toEqual([]);
  });
});

describe('POST /api/admin/patients/[id]/clinical-visits', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await POST(visitRequest('POST', { subjective: 'Dolor' }), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });

    expect(res.status).toBe(401);
    expect(createClinicalVisit).not.toHaveBeenCalled();
  });

  it('creates a clinical visit note', async () => {
    (createClinicalVisit as ReturnType<typeof vi.fn>).mockResolvedValue(
      BASE_VISIT
    );

    const res = await POST(
      visitRequest('POST', { subjective: 'Dolor', assessment: 'Caries' }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.clinicalVisit.subjective).toBe('Dolor');
    expect(createClinicalVisit).toHaveBeenCalledWith(PATIENT_ID, {
      subjective: 'Dolor',
      assessment: 'Caries',
    });
  });

  it('returns 400 when subjective is missing', async () => {
    (createClinicalVisit as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('subjective', 'Invalid subjective')
    );

    const res = await POST(
      visitRequest('POST', { assessment: 'Caries' }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('subjective');
  });
});
