import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  listTreatmentPlans,
  getTreatmentPlan,
  createTreatmentPlan,
  updateTreatmentPlan,
  deleteTreatmentPlan,
  createTreatmentPlanItem,
  updateTreatmentPlanItem,
  deleteTreatmentPlanItem,
  sumLineTotals,
  moneyToCents,
} from '../treatment-plans';
import { NotFoundError, ConflictError } from '../errors';
import { ValidationError } from '../validate';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PLAN_ID = '660e8400-e29b-41d4-a716-446655440000';
const PROVIDER_ID = '770e8400-e29b-41d4-a716-446655440000';
const CLINICAL_VISIT_ID = '880e8400-e29b-41d4-a716-446655440000';
const SERVICE_ID = '990e8400-e29b-41d4-a716-446655440000';
const ITEM_ID = 'aa0e8400-e29b-41d4-a716-446655440000';

function buildQuery() {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockEq = vi.fn();
  const mockOrder = vi.fn();
  const mockSingle = vi.fn();

  const query = {
    select: mockSelect.mockReturnThis(),
    insert: mockInsert.mockReturnThis(),
    update: mockUpdate.mockReturnThis(),
    delete: mockDelete.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    order: mockOrder.mockReturnThis(),
    single: mockSingle,
    _mocks: {
      mockSelect,
      mockInsert,
      mockUpdate,
      mockDelete,
      mockEq,
      mockOrder,
      mockSingle,
    },
  };
  return query;
}

function planRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    patient_id: PATIENT_ID,
    provider_id: PROVIDER_ID,
    clinical_visit_id: null,
    name: 'Plan A',
    status: 'draft',
    total_amount: 0,
    accepted_at: null,
    notes: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    treatment_plan_id: PLAN_ID,
    description: 'Restauración',
    service_id: null,
    tooth: '11',
    quantity: 1,
    unit_price: 100.5,
    status: 'pending',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

function mockClient(query: ReturnType<typeof buildQuery>) {
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn().mockReturnValue(query),
  });
}

