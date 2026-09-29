import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { DELETE as deleteItem, PATCH as patchItem } from './[itemId]/route';
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
  createTreatmentPlanItem: vi.fn(),
  updateTreatmentPlanItem: vi.fn(),
  deleteTreatmentPlanItem: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import {
  createTreatmentPlanItem,
  deleteTreatmentPlanItem,
  getTreatmentPlan,
  updateTreatmentPlanItem,
} from '@/lib/admin/treatment-plans';

const USER = { id: 'user-1', email: 'a@b.c' };
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROVIDER_ID = '660e8400-e29b-41d4-a716-446655440000';
const PLAN_ID = '770e8400-e29b-41d4-a716-446655440000';
const ITEM_ID = '880e8400-e29b-41d4-a716-446655440000';

const BASE_ITEM = {
  id: ITEM_ID,
  treatmentPlanId: PLAN_ID,
  description: 'Limpieza',
  serviceId: null,
  tooth: null,
  quantity: 1,
  unitPrice: 500,
  status: 'pending' as const,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

function itemsRequest(method: 'GET' | 'POST', body?: Record<string, unknown>) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(
    `http://localhost/api/admin/patients/${PATIENT_ID}/treatment-plans/${PLAN_ID}/items`,
    init
  );
}

function itemDetailRequest(
  method: 'PATCH' | 'DELETE',
  body?: Record<string, unknown>
) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(
    `http://localhost/api/admin/patients/${PATIENT_ID}/treatment-plans/${PLAN_ID}/items/${ITEM_ID}`,
    init
  );
}

describe('GET /api/admin/patients/[id]/treatment-plans/[planId]/items', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await GET(itemsRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }),
    });

    expect(res.status).toBe(401);
    expect(getTreatmentPlan).not.toHaveBeenCalled();
  });

  it('lists items for a plan', async () => {
    (getTreatmentPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [BASE_ITEM],
    });

    const res = await GET(itemsRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(ITEM_ID);
    expect(getTreatmentPlan).toHaveBeenCalledWith(PLAN_ID);
  });

  it('returns an empty list when the plan has no items', async () => {
    (getTreatmentPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
    });

    const res = await GET(itemsRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toEqual([]);
  });
});

describe('POST /api/admin/patients/[id]/treatment-plans/[planId]/items', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await POST(
      itemsRequest('POST', { description: 'Limpieza', unitPrice: 500 }),
      { params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }) }
    );

    expect(res.status).toBe(401);
    expect(createTreatmentPlanItem).not.toHaveBeenCalled();
  });

  it('creates an item in a draft plan', async () => {
    (createTreatmentPlanItem as ReturnType<typeof vi.fn>).mockResolvedValue(
      BASE_ITEM
    );

    const res = await POST(
      itemsRequest('POST', { description: 'Limpieza', unitPrice: 500 }),
      { params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.item.description).toBe('Limpieza');
    expect(createTreatmentPlanItem).toHaveBeenCalledWith(PLAN_ID, {
      description: 'Limpieza',
      unitPrice: 500,
    });
  });

  it('returns 409 when creating an item in an accepted plan', async () => {
    (createTreatmentPlanItem as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConflictError('Treatment plan is not in draft status')
    );

    const res = await POST(
      itemsRequest('POST', { description: 'Limpieza', unitPrice: 500 }),
      { params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.message).toBe('Treatment plan is not in draft status');
  });

  it('returns 400 when unitPrice is negative', async () => {
    const res = await POST(
      itemsRequest('POST', { description: 'Limpieza', unitPrice: -50 }),
      { params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('unitPrice');
    expect(createTreatmentPlanItem).not.toHaveBeenCalled();
  });

  it('returns 400 when tooth is not a valid FDI notation', async () => {
    const res = await POST(
      itemsRequest('POST', {
        description: 'Limpieza',
        unitPrice: 500,
        tooth: '99',
      }),
      { params: Promise.resolve({ id: PATIENT_ID, planId: PLAN_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('tooth');
    expect(createTreatmentPlanItem).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/patients/[id]/treatment-plans/[planId]/items/[itemId]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await patchItem(itemDetailRequest('PATCH', { status: 'done' }), {
      params: Promise.resolve({
        id: PATIENT_ID,
        planId: PLAN_ID,
        itemId: ITEM_ID,
      }),
    });

    expect(res.status).toBe(401);
    expect(updateTreatmentPlanItem).not.toHaveBeenCalled();
  });

  it('updates item status in an accepted plan', async () => {
    (updateTreatmentPlanItem as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_ITEM,
      status: 'done',
    });

    const res = await patchItem(itemDetailRequest('PATCH', { status: 'done' }), {
      params: Promise.resolve({
        id: PATIENT_ID,
        planId: PLAN_ID,
        itemId: ITEM_ID,
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.item.status).toBe('done');
    expect(updateTreatmentPlanItem).toHaveBeenCalledWith(PLAN_ID, ITEM_ID, {
      status: 'done',
    });
  });

  it('returns 409 when updating unitPrice in an accepted plan', async () => {
    (updateTreatmentPlanItem as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConflictError('Treatment plan is not in draft status')
    );

    const res = await patchItem(
      itemDetailRequest('PATCH', { unitPrice: 600 }),
      {
        params: Promise.resolve({
          id: PATIENT_ID,
          planId: PLAN_ID,
          itemId: ITEM_ID,
        }),
      }
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.message).toBe('Treatment plan is not in draft status');
  });

  it('returns 400 for an invalid item status value', async () => {
    const res = await patchItem(
      itemDetailRequest('PATCH', { status: 'invalid' }),
      {
        params: Promise.resolve({
          id: PATIENT_ID,
          planId: PLAN_ID,
          itemId: ITEM_ID,
        }),
      }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(body.field).toBe('status');
    expect(updateTreatmentPlanItem).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/patients/[id]/treatment-plans/[planId]/items/[itemId]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await deleteItem(itemDetailRequest('DELETE'), {
      params: Promise.resolve({
        id: PATIENT_ID,
        planId: PLAN_ID,
        itemId: ITEM_ID,
      }),
    });

    expect(res.status).toBe(401);
    expect(deleteTreatmentPlanItem).not.toHaveBeenCalled();
  });

  it('deletes an item from a draft plan', async () => {
    (deleteTreatmentPlanItem as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );

    const res = await deleteItem(itemDetailRequest('DELETE'), {
      params: Promise.resolve({
        id: PATIENT_ID,
        planId: PLAN_ID,
        itemId: ITEM_ID,
      }),
    });

    expect(res.status).toBe(204);
    expect(deleteTreatmentPlanItem).toHaveBeenCalledWith(PLAN_ID, ITEM_ID);
  });

  it('returns 409 when deleting an item from an accepted plan', async () => {
    (deleteTreatmentPlanItem as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConflictError('Treatment plan is not in draft status')
    );

    const res = await deleteItem(itemDetailRequest('DELETE'), {
      params: Promise.resolve({
        id: PATIENT_ID,
        planId: PLAN_ID,
        itemId: ITEM_ID,
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.message).toBe('Treatment plan is not in draft status');
  });
});
