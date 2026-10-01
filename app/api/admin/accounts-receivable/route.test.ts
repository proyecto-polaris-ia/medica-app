import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
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

vi.mock('@/lib/admin/accounts-receivable', () => ({
  listAccountsReceivable: vi.fn(),
}));

import { requireUser } from '@/lib/supabase/auth';
import { listAccountsReceivable } from '@/lib/admin/accounts-receivable';

const USER = { id: 'user-1', email: 'admin@example.com' };

describe('GET /api/admin/accounts-receivable', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
  });

  it('returns 401 when there is no admin session', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError()
    );

    const res = await GET(
      new Request('http://localhost/api/admin/accounts-receivable')
    );

    expect(res.status).toBe(401);
    expect(listAccountsReceivable).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid threshold', async () => {
    (listAccountsReceivable as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError('thresholdDays', 'Invalid thresholdDays')
    );

    const res = await GET(
      new Request('http://localhost/api/admin/accounts-receivable?thresholdDays=abc')
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: 'invalid_request', field: 'thresholdDays' });
  });

  it('returns accountsReceivable and forwards the parsed threshold', async () => {
    (listAccountsReceivable as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        patientId: 'patient-1',
        patientName: 'María López',
        patientPhoneE164: '+5215512345678',
        totalEligibleAmount: 1000,
        paidAmount: 100,
        unallocatedPaidAmount: 0,
        balance: 900,
        creditAmount: 0,
        lastPaymentAt: '2026-09-20T10:00:00.000Z',
        planBalances: [],
        pastDuePlans: [],
      },
    ]);

    const res = await GET(
      new Request('http://localhost/api/admin/accounts-receivable?thresholdDays=15')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listAccountsReceivable).toHaveBeenCalledWith({ thresholdDays: 15 });
    expect(body.accountsReceivable).toHaveLength(1);
    expect(body.accountsReceivable[0].patientName).toBe('María López');
  });

  it('returns an empty array when zero-balance and credit patients are excluded by the data layer', async () => {
    (listAccountsReceivable as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(
      new Request('http://localhost/api/admin/accounts-receivable')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ accountsReceivable: [] });
  });

  it('preserves highlighted overdue plans in the response', async () => {
    (listAccountsReceivable as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        patientId: 'patient-1',
        patientName: 'María López',
        patientPhoneE164: null,
        totalEligibleAmount: 1000,
        paidAmount: 0,
        unallocatedPaidAmount: 0,
        balance: 1000,
        creditAmount: 0,
        lastPaymentAt: null,
        planBalances: [
          {
            treatmentPlanId: 'plan-1',
            name: 'Ortodoncia',
            status: 'accepted',
            totalAmount: 1000,
            paidAmount: 0,
            balance: 1000,
            baseDate: '2026-08-30T12:00:00.000Z',
            baseDateSource: 'accepted_at',
            daysPastDue: 31,
            isPastDue: true,
          },
        ],
        pastDuePlans: [
          {
            treatmentPlanId: 'plan-1',
            name: 'Ortodoncia',
            status: 'accepted',
            totalAmount: 1000,
            paidAmount: 0,
            balance: 1000,
            baseDate: '2026-08-30T12:00:00.000Z',
            baseDateSource: 'accepted_at',
            daysPastDue: 31,
            isPastDue: true,
          },
        ],
      },
    ]);

    const res = await GET(
      new Request('http://localhost/api/admin/accounts-receivable?thresholdDays=30')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.accountsReceivable[0].pastDuePlans[0]).toMatchObject({
      treatmentPlanId: 'plan-1',
      daysPastDue: 31,
      isPastDue: true,
    });
  });
});
