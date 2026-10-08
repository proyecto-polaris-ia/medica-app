import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
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

vi.mock('@/lib/admin/payments', () => ({
  listPayments: vi.fn(),
  createPayment: vi.fn(),
}));

vi.mock('@/lib/admin/accounts-receivable', () => ({
  getPatientReceivableSummary: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import { createPayment, listPayments } from '@/lib/admin/payments';
import { getPatientReceivableSummary } from '@/lib/admin/accounts-receivable';

const USER = { id: '880e8400-e29b-41d4-a716-446655440000', email: 'admin@example.com' };
const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PLAN_ID = '660e8400-e29b-41d4-a716-446655440000';
const PAYMENT_ID = '770e8400-e29b-41d4-a716-446655440000';

const PAYMENT = {
  id: PAYMENT_ID,
  patientId: PATIENT_ID,
  treatmentPlanId: PLAN_ID,
  amount: 100.5,
  method: 'cash' as const,
  paidAt: '2026-09-15T10:00:00.000Z',
  reference: 'REC-1',
  notes: 'Abono inicial',
  requiresInvoice: false,
  createdBy: USER.id,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  createdAt: '2026-09-15T10:05:00.000Z',
  updatedAt: '2026-09-15T10:05:00.000Z',
};

const SUMMARY = {
  patientId: PATIENT_ID,
  totalEligibleAmount: 1000,
  paidAmount: 100.5,
  unallocatedPaidAmount: 0,
  balance: 899.5,
  creditAmount: 0,
  planBalances: [],
  lastPaymentAt: '2026-09-15T10:00:00.000Z',
};

function paymentsRequest(method: 'GET' | 'POST', body?: Record<string, unknown>) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost/api/admin/patients/${PATIENT_ID}/payments`, init);
}

describe('GET /api/admin/patients/[id]/payments', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no admin session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(new UnauthorizedError());

    const res = await GET(paymentsRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });

    expect(res.status).toBe(401);
    expect(listPayments).not.toHaveBeenCalled();
    expect(getPatientReceivableSummary).not.toHaveBeenCalled();
  });

  it('returns patient payments and receivable summary for an authenticated user', async () => {
    (listPayments as ReturnType<typeof vi.fn>).mockResolvedValue([PAYMENT]);
    (getPatientReceivableSummary as ReturnType<typeof vi.fn>).mockResolvedValue(SUMMARY);

    const res = await GET(paymentsRequest('GET'), {
      params: Promise.resolve({ id: PATIENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listPayments).toHaveBeenCalledWith(PATIENT_ID);
    expect(getPatientReceivableSummary).toHaveBeenCalledWith(PATIENT_ID);
    expect(body).toEqual({ payments: [PAYMENT], summary: SUMMARY });
  });
});

describe('POST /api/admin/patients/[id]/payments', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no admin session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(new UnauthorizedError());

    const res = await POST(
      paymentsRequest('POST', {
        treatmentPlanId: PLAN_ID,
        amount: 100.5,
        method: 'cash',
        paidAt: '2026-09-15T10:00:00.000Z',
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );

    expect(res.status).toBe(401);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('creates a patient payment with the authenticated user id', async () => {
    (createPayment as ReturnType<typeof vi.fn>).mockResolvedValue(PAYMENT);

    const res = await POST(
      paymentsRequest('POST', {
        treatmentPlanId: PLAN_ID,
        amount: 100.5,
        method: 'cash',
        paidAt: '2026-09-15T10:00:00.000Z',
        reference: 'REC-1',
        notes: 'Abono inicial',
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({ payment: PAYMENT });
    expect(createPayment).toHaveBeenCalledWith(
      PATIENT_ID,
      {
        treatmentPlanId: PLAN_ID,
        amount: 100.5,
        method: 'cash',
        paidAt: '2026-09-15T10:00:00.000Z',
        reference: 'REC-1',
        notes: 'Abono inicial',
        requiresInvoice: false,
      },
      USER.id
    );
  });

  it('propagates requiresInvoice true to the payment service', async () => {
    (createPayment as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...PAYMENT,
      requiresInvoice: true,
    });

    const res = await POST(
      paymentsRequest('POST', {
        amount: 100.5,
        method: 'cash',
        paidAt: '2026-09-15T10:00:00.000Z',
        requiresInvoice: true,
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );

    expect(res.status).toBe(201);
    expect(createPayment).toHaveBeenCalledWith(
      PATIENT_ID,
      expect.objectContaining({ requiresInvoice: true }),
      USER.id
    );
  });

  it('normalizes any requiresInvoice value other than true to false', async () => {
    (createPayment as ReturnType<typeof vi.fn>).mockResolvedValue(PAYMENT);

    const res = await POST(
      paymentsRequest('POST', {
        amount: 100.5,
        method: 'cash',
        paidAt: '2026-09-15T10:00:00.000Z',
        requiresInvoice: 'si',
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );

    expect(res.status).toBe(201);
    expect(createPayment).toHaveBeenCalledWith(
      PATIENT_ID,
      expect.objectContaining({ requiresInvoice: false }),
      USER.id
    );
  });

  it('returns 400 when payment input is invalid', async () => {
    (createPayment as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('amount', 'Invalid amount')
    );

    const res = await POST(
      paymentsRequest('POST', {
        amount: 0,
        method: 'cash',
        paidAt: '2026-09-15T10:00:00.000Z',
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: 'invalid_request', field: 'amount' });
  });

  it('returns 400 when the treatment plan belongs to another patient', async () => {
    (createPayment as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('treatmentPlanId', 'Treatment plan does not belong to patient')
    );

    const res = await POST(
      paymentsRequest('POST', {
        treatmentPlanId: PLAN_ID,
        amount: 100,
        method: 'transfer',
        paidAt: '2026-09-15T10:00:00.000Z',
      }),
      { params: Promise.resolve({ id: PATIENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: 'invalid_request', field: 'treatmentPlanId' });
  });
});
