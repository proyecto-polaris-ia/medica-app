import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  createPayment,
  listPayments,
  reversePayment,
  updatePayment,
} from '../payments';
import { ConflictError } from '../errors';
import { ValidationError } from '../validate';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_PATIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const PLAN_ID = '660e8400-e29b-41d4-a716-446655440000';
const PAYMENT_ID = '770e8400-e29b-41d4-a716-446655440000';
const USER_ID = '880e8400-e29b-41d4-a716-446655440000';

function buildQuery() {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockEq = vi.fn();
  const mockOrder = vi.fn();
  const mockSingle = vi.fn();

  const query = {
    select: mockSelect.mockReturnThis(),
    insert: mockInsert.mockReturnThis(),
    update: mockUpdate.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    order: mockOrder.mockReturnThis(),
    single: mockSingle,
    _mocks: {
      mockSelect,
      mockInsert,
      mockUpdate,
      mockEq,
      mockOrder,
      mockSingle,
    },
  };
  return query;
}

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYMENT_ID,
    patient_id: PATIENT_ID,
    treatment_plan_id: PLAN_ID,
    amount: 100.5,
    method: 'cash',
    paid_at: '2026-09-15T10:00:00Z',
    reference: 'REC-1',
    notes: 'Abono inicial',
    created_by: USER_ID,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    created_at: '2026-09-15T10:05:00Z',
    updated_at: '2026-09-15T10:05:00Z',
    ...overrides,
  };
}

