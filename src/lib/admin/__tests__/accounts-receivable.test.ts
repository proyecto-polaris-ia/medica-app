import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  getPatientReceivableSummary,
  listAccountsReceivable,
} from '../accounts-receivable';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_PATIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const PLAN_ID = '660e8400-e29b-41d4-a716-446655440000';
const SECOND_PLAN_ID = '660e8400-e29b-41d4-a716-446655440001';
const NOW = new Date('2026-09-30T12:00:00.000Z');

type QueryResult = { data: Record<string, unknown>[]; error: { message?: string } | null };

function buildQuery() {
  const query: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    _result: QueryResult;
  } = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn(),
    _result: { data: [], error: null },
  };
  query.order.mockImplementation(() => Promise.resolve(query._result));
  return query;
}

type Query = ReturnType<typeof buildQuery>;

function mockClientByTable(queues: Record<string, Query[]>) {
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

function planRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    patient_id: PATIENT_ID,
    name: 'Ortodoncia',
    status: 'accepted',
    total_amount: 1000,
    accepted_at: '2026-08-30T12:00:00.000Z',
    created_at: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '770e8400-e29b-41d4-a716-446655440000',
    patient_id: PATIENT_ID,
    treatment_plan_id: PLAN_ID,
    amount: 250,
    paid_at: '2026-09-20T10:00:00.000Z',
    voided_at: null,
    ...overrides,
  };
}

function patientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PATIENT_ID,
    full_name: 'María López',
    phone_e164: '+5215512345678',
    ...overrides,
  };
}

function setupSummaryQueries(plans: Record<string, unknown>[], payments: Record<string, unknown>[]) {
  const plansQuery = buildQuery();
  plansQuery._result = { data: plans, error: null };
  const paymentsQuery = buildQuery();
  paymentsQuery._result = { data: payments, error: null };
  mockClientByTable({ treatment_plans: [plansQuery], payments: [paymentsQuery] });
  return { plansQuery, paymentsQuery };
}

