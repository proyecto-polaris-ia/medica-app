import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDbSuiteLock,
  applyLocalDbEnv,
  localDbEnabled,
  releaseDbSuiteLock,
  truncateAllTables,
} from '@/test-utils/local-db';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { createPatient } from '../patients';
import { createProvider } from '../providers';
import { createPayment, reversePayment } from '../payments';
import {
  getPatientReceivableSummary,
  listAccountsReceivable,
} from '../accounts-receivable';
import { ValidationError } from '../validate';
import type { TreatmentPlanStatus } from '../types';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? describe : describe.skip;

const NOW = new Date('2026-09-30T12:00:00.000Z');

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

d('accounts receivable data layer', () => {
  beforeAll(async () => {
    applyLocalDbEnv();
    await acquireDbSuiteLock();
  });

  afterAll(async () => {
    await releaseDbSuiteLock();
  });

  beforeEach(async () => {
    await truncateAllTables();
  });

  const iso = (value: string) => new Date(value).toISOString();

  /** Fixtures deterministas vía funciones de dominio (patient/provider/payment). */
  async function seedPatient(
    fullName = 'María López',
    phoneE164 = '+5215512345678'
  ) {
    return createPatient({ fullName, phoneE164 });
  }

  async function seedProvider(name = 'Dra. Ana') {
    return createProvider({ name });
  }

  /**
   * Inserción directa de planes con valores explícitos. Las funciones de
   * dominio no permiten fijar `total_amount`, `accepted_at` ni `created_at`
   * (el monto sale de los ítems y las fechas del reloj real), y estos tests
   * dependen de esos tres valores para ser deterministas. `patient_id` y
   * `provider_id` sí vienen de las funciones de dominio.
   */
  async function insertPlan(input: {
    patientId: string;
    providerId: string;
    name?: string;
    status?: TreatmentPlanStatus;
    totalAmount: number;
    acceptedAt?: string | null;
    createdAt?: string;
  }): Promise<string> {
    const { data, error } = await getSupabaseAdmin()
      .from('treatment_plans')
      .insert({
        patient_id: input.patientId,
        provider_id: input.providerId,
        name: input.name ?? 'Ortodoncia',
        status: input.status ?? 'accepted',
        total_amount: input.totalAmount,
        accepted_at: input.acceptedAt ?? null,
        created_at: input.createdAt ?? new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to insert treatment plan');
    }
    return data.id as string;
  }

  async function addPayment(input: {
    patientId: string;
    treatmentPlanId?: string | null;
    amount: number;
    paidAt: string;
    method?: 'cash' | 'card' | 'transfer' | 'other';
  }) {
    return createPayment(
      input.patientId,
      {
        treatmentPlanId: input.treatmentPlanId ?? null,
        amount: input.amount,
        method: input.method ?? 'cash',
        paidAt: input.paidAt,
      },
      null
    );
  }

  async function readPaymentRow(
    paymentId: string
  ): Promise<Record<string, unknown>> {
    const { data, error } = await getSupabaseAdmin()
      .from('payments')
      .select('id, voided_at')
      .eq('id', paymentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Payment row ${paymentId} not found`);
    return data as Record<string, unknown>;
  }

  it('keeps the full global balance when a patient has eligible plans without payments', async () => {
    const patient = await seedPatient();
    const provider = await seedProvider();
    await insertPlan({
      patientId: patient.id,
      providerId: provider.id,
      totalAmount: 1500,
      acceptedAt: '2026-08-30T12:00:00Z',
      createdAt: '2026-08-01T12:00:00Z',
    });

    const summary = await getPatientReceivableSummary(patient.id, { now: NOW });

    expect(summary.totalEligibleAmount).toBe(1500);
    expect(summary.paidAmount).toBe(0);
    expect(summary.balance).toBe(1500);
    expect(summary.creditAmount).toBe(0);
    expect(summary.lastPaymentAt).toBeNull();
    expect(summary.planBalances).toHaveLength(1);
  });

  it('reduces the global balance with linked and unallocated active payments', async () => {
    const patient = await seedPatient();
    const provider = await seedProvider();
    const plan = await insertPlan({
      patientId: patient.id,
      providerId: provider.id,
      totalAmount: 1500,
      acceptedAt: '2026-08-30T12:00:00Z',
      createdAt: '2026-08-01T12:00:00Z',
    });
    await addPayment({
      patientId: patient.id,
      treatmentPlanId: plan,
      amount: 300,
      paidAt: '2026-09-20T10:00:00Z',
    });
    await addPayment({
      patientId: patient.id,
      amount: 200,
      paidAt: '2026-09-21T10:00:00Z',
      method: 'transfer',
    });

    const summary = await getPatientReceivableSummary(patient.id, { now: NOW });

    expect(summary.paidAmount).toBe(500);
    expect(summary.unallocatedPaidAmount).toBe(200);
    expect(summary.balance).toBe(1000);
    expect(summary.planBalances[0].paidAmount).toBe(300);
    expect(summary.planBalances[0].balance).toBe(1200);
    // `lastPaymentAt` es el pago activo más reciente.
    expect(iso(summary.lastPaymentAt as string)).toBe('2026-09-21T10:00:00.000Z');
  });

  it('excludes reversed payments from derived balances', async () => {
    const patient = await seedPatient();
    const provider = await seedProvider();
    const plan = await insertPlan({
      patientId: patient.id,
      providerId: provider.id,
      totalAmount: 1500,
      acceptedAt: '2026-08-30T12:00:00Z',
      createdAt: '2026-08-01T12:00:00Z',
    });
    const payment = await addPayment({
      patientId: patient.id,
      treatmentPlanId: plan,
      amount: 500,
      paidAt: '2026-09-20T10:00:00Z',
    });
    await reversePayment(payment.id, { reason: 'Captura duplicada' }, null);

    const summary = await getPatientReceivableSummary(patient.id, { now: NOW });

    expect(summary.paidAmount).toBe(0);
    expect(summary.balance).toBe(1500);
    expect(summary.planBalances[0].paidAmount).toBe(0);
    // La fila sigue existiendo, solo queda excluida por `voided_at`.
    const row = await readPaymentRow(payment.id);
    expect(row.voided_at).toBeTruthy();
  });

  it('includes only eligible plan statuses and excludes draft, presented, and cancelled plans', async () => {
    const patient = await seedPatient();
    const provider = await seedProvider();
    // Excluidos: llevan un monto imposible de confundir (999 cada uno).
    for (const [index, status] of (
      ['draft', 'presented', 'cancelled'] as TreatmentPlanStatus[]
    ).entries()) {
      await insertPlan({
        patientId: patient.id,
        providerId: provider.id,
        status,
        totalAmount: 999,
        createdAt: `2026-08-0${index + 1}T12:00:00Z`,
      });
    }
    // Elegibles, con `created_at` descendente para ordenar la salida.
    await insertPlan({
      patientId: patient.id,
      providerId: provider.id,
      status: 'completed',
      totalAmount: 300,
      createdAt: '2026-09-01T12:00:00Z',
    });
    await insertPlan({
      patientId: patient.id,
      providerId: provider.id,
      status: 'in_progress',
      totalAmount: 200,
      createdAt: '2026-09-02T12:00:00Z',
    });
    await insertPlan({
      patientId: patient.id,
      providerId: provider.id,
      status: 'accepted',
      totalAmount: 100,
      createdAt: '2026-09-03T12:00:00Z',
    });

    const summary = await getPatientReceivableSummary(patient.id, { now: NOW });

    expect(summary.totalEligibleAmount).toBe(600);
    expect(summary.planBalances.map((plan) => plan.status)).toEqual([
      'accepted',
      'in_progress',
      'completed',
    ]);
    expect(summary.planBalances.map((plan) => plan.totalAmount)).toEqual([
      100, 200, 300,
    ]);
  });

  it('does not apply unallocated payments to individual plan balances', async () => {
    const patient = await seedPatient();
    const provider = await seedProvider();
    await insertPlan({
      patientId: patient.id,
      providerId: provider.id,
      totalAmount: 1000,
      acceptedAt: '2026-08-30T12:00:00Z',
      createdAt: '2026-08-01T12:00:00Z',
    });
    await addPayment({
      patientId: patient.id,
      amount: 250,
      paidAt: '2026-09-20T10:00:00Z',
    });

    const summary = await getPatientReceivableSummary(patient.id, { now: NOW });

    expect(summary.balance).toBe(750);
    expect(summary.unallocatedPaidAmount).toBe(250);
    expect(summary.planBalances[0].balance).toBe(1000);
    expect(summary.planBalances[0].paidAmount).toBe(0);
  });

  it('shows global and plan credits when active payments exceed eligible totals', async () => {
    const patient = await seedPatient();
    const provider = await seedProvider();
    const plan = await insertPlan({
      patientId: patient.id,
      providerId: provider.id,
      totalAmount: 1000,
      acceptedAt: '2026-08-30T12:00:00Z',
      createdAt: '2026-08-01T12:00:00Z',
    });
    await addPayment({
      patientId: patient.id,
      treatmentPlanId: plan,
      amount: 1200,
      paidAt: '2026-09-20T10:00:00Z',
    });

    const summary = await getPatientReceivableSummary(patient.id, { now: NOW });

    expect(summary.balance).toBe(-200);
    expect(summary.creditAmount).toBe(200);
    expect(summary.planBalances[0].balance).toBe(-200);
  });

  it('preserves cent precision and exact zero balances', async () => {
    const patient = await seedPatient();
    const provider = await seedProvider();
    const firstPlan = await insertPlan({
      patientId: patient.id,
      providerId: provider.id,
      totalAmount: 301.5,
      acceptedAt: '2026-08-30T12:00:00Z',
      createdAt: '2026-08-01T12:00:00Z',
    });
    const secondPlan = await insertPlan({
      patientId: patient.id,
      providerId: provider.id,
      totalAmount: 500,
      acceptedAt: '2026-08-30T12:00:00Z',
      createdAt: '2026-08-02T12:00:00Z',
    });
    await addPayment({
      patientId: patient.id,
      treatmentPlanId: firstPlan,
      amount: 100.25,
      paidAt: '2026-09-20T10:00:00Z',
    });
    await addPayment({
      patientId: patient.id,
      treatmentPlanId: firstPlan,
      amount: 50.1,
      paidAt: '2026-09-21T10:00:00Z',
    });
    await addPayment({
      patientId: patient.id,
      treatmentPlanId: secondPlan,
      amount: 300,
      paidAt: '2026-09-22T10:00:00Z',
    });
    await addPayment({
      patientId: patient.id,
      treatmentPlanId: secondPlan,
      amount: 200,
      paidAt: '2026-09-23T10:00:00Z',
    });

    const summary = await getPatientReceivableSummary(patient.id, { now: NOW });

    expect(
      summary.planBalances.find((plan) => plan.treatmentPlanId === firstPlan)
        ?.balance
    ).toBe(151.15);
    const secondBalance = summary.planBalances.find(
      (plan) => plan.treatmentPlanId === secondPlan
    );
    expect(secondBalance?.balance).toBe(0);
    expect(secondBalance?.isPastDue).toBe(false);
    // 801.50 total elegible - 650.35 pagado.
    expect(summary.balance).toBe(151.15);
  });

  it('marks past due plans from accepted_at and falls back to created_at when accepted_at is missing', async () => {
    const patient = await seedPatient();
    const provider = await seedProvider();
    const acceptedPlan = await insertPlan({
      patientId: patient.id,
      providerId: provider.id,
      totalAmount: 1000,
      acceptedAt: '2026-08-30T12:00:00Z',
      createdAt: '2026-09-01T12:00:00Z',
    });
    const createdPlan = await insertPlan({
      patientId: patient.id,
      providerId: provider.id,
      totalAmount: 500,
      acceptedAt: null,
      createdAt: '2026-08-16T12:00:00Z',
    });

    const summary = await getPatientReceivableSummary(patient.id, { now: NOW });

    expect(summary.planBalances[0]).toMatchObject({
      treatmentPlanId: acceptedPlan,
      baseDateSource: 'accepted_at',
      daysPastDue: 31,
      isPastDue: true,
    });
    expect(summary.planBalances[1]).toMatchObject({
      treatmentPlanId: createdPlan,
      baseDateSource: 'created_at',
      daysPastDue: 45,
      isPastDue: true,
    });
  });

  it('uses configurable thresholds and never marks paid plans as past due', async () => {
    const patient = await seedPatient();
    const provider = await seedProvider();
    const plan = await insertPlan({
      patientId: patient.id,
      providerId: provider.id,
      totalAmount: 500,
      acceptedAt: '2026-09-10T12:00:00Z',
      createdAt: '2026-09-10T12:00:00Z',
    });
    await addPayment({
      patientId: patient.id,
      treatmentPlanId: plan,
      amount: 500,
      paidAt: '2026-09-20T10:00:00Z',
    });

    const paidSummary = await getPatientReceivableSummary(patient.id, {
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
    const patient = await seedPatient('María López', '+5215512345678');
    const creditPatient = await seedPatient(
      'Paciente con crédito',
      '+5215599999999'
    );
    const higherBalancePatient = await seedPatient(
      'Carmen Ruiz',
      '+5215588888888'
    );
    const provider = await seedProvider();

    const pastDuePlan = await insertPlan({
      patientId: patient.id,
      providerId: provider.id,
      totalAmount: 1000,
      acceptedAt: '2026-08-30T12:00:00Z',
      createdAt: '2026-08-01T12:00:00Z',
    });
    const creditPlan = await insertPlan({
      patientId: creditPatient.id,
      providerId: provider.id,
      totalAmount: 500,
      acceptedAt: '2026-08-30T12:00:00Z',
      createdAt: '2026-08-02T12:00:00Z',
    });
    await addPayment({
      patientId: creditPatient.id,
      treatmentPlanId: creditPlan,
      amount: 600,
      paidAt: '2026-09-20T10:00:00Z',
    });
    await insertPlan({
      patientId: higherBalancePatient.id,
      providerId: provider.id,
      totalAmount: 2000,
      acceptedAt: '2026-09-01T12:00:00Z',
      createdAt: '2026-08-03T12:00:00Z',
    });

    const rows = await listAccountsReceivable({ now: NOW });

    // Orden por balance descendente; el paciente con crédito queda fuera.
    expect(rows.map((row) => row.patientId)).toEqual([
      higherBalancePatient.id,
      patient.id,
    ]);
    const row = rows.find((item) => item.patientId === patient.id);
    expect(row).toMatchObject({
      patientId: patient.id,
      patientName: 'María López',
      patientPhoneE164: '+5215512345678',
      balance: 1000,
    });
    expect(row?.pastDuePlans).toHaveLength(1);
    expect(row?.pastDuePlans[0]).toMatchObject({
      treatmentPlanId: pastDuePlan,
      isPastDue: true,
    });
    expect(rows.find((item) => item.patientId === creditPatient.id)).toBeUndefined();
  });

  it('throws ValidationError for an invalid patient id', async () => {
    await expect(
      getPatientReceivableSummary('bad-id', { now: NOW })
    ).rejects.toThrow(ValidationError);
  });
});