function mockClientByTable(queues: Record<string, ReturnType<typeof buildQuery>[]>) {
  const from = vi.fn((table: string) => {
    const query = queues[table]?.shift();
    if (!query) {
      throw new Error(`Unexpected table query: ${table}`);
    }
    return query;
  });
  (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({ from });
  return { from };
}

describe('payments data layer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lists patient payments by paid_at descending and maps snake_case rows', async () => {
    const query = buildQuery();
    query._mocks.mockOrder.mockResolvedValue({
      data: [
        paymentRow({ id: 'payment-2', paid_at: '2026-09-20T10:00:00Z' }),
        paymentRow({ id: 'payment-1', paid_at: '2026-09-10T10:00:00Z' }),
      ],
      error: null,
    });
    mockClientByTable({ payments: [query] });

    const payments = await listPayments(PATIENT_ID);

    expect(payments.map((payment) => payment.id)).toEqual([
      'payment-2',
      'payment-1',
    ]);
    expect(payments[0].patientId).toBe(PATIENT_ID);
    expect(payments[0].paidAt).toBe('2026-09-20T10:00:00Z');
    expect(query._mocks.mockEq).toHaveBeenCalledWith('patient_id', PATIENT_ID);
    expect(query._mocks.mockOrder).toHaveBeenCalledWith('paid_at', {
      ascending: false,
    });
  });

  it('creates a payment linked to a treatment plan owned by the patient', async () => {
    const planQuery = buildQuery();
    planQuery._mocks.mockSingle.mockResolvedValue({
      data: { id: PLAN_ID, patient_id: PATIENT_ID },
      error: null,
    });
    const paymentQuery = buildQuery();
    paymentQuery._mocks.mockSingle.mockResolvedValue({
      data: paymentRow(),
      error: null,
    });
    mockClientByTable({ treatment_plans: [planQuery], payments: [paymentQuery] });

    const payment = await createPayment(
      PATIENT_ID,
      {
        treatmentPlanId: PLAN_ID,
        amount: 100.5,
        method: 'cash',
        paidAt: '2026-09-15T10:00:00Z',
        reference: ' REC-1 ',
        notes: ' Abono inicial ',
      },
      USER_ID
    );

    expect(payment.treatmentPlanId).toBe(PLAN_ID);
    expect(payment.amount).toBe(100.5);
    expect(planQuery._mocks.mockEq).toHaveBeenCalledWith('id', PLAN_ID);
    expect(planQuery._mocks.mockEq).toHaveBeenCalledWith('patient_id', PATIENT_ID);
    expect(paymentQuery._mocks.mockInsert).toHaveBeenCalledWith({
      patient_id: PATIENT_ID,
      treatment_plan_id: PLAN_ID,
      amount: 100.5,
      method: 'cash',
      paid_at: '2026-09-15T10:00:00.000Z',
      reference: 'REC-1',
      notes: 'Abono inicial',
      created_by: USER_ID,
    });
  });

  it('creates an unallocated patient payment when no treatment plan is provided', async () => {
    const paymentQuery = buildQuery();
    paymentQuery._mocks.mockSingle.mockResolvedValue({
      data: paymentRow({ treatment_plan_id: null }),
      error: null,
    });
    const client = mockClientByTable({ payments: [paymentQuery] });

    const payment = await createPayment(
      PATIENT_ID,
      {
        amount: 250,
        method: 'transfer',
        paidAt: '2026-09-15T10:00:00Z',
      },
      USER_ID
    );

    expect(payment.treatmentPlanId).toBeNull();
    expect(client.from).not.toHaveBeenCalledWith('treatment_plans');
    expect(paymentQuery._mocks.mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ treatment_plan_id: null })
    );
  });

  it('rejects creating a payment for a treatment plan owned by another patient', async () => {
    const planQuery = buildQuery();
    planQuery._mocks.mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    });
    mockClientByTable({ treatment_plans: [planQuery] });

    await expect(
      createPayment(
        PATIENT_ID,
        {
          treatmentPlanId: PLAN_ID,
          amount: 100,
          method: 'card',
          paidAt: '2026-09-15T10:00:00Z',
        },
        USER_ID
      )
    ).rejects.toThrow(ValidationError);
  });

  it('updates reference and notes for an active payment', async () => {
    const currentQuery = buildQuery();
    currentQuery._mocks.mockSingle.mockResolvedValue({
      data: paymentRow({ voided_at: null }),
      error: null,
    });
    const updateQuery = buildQuery();
    updateQuery._mocks.mockSingle.mockResolvedValue({
      data: paymentRow({ reference: 'REC-2', notes: 'Corregido' }),
      error: null,
    });
    mockClientByTable({ payments: [currentQuery, updateQuery] });

    const payment = await updatePayment(PAYMENT_ID, {
      reference: ' REC-2 ',
      notes: ' Corregido ',
    });

    expect(payment.reference).toBe('REC-2');
    expect(payment.notes).toBe('Corregido');
    expect(updateQuery._mocks.mockUpdate).toHaveBeenCalledWith({
      reference: 'REC-2',
      notes: 'Corregido',
    });
  });

  it('rejects updating a reversed payment', async () => {
    const currentQuery = buildQuery();
    currentQuery._mocks.mockSingle.mockResolvedValue({
      data: paymentRow({ voided_at: '2026-09-16T10:00:00Z' }),
      error: null,
    });
    mockClientByTable({ payments: [currentQuery] });

    await expect(
      updatePayment(PAYMENT_ID, { reference: 'REC-2' })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('reverses an active payment with an auditable reason', async () => {
    const currentQuery = buildQuery();
    currentQuery._mocks.mockSingle.mockResolvedValue({
      data: paymentRow({ voided_at: null }),
      error: null,
    });
    const reverseQuery = buildQuery();
    reverseQuery._mocks.mockSingle.mockResolvedValue({
      data: paymentRow({
        voided_at: '2026-09-16T10:00:00Z',
        voided_by: USER_ID,
        void_reason: 'Captura duplicada',
      }),
      error: null,
    });
    mockClientByTable({ payments: [currentQuery, reverseQuery] });

    const payment = await reversePayment(
      PAYMENT_ID,
      { reason: ' Captura duplicada ' },
      USER_ID
    );

    expect(payment.voidedAt).toBe('2026-09-16T10:00:00Z');
    expect(payment.voidedBy).toBe(USER_ID);
    expect(payment.voidReason).toBe('Captura duplicada');
    expect(reverseQuery._mocks.mockUpdate).toHaveBeenCalledWith({
      voided_at: expect.any(String),
      voided_by: USER_ID,
      void_reason: 'Captura duplicada',
    });
  });

  it('rejects reversing a payment twice', async () => {
    const currentQuery = buildQuery();
    currentQuery._mocks.mockSingle.mockResolvedValue({
      data: paymentRow({ voided_at: '2026-09-16T10:00:00Z' }),
      error: null,
    });
    mockClientByTable({ payments: [currentQuery] });

    await expect(
      reversePayment(PAYMENT_ID, { reason: 'Duplicado' }, USER_ID)
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
