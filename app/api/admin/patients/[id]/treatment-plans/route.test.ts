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

vi.mock('@/lib/admin/treatment-plans', () => ({
  listTreatmentPlans: vi.fn(),
  createTreatmentPlan: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  createTreatmentPlan,
  listTreatmentPlans,
} from '@/lib/admin/treatment-plans';

const USER = { id: 'user-1', email: 'a@b.c' };
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROVIDER_ID = '660e8400-e29b-41d4-a716-446655440000';
const PLAN_ID = '770e8400-e29b-41d4-a716-446655440000';

const BASE_PLAN = {
  id: PLAN_ID,
  patientId: PATIENT_ID,
  providerId: PROVIDER_ID,
  clinicalVisitId: null,
  name: 'Plan inicial',
  status: 'draft' as const,
  totalAmount: 0,
  acceptedAt: null,
  notes: null,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

function planRequest(method: 'GET' | 'POST', body?: Record<string, unknown>) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(
    `http://localhost/api/admin/patients/${PATIENT_ID}/treatment-plans`,
    init
  );
}

describe('GET /api/admin/patients/[id]/treatment-plans', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await GET(planRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });

    expect(res.status).toBe(401);
    expect(listTreatmentPlans).not.toHaveBeenCalled();
  });

  it('lists treatment plans', async () => {
    const plans = [
      { ...BASE_PLAN, id: 'plan-2', createdAt: '2026-01-02T00:00:00.000Z' },
      { ...BASE_PLAN, id: 'plan-1', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    (listTreatmentPlans as ReturnType<typeof vi.fn>).mockResolvedValue(plans);

    const res = await GET(planRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.treatmentPlans).toHaveLength(2);
    expect(body.treatmentPlans[0].id).toBe('plan-2');
    expect(body.treatmentPlans[1].id).toBe('plan-1');
    expect(listTreatmentPlans).toHaveBeenCalledWith(PATIENT_ID);
  });

  it('returns an empty list when the patient has no plans', async () => {
    (listTreatmentPlans as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(planRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.treatmentPlans).toEqual([]);
  });
});

describe('POST /api/admin/patients/[id]/treatment-plans', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await POST(
      planRequest('POST', { name: 'Plan inicial', providerId: PROVIDER_ID }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );

    expect(res.status).toBe(401);
    expect(createTreatmentPlan).not.toHaveBeenCalled();
  });

  it('creates a treatment plan with items', async () => {
    const planWithItems = {
      ...BASE_PLAN,
      items: [
        {
          id: 'item-1',
          treatmentPlanId: PLAN_ID,
          description: 'Limpieza',
          serviceId: null,
          tooth: null,
          quantity: 1,
          unitPrice: 500,
          status: 'pending' as const,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    };
    (createTreatmentPlan as ReturnType<typeof vi.fn>).mockResolvedValue(
      planWithItems
    );

    const res = await POST(
      planRequest('POST', {
        name: 'Plan inicial',
        providerId: PROVIDER_ID,
        items: [{ description: 'Limpieza', unitPrice: 500 }],
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.treatmentPlan.name).toBe('Plan inicial');
    expect(body.treatmentPlan.items).toHaveLength(1);
    expect(createTreatmentPlan).toHaveBeenCalledWith(PATIENT_ID, {
      name: 'Plan inicial',
      providerId: PROVIDER_ID,
      items: [{ description: 'Limpieza', unitPrice: 500 }],
    });
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(
      planRequest('POST', { providerId: PROVIDER_ID }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('name');
    expect(createTreatmentPlan).not.toHaveBeenCalled();
  });

  it('returns 400 when providerId is not a valid UUID', async () => {
    const res = await POST(
      planRequest('POST', { name: 'Plan inicial', providerId: 'not-a-uuid' }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('providerId');
    expect(createTreatmentPlan).not.toHaveBeenCalled();
  });

  it('returns 400 when an item has a negative unitPrice', async () => {
    const res = await POST(
      planRequest('POST', {
        name: 'Plan inicial',
        providerId: PROVIDER_ID,
        items: [{ description: 'Limpieza', unitPrice: -50 }],
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('items[0].unitPrice');
    expect(createTreatmentPlan).not.toHaveBeenCalled();
  });

  it('returns 404 when the patient does not exist', async () => {
    (createTreatmentPlan as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Patient')
    );

    const res = await POST(
      planRequest('POST', { name: 'Plan inicial', providerId: PROVIDER_ID }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );

    expect(res.status).toBe(404);
  });
});