describe('treatment-plans data layer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('listTreatmentPlans', () => {
    it('returns mapped plans sorted by created_at descending', async () => {
      const query = buildQuery();
      query._mocks.mockOrder.mockResolvedValue({
        data: [
          planRow({ id: 'plan-2', created_at: '2026-09-03T10:00:00Z' }),
          planRow({ id: 'plan-1', created_at: '2026-09-02T10:00:00Z' }),
        ],
        error: null,
      });
      mockClient(query);

      const plans = await listTreatmentPlans(PATIENT_ID);

      expect(plans.map((p) => p.id)).toEqual(['plan-2', 'plan-1']);
      expect(query._mocks.mockEq).toHaveBeenCalledWith('patient_id', PATIENT_ID);
      expect(query._mocks.mockOrder).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('returns an empty array when no plans exist', async () => {
      const query = buildQuery();
      query._mocks.mockOrder.mockResolvedValue({ data: [], error: null });
      mockClient(query);

      const plans = await listTreatmentPlans(PATIENT_ID);

      expect(plans).toEqual([]);
    });

    it('throws ValidationError for an invalid patient id', async () => {
      await expect(listTreatmentPlans('bad-id')).rejects.toThrow(ValidationError);
    });
  });

  describe('getTreatmentPlan', () => {
    it('returns a plan with its items', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: planRow(),
        error: null,
      });
      query._mocks.mockOrder.mockResolvedValue({
        data: [itemRow()],
        error: null,
      });
      mockClient(query);

      const plan = await getTreatmentPlan(PLAN_ID);

      expect(plan.id).toBe(PLAN_ID);
      expect(plan.status).toBe('draft');
      expect(plan.items).toHaveLength(1);
      expect(plan.items[0].description).toBe('Restauración');
      expect(plan.items[0].unitPrice).toBe(100.5);
      expect(query._mocks.mockEq).toHaveBeenCalledWith('id', PLAN_ID);
      expect(query._mocks.mockEq).toHaveBeenCalledWith(
        'treatment_plan_id',
        PLAN_ID
      );
    });

    it('throws NotFoundError when the plan does not exist', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });
      mockClient(query);

      await expect(getTreatmentPlan(PLAN_ID)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('throws ValidationError for an invalid plan id', async () => {
      await expect(getTreatmentPlan('bad-id')).rejects.toThrow(ValidationError);
    });
  });

  describe('createTreatmentPlan', () => {
    it('inserts a draft plan with total 0 and returns it with items', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: planRow({ total_amount: 301.5 }),
        error: null,
      });
      query._mocks.mockOrder.mockResolvedValue({
        data: [itemRow({ quantity: 3, unit_price: 100.5 })],
        error: null,
      });
      mockClient(query);

      const plan = await createTreatmentPlan(PATIENT_ID, {
        providerId: PROVIDER_ID,
        name: 'Plan A',
        items: [{ description: 'Restauración', unitPrice: 100.5, quantity: 3 }],
      });

      expect(query._mocks.mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: PATIENT_ID,
          provider_id: PROVIDER_ID,
          name: 'Plan A',
          status: 'draft',
          total_amount: 0,
        })
      );
      expect(query._mocks.mockInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            treatment_plan_id: PLAN_ID,
            description: 'Restauración',
            quantity: 3,
            unit_price: 100.5,
            status: 'pending',
          }),
        ])
      );
      expect(plan.totalAmount).toBe(301.5);
      expect(plan.items).toHaveLength(1);
    });

    it('creates a plan without items and keeps total at 0', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: planRow(),
        error: null,
      });
      query._mocks.mockOrder.mockResolvedValue({ data: [], error: null });
      mockClient(query);

      const plan = await createTreatmentPlan(PATIENT_ID, {
        providerId: PROVIDER_ID,
        name: 'Plan vacío',
      });

      expect(plan.totalAmount).toBe(0);
      expect(plan.items).toEqual([]);
      expect(query._mocks.mockInsert).toHaveBeenCalledTimes(1);
    });

    it('throws ValidationError when required fields are missing', async () => {
      mockClient(buildQuery());

      await expect(
        createTreatmentPlan(PATIENT_ID, {
          providerId: PROVIDER_ID,
          name: '',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('deletes the partially-created plan when item insertion fails', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: planRow(),
        error: null,
      });
      query._mocks.mockInsert
        .mockReturnValueOnce(query)
        .mockRejectedValueOnce(new Error('item insert failed'));
      query._mocks.mockEq.mockResolvedValue({ error: null });
      mockClient(query);

      await expect(
        createTreatmentPlan(PATIENT_ID, {
          providerId: PROVIDER_ID,
          name: 'Plan A',
          items: [{ description: 'Restauración', unitPrice: 100 }],
        })
      ).rejects.toThrow('item insert failed');

      expect(query._mocks.mockDelete).toHaveBeenCalled();
    });
  });

  describe('updateTreatmentPlan', () => {
    function setupTransition(
      from: string,
      to: string,
      acceptedAt: string | null = null,
      returnedAcceptedAt: string | null = null
    ) {
      const query = buildQuery();
      query._mocks.mockSingle
        .mockResolvedValueOnce({
          data: planRow({ status: from, accepted_at: acceptedAt }),
          error: null,
        })
        .mockResolvedValueOnce({
          data: planRow({
            status: to,
            accepted_at: returnedAcceptedAt ?? acceptedAt,
          }),
          error: null,
        });
      mockClient(query);
      return query;
    }

    it('allows draft -> presented', async () => {
      const query = setupTransition('draft', 'presented');
      const plan = await updateTreatmentPlan(PLAN_ID, { status: 'presented' });
      expect(plan.status).toBe('presented');
      expect(query._mocks.mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'presented' })
      );
    });

    it('allows presented -> accepted and populates accepted_at', async () => {
      const query = setupTransition('presented', 'accepted', null, '2026-09-02T10:00:00Z');
      const plan = await updateTreatmentPlan(PLAN_ID, { status: 'accepted' });
      expect(plan.status).toBe('accepted');
      expect(query._mocks.mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'accepted',
          accepted_at: expect.any(String),
        })
      );
    });

    it('rejects draft -> accepted', async () => {
      const query = setupTransition('draft', 'accepted');
      await expect(
        updateTreatmentPlan(PLAN_ID, { status: 'accepted' })
      ).rejects.toThrow(ValidationError);
      expect(query._mocks.mockUpdate).not.toHaveBeenCalled();
    });

    it('allows presented -> draft (revert)', async () => {
      const query = setupTransition('presented', 'draft');
      const plan = await updateTreatmentPlan(PLAN_ID, { status: 'draft' });
      expect(plan.status).toBe('draft');
    });

    it('allows accepted -> in_progress', async () => {
      const query = setupTransition('accepted', 'in_progress');
      const plan = await updateTreatmentPlan(PLAN_ID, { status: 'in_progress' });
      expect(plan.status).toBe('in_progress');
    });

    it('allows in_progress -> completed', async () => {
      const query = setupTransition('in_progress', 'completed');
      const plan = await updateTreatmentPlan(PLAN_ID, { status: 'completed' });
      expect(plan.status).toBe('completed');
    });

    it('rejects completed -> any transition', async () => {
      const query = setupTransition('completed', 'cancelled');
      await expect(
        updateTreatmentPlan(PLAN_ID, { status: 'cancelled' })
      ).rejects.toThrow(ValidationError);
      expect(query._mocks.mockUpdate).not.toHaveBeenCalled();
    });

    it('rejects cancelled -> any transition', async () => {
      const query = setupTransition('cancelled', 'draft');
      await expect(
        updateTreatmentPlan(PLAN_ID, { status: 'draft' })
      ).rejects.toThrow(ValidationError);
      expect(query._mocks.mockUpdate).not.toHaveBeenCalled();
    });

    it('allows any non-completed state -> cancelled and preserves accepted_at', async () => {
      const acceptedAt = '2026-09-02T10:00:00Z';
      const query = setupTransition('accepted', 'cancelled', acceptedAt, acceptedAt);
      const plan = await updateTreatmentPlan(PLAN_ID, { status: 'cancelled' });
      expect(plan.status).toBe('cancelled');
      expect(query._mocks.mockUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({ accepted_at: null })
      );
    });

    it('throws NotFoundError when the plan does not exist', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });
      mockClient(query);

      await expect(
        updateTreatmentPlan(PLAN_ID, { name: 'X' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects an invalid status value', async () => {
      mockClient(buildQuery());
      await expect(
        // @ts-expect-error — deliberate invalid status for validation test
        updateTreatmentPlan(PLAN_ID, { status: 'unknown_status' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteTreatmentPlan', () => {
    it('deletes a draft plan', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: planRow({ status: 'draft' }),
        error: null,
      });
      query._mocks.mockEq
        .mockReturnValueOnce(query)
        .mockResolvedValue({ error: null });
      mockClient(query);

      await deleteTreatmentPlan(PLAN_ID);

      expect(query._mocks.mockDelete).toHaveBeenCalled();
      expect(query._mocks.mockEq).toHaveBeenLastCalledWith('id', PLAN_ID);
    });

    it('throws ConflictError when the plan is not draft', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: planRow({ status: 'accepted' }),
        error: null,
      });
      mockClient(query);

      await expect(deleteTreatmentPlan(PLAN_ID)).rejects.toBeInstanceOf(
        ConflictError
      );
      expect(query._mocks.mockDelete).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the plan does not exist', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });
      mockClient(query);

      await expect(deleteTreatmentPlan(PLAN_ID)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });

  describe('createTreatmentPlanItem', () => {
    it('creates an item in a draft plan and recomputes the total', async () => {
      const query = buildQuery();
      query._mocks.mockSingle
        .mockResolvedValueOnce({
          data: planRow({ status: 'draft' }),
          error: null,
        })
        .mockResolvedValueOnce({
          data: itemRow({ description: 'Limpieza', quantity: 2, unit_price: 100 }),
          error: null,
        });
      query._mocks.mockOrder.mockResolvedValue({
        data: [itemRow({ description: 'Limpieza', quantity: 2, unit_price: 100 })],
        error: null,
      });
      mockClient(query);

      const item = await createTreatmentPlanItem(PLAN_ID, {
        description: 'Limpieza',
        unitPrice: 100,
        quantity: 2,
      });

      expect(item.description).toBe('Limpieza');
      expect(item.quantity).toBe(2);
      expect(query._mocks.mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          treatment_plan_id: PLAN_ID,
          unit_price: 100,
          quantity: 2,
          status: 'pending',
        })
      );
    });

    it('throws ConflictError when the plan is not draft', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: planRow({ status: 'accepted' }),
        error: null,
      });
      mockClient(query);

      await expect(
        createTreatmentPlanItem(PLAN_ID, {
          description: 'X',
          unitPrice: 100,
        })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('throws ValidationError when input is invalid', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: planRow({ status: 'draft' }),
        error: null,
      });
      mockClient(query);

      await expect(
        createTreatmentPlanItem(PLAN_ID, {
          description: '',
          unitPrice: -10,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updateTreatmentPlanItem', () => {
    it('allows updating only the item status in any plan state', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: itemRow({ status: 'done' }),
        error: null,
      });
      mockClient(query);

      const item = await updateTreatmentPlanItem(PLAN_ID, ITEM_ID, {
        status: 'done',
      });

      expect(item.status).toBe('done');
      expect(query._mocks.mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'done' })
      );
    });

    it('allows updating monetary fields in a draft plan and recomputes the total', async () => {
      const query = buildQuery();
      query._mocks.mockSingle
        .mockResolvedValueOnce({
          data: planRow({ status: 'draft' }),
          error: null,
        })
        .mockResolvedValueOnce({
          data: itemRow({ unit_price: 200 }),
          error: null,
        });
      query._mocks.mockOrder.mockResolvedValue({
        data: [itemRow({ unit_price: 200 })],
        error: null,
      });
      mockClient(query);

      const item = await updateTreatmentPlanItem(PLAN_ID, ITEM_ID, {
        unitPrice: 200,
      });

      expect(item.unitPrice).toBe(200);
      expect(query._mocks.mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ unit_price: 200 })
      );
    });

    it('throws ConflictError when changing monetary fields in a non-draft plan', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: planRow({ status: 'accepted' }),
        error: null,
      });
      mockClient(query);

      await expect(
        updateTreatmentPlanItem(PLAN_ID, ITEM_ID, { unitPrice: 200 })
      ).rejects.toBeInstanceOf(ConflictError);
      expect(query._mocks.mockUpdate).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the item does not exist', async () => {
      const query = buildQuery();
      query._mocks.mockSingle
        .mockResolvedValueOnce({
          data: planRow({ status: 'draft' }),
          error: null,
        })
        .mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116', message: 'No rows found' },
        });
      mockClient(query);

      await expect(
        updateTreatmentPlanItem(PLAN_ID, ITEM_ID, { unitPrice: 200 })
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('deleteTreatmentPlanItem', () => {
    it('deletes an item in a draft plan and recomputes the total', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: planRow({ status: 'draft' }),
        error: null,
      });
      query._mocks.mockOrder.mockResolvedValue({ data: [], error: null });
      mockClient(query);

      await deleteTreatmentPlanItem(PLAN_ID, ITEM_ID);

      expect(query._mocks.mockDelete).toHaveBeenCalled();
      expect(query._mocks.mockEq).toHaveBeenCalledWith('id', ITEM_ID);
    });

    it('throws ConflictError when the plan is not draft', async () => {
      const query = buildQuery();
      query._mocks.mockSingle.mockResolvedValue({
        data: planRow({ status: 'accepted' }),
        error: null,
      });
      mockClient(query);

      await expect(
        deleteTreatmentPlanItem(PLAN_ID, ITEM_ID)
      ).rejects.toBeInstanceOf(ConflictError);
      expect(query._mocks.mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('sumLineTotals / money arithmetic', () => {
    it('computes 3 x 100.50 as 301.50 without float drift', () => {
      expect(
        sumLineTotals([{ quantity: 3, unitPrice: 100.5 }])
      ).toBe(301.5);
    });

    it('handles multiple lines with typical float values', () => {
      expect(
        sumLineTotals([
          { quantity: 1, unitPrice: 0.1 },
          { quantity: 1, unitPrice: 0.2 },
        ])
      ).toBe(0.3);
    });

    it('returns 0 for an empty list', () => {
      expect(sumLineTotals([])).toBe(0);
    });
  });

  describe('moneyToCents', () => {
    it('rounds to the nearest cent', () => {
      expect(moneyToCents(100.505)).toBe(10051);
      expect(moneyToCents(100.504)).toBe(10050);
    });
  });
});
