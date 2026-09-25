import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PUT } from './route';
import { UnauthorizedError } from '@/lib/supabase/auth';
import { ValidationError } from '@/lib/admin/validate';

vi.mock('@/lib/supabase/auth', () => ({
  requireUser: vi.fn(),
  UnauthorizedError: class extends Error {
    constructor() {
      super('Unauthorized');
      this.name = 'UnauthorizedError';
    }
  },
}));

vi.mock('@/lib/admin/medical-history', () => ({
  getMedicalHistory: vi.fn(),
  upsertMedicalHistory: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  getMedicalHistory,
  upsertMedicalHistory,
} from '@/lib/admin/medical-history';

const USER = { id: 'user-1', email: 'a@b.c' };
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';

const EMPTY_HISTORY = {
  patientId: PATIENT_ID,
  allergies: [],
  systemicConditions: [],
  medications: [],
  pregnancyStatus: null,
  coagulationDisorders: null,
  anticoagulants: null,
  surgeries: null,
  infectiousDiseases: null,
  smoking: null,
  alcohol: null,
  dentalHistory: null,
  oralHabits: [],
  clinicalNotes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const FULL_HISTORY = {
  ...EMPTY_HISTORY,
  allergies: ['penicilina'],
  systemicConditions: ['diabetes'],
  medications: ['metformina'],
  pregnancyStatus: 'no',
  smoking: 'never',
  alcohol: 'occasional',
  dentalHistory: 'caries',
  oralHabits: ['bruxismo'],
  clinicalNotes: 'nota',
};

function historyRequest(method: 'GET' | 'PUT', body?: Record<string, unknown>) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(
    `http://localhost/api/admin/patients/${PATIENT_ID}/medical-history`,
    init
  );
}

describe('GET /api/admin/patients/[id]/medical-history', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await GET(historyRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });

    expect(res.status).toBe(401);
    expect(getMedicalHistory).not.toHaveBeenCalled();
  });

  it('returns existing medical history', async () => {
    (getMedicalHistory as ReturnType<typeof vi.fn>).mockResolvedValue(
      FULL_HISTORY
    );

    const res = await GET(historyRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.medicalHistory.allergies).toEqual(['penicilina']);
    expect(body.medicalHistory.systemicConditions).toEqual(['diabetes']);
    expect(getMedicalHistory).toHaveBeenCalledWith(PATIENT_ID);
  });

  it('returns empty values when no history exists', async () => {
    (getMedicalHistory as ReturnType<typeof vi.fn>).mockResolvedValue(
      EMPTY_HISTORY
    );

    const res = await GET(historyRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.medicalHistory.patientId).toBe(PATIENT_ID);
    expect(body.medicalHistory.allergies).toEqual([]);
    expect(body.medicalHistory.pregnancyStatus).toBeNull();
  });
});

describe('PUT /api/admin/patients/[id]/medical-history', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await PUT(historyRequest('PUT', {}), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });

    expect(res.status).toBe(401);
    expect(upsertMedicalHistory).not.toHaveBeenCalled();
  });

  it('replaces medical history', async () => {
    (upsertMedicalHistory as ReturnType<typeof vi.fn>).mockResolvedValue(
      FULL_HISTORY
    );

    const res = await PUT(
      historyRequest('PUT', {
        allergies: ['penicilina'],
        systemicConditions: ['diabetes'],
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.medicalHistory.allergies).toEqual(['penicilina']);
    expect(upsertMedicalHistory).toHaveBeenCalledWith(PATIENT_ID, {
      allergies: ['penicilina'],
      systemicConditions: ['diabetes'],
    });
  });

  it('returns 400 for invalid input', async () => {
    (upsertMedicalHistory as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('sex', 'Invalid sex')
    );

    const res = await PUT(
      historyRequest('PUT', { sex: 'invalid' }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('sex');
  });
});
