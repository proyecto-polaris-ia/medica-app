import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, PATCH } from './route';
import { UnauthorizedError } from '@/lib/supabase/auth';
import { ValidationError } from '@/lib/admin/validate';
import { ConflictError, NotFoundError } from '@/lib/admin/errors';

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
  getTreatmentPlan: vi.fn(),
  updateTreatmentPlan: vi.fn(),
  deleteTreatmentPlan: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  deleteTreatmentPlan,
  getTreatmentPlan,
  updateTreatmentPlan,
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

const PLAN_WITH_ITEMS = {
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

function planDetailRequest(
  method: 'GET' | 'PATCH' | 'DELETE',
  body?: Record<string, unknown>
) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(
    `http://localhost/api/admin/patients/${PATIENT_ID}/treatment-plans/${PLAN_ID}`,
    init
  );
}

describe('GET /api/admin/patients/[id]/treatment-plans/[planId]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await GET(planDetailRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }),
    });

    expect(res.status).toBe(401);
    expect(getTreatmentPlan).not.toHaveBeenCalled();
  });

  it('returns a treatment plan with items', async () => {
    (getTreatmentPlan as ReturnType<typeof vi.fn>).mockResolvedValue(
      PLAN_WITH_ITEMS
    );

    const res = await GET(planDetailRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.treatmentPlan.name).toBe('Plan inicial');
    expect(body.treatmentPlan.items).toHaveLength(1);
    expect(getTreatmentPlan).toHaveBeenCalledWith(PLAN_ID);
  });

  it('returns 404 when the plan does not exist', async () => {
    (getTreatmentPlan as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Treatment plan')
    );

    const res = await GET(planDetailRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }),
    });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/patients/[id]/treatment-plans/[planId]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await PATCH(planDetailRequest('PATCH', { name: 'X' }), {
      params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }),
    });

    expect(res.status).toBe(401);
    expect(updateTreatmentPlan).not.toHaveBeenCalled();
  });

  it('updates a treatment plan with a valid status transition', async () => {
    (updateTreatmentPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_PLAN,
      status: 'presented',
    });

    const res = await PATCH(planDetailRequest('PATCH', { status: 'presented' }), {
      params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.treatmentPlan.status).toBe('presented');
    expect(updateTreatmentPlan).toHaveBeenCalledWith(PLAN_ID, {
      status: 'presented',
    });
  });

  it('returns 400 for an invalid status transition', async () => {
    (updateTreatmentPlan as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('status', 'Invalid status transition from draft to accepted')
    );

    const res = await PATCH(planDetailRequest('PATCH', { status: 'accepted' }), {
      params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('status');
  });

  it('returns 400 for an invalid status value', async () => {
    const res = await PATCH(
      planDetailRequest('PATCH', { status: 'unknown_status' }),
      { params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('status');
    expect(updateTreatmentPlan).not.toHaveBeenCalled();
  });

  it('returns 404 when the plan does not exist', async () => {
    (updateTreatmentPlan as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Treatment plan')
    );

    const res = await PATCH(planDetailRequest('PATCH', { name: 'X' }), {
      params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }),
    });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/patients/[id]/treatment-plans/[planId]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await DELETE(planDetailRequest('DELETE'), {
      params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }),
    });

    expect(res.status).toBe(401);
    expect(deleteTreatmentPlan).not.toHaveBeenCalled();
  });

  it('deletes a draft treatment plan', async () => {
    (deleteTreatmentPlan as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );

    const res = await DELETE(planDetailRequest('DELETE'), {
      params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }),
    });

    expect(res.status).toBe(204);
    expect(deleteTreatmentPlan).toHaveBeenCalledWith(PLAN_ID);
  });

  it('returns 409 when deleting an accepted plan', async () => {
    (deleteTreatmentPlan as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConflictError('Treatment plan is not in draft status')
    );

    const res = await DELETE(planDetailRequest('DELETE'), {
      params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.message).toBe('Treatment plan is not in draft status');
  });

  it('returns 404 when the plan does not exist', async () => {
    (deleteTreatmentPlan as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Treatment plan')
    );

    const res = await DELETE(planDetailRequest('DELETE'), {
      params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }),
    });

    expect(res.status).toBe(404);
  });
});
