import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as routeModule from './route';
import { PATCH } from './route';
import { UnauthorizedError } from '@/lib/supabase/auth';
import { ConflictError, NotFoundError } from '@/lib/admin/errors';
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
  updatePayment: vi.fn(),
  reversePayment: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import { reversePayment, updatePayment } from '@/lib/admin/payments';

const USER = { id: '880e8400-e29b-41d4-a716-446655440000', email: 'admin@example.com' };
const PAYMENT_ID = '770e8400-e29b-41d4-a716-446655440000';
const PLAN_ID = '660e8400-e29b-41d4-a716-446655440000';

const PAYMENT = {
  id: PAYMENT_ID,
  patientId: '550e8400-e29b-41d4-a716-446655440000',
  treatmentPlanId: PLAN_ID,
  amount: 100.5,
  method: 'cash' as const,
  paidAt: '2026-09-15T10:00:00.000Z',
  reference: 'REC-1',
  notes: 'Abono inicial',
  createdBy: USER.id,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  createdAt: '2026-09-15T10:05:00.000Z',
  updatedAt: '2026-09-15T10:05:00.000Z',
};

function paymentRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/admin/payments/${PAYMENT_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/admin/payments/[paymentId]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no admin session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(new UnauthorizedError());

    const res = await PATCH(paymentRequest({ action: 'update', reference: 'REC-2' }), {
      params: Promise.resolve({ paymentId: PAYMENT_ID }),
    });

    expect(res.status).toBe(401);
    expect(updatePayment).not.toHaveBeenCalled();
    expect(reversePayment).not.toHaveBeenCalled();
  });

  it('updates an active payment when action is update', async () => {
    (updatePayment as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...PAYMENT,
      reference: 'REC-2',
      notes: 'Corregido',
    });

    const res = await PATCH(
      paymentRequest({ action: 'update', reference: 'REC-2', notes: 'Corregido' }),
      { params: Promise.resolve({ paymentId: PAYMENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.payment.reference).toBe('REC-2');
    expect(updatePayment).toHaveBeenCalledWith(PAYMENT_ID, {
      treatmentPlanId: undefined,
      amount: undefined,
      method: undefined,
      paidAt: undefined,
      reference: 'REC-2',
      notes: 'Corregido',
    });
  });

  it('reverses an active payment when action is reverse', async () => {
    (reversePayment as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...PAYMENT,
      voidedAt: '2026-09-16T10:00:00.000Z',
      voidedBy: USER.id,
      voidReason: 'Captura duplicada',
    });

    const res = await PATCH(
      paymentRequest({ action: 'reverse', reason: 'Captura duplicada' }),
      { params: Promise.resolve({ paymentId: PAYMENT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.payment.voidReason).toBe('Captura duplicada');
    expect(reversePayment).toHaveBeenCalledWith(
      PAYMENT_ID,
      { reason: 'Captura duplicada' },
      USER.id
    );
  });

  it('returns 400 when reverse reason is missing', async () => {
    (reversePayment as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('reason', 'Invalid reason')
    );

    const res = await PATCH(paymentRequest({ action: 'reverse', reason: '' }), {
      params: Promise.resolve({ paymentId: PAYMENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: 'invalid_request', field: 'reason' });
  });

  it('returns 400 for an unsupported action', async () => {
    const res = await PATCH(paymentRequest({ action: 'delete' }), {
      params: Promise.resolve({ paymentId: PAYMENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: 'invalid_request', field: 'action' });
    expect(updatePayment).not.toHaveBeenCalled();
    expect(reversePayment).not.toHaveBeenCalled();
  });

  it('returns 404 when the payment does not exist', async () => {
    (updatePayment as ReturnType<typeof vi.fn>).mockRejectedValue(
      new NotFoundError('Payment')
    );

    const res = await PATCH(paymentRequest({ action: 'update', reference: 'REC-2' }), {
      params: Promise.resolve({ paymentId: PAYMENT_ID }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 409 when updating a reversed payment', async () => {
    (updatePayment as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConflictError('Reversed payments cannot be updated', 'payment_voided')
    );

    const res = await PATCH(paymentRequest({ action: 'update', reference: 'REC-2' }), {
      params: Promise.resolve({ paymentId: PAYMENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({
      code: 'payment_voided',
      message: 'Reversed payments cannot be updated',
    });
  });

  it('returns 409 when reversing an already reversed payment', async () => {
    (reversePayment as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConflictError('Payment is already reversed', 'payment_voided')
    );

    const res = await PATCH(paymentRequest({ action: 'reverse', reason: 'Duplicado' }), {
      params: Promise.resolve({ paymentId: PAYMENT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({
      code: 'payment_voided',
      message: 'Payment is already reversed',
    });
  });
});

describe('DELETE /api/admin/payments/[paymentId]', () => {
  it('does not expose physical deletion for payments', () => {
    expect('DELETE' in routeModule).toBe(false);
  });
});