describe('accounts receivable data layer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('keeps the full global balance when a patient has eligible plans without payments', async () => {
    setupSummaryQueries([planRow({ total_amount: 1500 })], []);

    const summary = await getPatientReceivableSummary(PATIENT_ID, { now: NOW });

    expect(summary.totalEligibleAmount).toBe(1500);
    expect(summary.paidAmount).toBe(0);
    expect(summary.balance).toBe(1500);
    expect(summary.creditAmount).toBe(0);
  });

  it('reduces the global balance with linked and unallocated active payments', async () => {
    setupSummaryQueries(
      [planRow({ total_amount: 1500 })],
      [paymentRow({ amount: 300 }), paymentRow({ treatment_plan_id: null, amount: 200 })]
    );

    const summary = await getPatientReceivableSummary(PATIENT_ID, { now: NOW });

    expect(summary.paidAmount).toBe(500);
    expect(summary.unallocatedPaidAmount).toBe(200);
    expect(summary.balance).toBe(1000);
    expect(summary.planBalances[0].paidAmount).toBe(300);
    expect(summary.planBalances[0].balance).toBe(1200);
  });

  it('excludes reversed payments from derived balances', async () => {
    const { paymentsQuery } = setupSummaryQueries(
      [planRow({ total_amount: 1500 })],
      [paymentRow({ amount: 500, voided_at: '2026-09-21T10:00:00.000Z' })]
    );

    const summary = await getPatientReceivableSummary(PATIENT_ID, { now: NOW });

    expect(paymentsQuery.is).toHaveBeenCalledWith('voided_at', null);
    expect(summary.balance).toBe(1500);
  });

  it('includes only eligible plan statuses and excludes draft, presented, and cancelled plans', async () => {
    setupSummaryQueries(
      [
        planRow({ id: 'accepted-plan', status: 'accepted', total_amount: 100 }),
        planRow({ id: 'progress-plan', status: 'in_progress', total_amount: 200 }),
        planRow({ id: 'completed-plan', status: 'completed', total_amount: 300 }),
      ],
      []
    );

    const summary = await getPatientReceivableSummary(PATIENT_ID, { now: NOW });

    expect(summary.totalEligibleAmount).toBe(600);
    expect(summary.planBalances.map((plan) => plan.status)).toEqual([
      'accepted',
      'in_progress',
      'completed',
    ]);
  });

  it('does not apply unallocated payments to individual plan balances', async () => {
    setupSummaryQueries(
      [planRow({ total_amount: 1000 })],
      [paymentRow({ treatment_plan_id: null, amount: 250 })]
    );

    const summary = await getPatientReceivableSummary(PATIENT_ID, { now: NOW });

    expect(summary.balance).toBe(750);
    expect(summary.planBalances[0].balance).toBe(1000);
  });

  it('shows global and plan credits when active payments exceed eligible totals', async () => {
    setupSummaryQueries(
      [planRow({ total_amount: 1000 })],
      [paymentRow({ amount: 1200 })]
    );

    const summary = await getPatientReceivableSummary(PATIENT_ID, { now: NOW });

    expect(summary.balance).toBe(-200);
    expect(summary.creditAmount).toBe(200);
    expect(summary.planBalances[0].balance).toBe(-200);
  });

  it('preserves cent precision and exact zero balances', async () => {
    setupSummaryQueries(
      [
        planRow({ id: PLAN_ID, total_amount: 301.5 }),
        planRow({ id: SECOND_PLAN_ID, total_amount: 500 }),
      ],
      [
        paymentRow({ treatment_plan_id: PLAN_ID, amount: 100.25 }),
        paymentRow({ treatment_plan_id: PLAN_ID, amount: 50.1 }),
        paymentRow({ treatment_plan_id: SECOND_PLAN_ID, amount: 300 }),
        paymentRow({ treatment_plan_id: SECOND_PLAN_ID, amount: 200 }),
      ]
    );

    const summary = await getPatientReceivableSummary(PATIENT_ID, { now: NOW });

    expect(summary.planBalances.find((plan) => plan.treatmentPlanId === PLAN_ID)?.balance).toBe(151.15);
    expect(summary.planBalances.find((plan) => plan.treatmentPlanId === SECOND_PLAN_ID)?.balance).toBe(0);
  });

  it('marks past due plans from accepted_at and falls back to created_at when accepted_at is missing', async () => {
    setupSummaryQueries(
      [
        planRow({ id: PLAN_ID, accepted_at: '2026-08-30T12:00:00.000Z' }),
        planRow({
          id: SECOND_PLAN_ID,
          accepted_at: null,
          created_at: '2026-08-16T12:00:00.000Z',
        }),
      ],
      []
    );

    const summary = await getPatientReceivableSummary(PATIENT_ID, { now: NOW });

    expect(summary.planBalances[0]).toMatchObject({
      baseDateSource: 'accepted_at',
      daysPastDue: 31,
      isPastDue: true,
    });
    expect(summary.planBalances[1]).toMatchObject({
      baseDateSource: 'created_at',
      daysPastDue: 45,
      isPastDue: true,
    });
  });

  it('uses configurable thresholds and never marks paid plans as past due', async () => {
    setupSummaryQueries(
      [planRow({ total_amount: 500, accepted_at: '2026-09-10T12:00:00.000Z' })],
      [paymentRow({ amount: 500 })]
    );

    const paidSummary = await getPatientReceivableSummary(PATIENT_ID, {
      now: NOW,
      thresholdDays: 15,
    });

    expect(paidSummary.planBalances[0]).toMatchObject({
      balance: 0,
      daysPastDue: 20,
      isPastDue: false,
    });
  });

  it('lists only patients with positive balances and highlights past due plans', async () => {
    const plansQuery = buildQuery();
    plansQuery._result = {
      data: [
        planRow({ patient_id: PATIENT_ID, total_amount: 1000, accepted_at: '2026-08-30T12:00:00.000Z' }),
        planRow({ id: SECOND_PLAN_ID, patient_id: OTHER_PATIENT_ID, total_amount: 500 }),
      ],
      error: null,
    };
    const paymentsQuery = buildQuery();
    paymentsQuery._result = {
      data: [paymentRow({ patient_id: OTHER_PATIENT_ID, treatment_plan_id: SECOND_PLAN_ID, amount: 600 })],
      error: null,
    };
    const patientsQuery = buildQuery();
    patientsQuery._result = {
      data: [patientRow(), patientRow({ id: OTHER_PATIENT_ID, full_name: 'Paciente con crédito' })],
      error: null,
    };
    mockClientByTable({
      treatment_plans: [plansQuery],
      payments: [paymentsQuery],
      patients: [patientsQuery],
    });

    const rows = await listAccountsReceivable({ now: NOW });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      patientId: PATIENT_ID,
      patientName: 'María López',
      balance: 1000,
    });
    expect(rows[0].pastDuePlans).toHaveLength(1);
    expect(rows[0].pastDuePlans[0].isPastDue).toBe(true);
  });
});
