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
import { createTreatmentPlan } from '../treatment-plans';
import {
  createPayment,
  listPayments,
  reversePayment,
  updatePayment,
} from '../payments';
import { ConflictError, NotFoundError } from '../errors';
import { ValidationError } from '../validate';

/**
 * Suite contra Supabase local (ver openspec/changes/supabase-local-testing).
 * Corre solo con `npm run test:local` (SUPABASE_LOCAL=1 + supabase start);
 * con `npm run test` regular se omite.
 */
const d = localDbEnabled ? describe : describe.skip;

// Usuario de auditoría: `created_by`/`voided_by` son uuid sin FK.
const USER_ID = '880e8400-e29b-41d4-a716-446655440000';
// UUID válido sin fila asociada (el PGRST116 / 0 filas es real).
const MISSING_ID = '00000000-0000-4000-8000-00000000dead';

// Las suites de datos se serializan con un advisory lock (ver
// src/test-utils/local-db.ts) porque vitest corre los archivos en paralelo
// y todas truncan el esquema `public`.

d('payments data layer', () => {
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

  /** Fixtures deterministas vía funciones de dominio. */
  async function seedPatient(
    fullName = 'Juan Pérez',
    phoneE164 = '+5215512345678'
  ) {
    return createPatient({ fullName, phoneE164 });
  }

  async function seedPlan(patientId: string, name = 'Ortodoncia') {
    const provider = await createProvider({ name: 'Dra. Ana' });
    return createTreatmentPlan(patientId, { providerId: provider.id, name });
  }

  /** Lectura cruda de la fila: valida la persistencia más allá del mapper. */
  async function readPaymentRow(
    paymentId: string
  ): Promise<Record<string, unknown>> {
    const { data, error } = await getSupabaseAdmin()
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Payment row ${paymentId} not found`);
    return data as Record<string, unknown>;
  }

  async function countPaymentsForPatient(patientId: string): Promise<number> {
    const { data, error } = await getSupabaseAdmin()
      .from('payments')
      .select('id')
      .eq('patient_id', patientId);
    if (error) throw new Error(error.message);
    return (data ?? []).length;
  }

  it('lists patient payments by paid_at descending and maps snake_case rows', async () => {
    const patient = await seedPatient();
    const otherPatient = await seedPatient('Otro Paciente', '+5215599999999');
    const plan = await seedPlan(patient.id);

    const older = await createPayment(
      patient.id,
      {
        treatmentPlanId: plan.id,
        amount: 100.5,
        method: 'cash',
        paidAt: '2026-09-10T10:00:00Z',
        reference: 'REC-1',
        notes: 'Abono inicial',
      },
      USER_ID
    );
    const newer = await createPayment(
      patient.id,
      {
        amount: 250,
        method: 'transfer',
        paidAt: '2026-09-20T10:00:00Z',
      },
      null
    );
    // Otro paciente: el filtro real `.eq('patient_id')` debe excluirlo.
    await createPayment(
      otherPatient.id,
      { amount: 999, method: 'card', paidAt: '2026-09-25T10:00:00Z' },
      null
    );

    const payments = await listPayments(patient.id);

    expect(payments.map((payment) => payment.id)).toEqual([newer.id, older.id]);
    expect(payments[0]).toMatchObject({
      patientId: patient.id,
      treatmentPlanId: null,
      amount: 250,
      method: 'transfer',
      reference: null,
      notes: null,
      createdBy: null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
    });
    expect(iso(payments[0].paidAt)).toBe('2026-09-20T10:00:00.000Z');
    expect(payments[1]).toMatchObject({
      patientId: patient.id,
      treatmentPlanId: plan.id,
      amount: 100.5,
      method: 'cash',
      reference: 'REC-1',
      notes: 'Abono inicial',
      createdBy: USER_ID,
    });
    expect(iso(payments[1].paidAt)).toBe('2026-09-10T10:00:00.000Z');
  });

  it('creates a payment linked to a treatment plan owned by the patient', async () => {
    const patient = await seedPatient();
    const plan = await seedPlan(patient.id);

    const payment = await createPayment(
      patient.id,
      {
        treatmentPlanId: plan.id,
        amount: 100.5,
        method: 'cash',
        paidAt: '2026-09-15T10:00:00Z',
        reference: ' REC-1 ',
        notes: ' Abono inicial ',
      },
      USER_ID
    );

    expect(payment).toMatchObject({
      patientId: patient.id,
      treatmentPlanId: plan.id,
      amount: 100.5,
      method: 'cash',
      reference: 'REC-1',
      notes: 'Abono inicial',
      createdBy: USER_ID,
      voidedAt: null,
    });
    expect(iso(payment.paidAt)).toBe('2026-09-15T10:00:00.000Z');

    // Outcome observable en la BD: la fila quedó persistida con su FK y trim.
    const row = await readPaymentRow(payment.id);
    expect(row.patient_id).toBe(patient.id);
    expect(row.treatment_plan_id).toBe(plan.id);
    expect(Number(row.amount)).toBe(100.5);
    expect(row.method).toBe('cash');
    expect(row.reference).toBe('REC-1');
    expect(row.notes).toBe('Abono inicial');
    expect(row.created_by).toBe(USER_ID);
  });

  it('creates an unallocated patient payment when no treatment plan is provided', async () => {
    const patient = await seedPatient();

    const payment = await createPayment(
      patient.id,
      {
        amount: 250,
        method: 'transfer',
        paidAt: '2026-09-15T10:00:00Z',
      },
      USER_ID
    );

    expect(payment.treatmentPlanId).toBeNull();
    const row = await readPaymentRow(payment.id);
    expect(row.treatment_plan_id).toBeNull();
    expect(Number(row.amount)).toBe(250);
    expect(row.method).toBe('transfer');
  });

  it('rejects creating a payment for a treatment plan owned by another patient', async () => {
    const patient = await seedPatient();
    const otherPatient = await seedPatient('Otro Paciente', '+5215599999999');
    const otherPlan = await seedPlan(otherPatient.id);

    await expect(
      createPayment(
        patient.id,
        {
          treatmentPlanId: otherPlan.id,
          amount: 100,
          method: 'card',
          paidAt: '2026-09-15T10:00:00Z',
        },
        USER_ID
      )
    ).rejects.toThrow(ValidationError);

    // La validación real corre antes del insert: no queda pago huérfano.
    expect(await countPaymentsForPatient(patient.id)).toBe(0);
    expect(await countPaymentsForPatient(otherPatient.id)).toBe(0);
  });

  it('updates reference and notes for an active payment', async () => {
    const patient = await seedPatient();
    const created = await createPayment(
      patient.id,
      {
        amount: 100.5,
        method: 'cash',
        paidAt: '2026-09-15T10:00:00Z',
        reference: 'REC-1',
        notes: 'Inicial',
      },
      USER_ID
    );

    const payment = await updatePayment(created.id, {
      reference: ' REC-2 ',
      notes: ' Corregido ',
    });

    expect(payment.reference).toBe('REC-2');
    expect(payment.notes).toBe('Corregido');
    const row = await readPaymentRow(created.id);
    expect(row.reference).toBe('REC-2');
    expect(row.notes).toBe('Corregido');
    // El resto de la fila no se toca.
    expect(Number(row.amount)).toBe(100.5);
    expect(row.method).toBe('cash');
    expect(row.voided_at).toBeNull();
  });

  it('rejects updating a reversed payment', async () => {
    const patient = await seedPatient();
    const created = await createPayment(
      patient.id,
      {
        amount: 100.5,
        method: 'cash',
        paidAt: '2026-09-15T10:00:00Z',
        reference: 'REC-1',
      },
      USER_ID
    );
    await reversePayment(created.id, { reason: 'Captura duplicada' }, USER_ID);

    await expect(
      updatePayment(created.id, { reference: 'REC-2' })
    ).rejects.toBeInstanceOf(ConflictError);

    const row = await readPaymentRow(created.id);
    expect(row.reference).toBe('REC-1');
    expect(row.voided_at).toBeTruthy();
  });

  it('reverses an active payment with an auditable reason', async () => {
    const patient = await seedPatient();
    const created = await createPayment(
      patient.id,
      {
        amount: 100.5,
        method: 'cash',
        paidAt: '2026-09-15T10:00:00Z',
      },
      USER_ID
    );

    const payment = await reversePayment(
      created.id,
      { reason: ' Captura duplicada ' },
      USER_ID
    );

    expect(payment.voidReason).toBe('Captura duplicada');
    expect(payment.voidedBy).toBe(USER_ID);
    expect(payment.voidedAt).toBeTruthy();
    expect(
      Number.isNaN(new Date(payment.voidedAt as string).getTime())
    ).toBe(false);
    // El pago sigue visible con su monto, solo queda marcado como reversado.
    expect(payment.amount).toBe(100.5);
    expect(payment.patientId).toBe(patient.id);

    const row = await readPaymentRow(created.id);
    expect(row.void_reason).toBe('Captura duplicada');
    expect(row.voided_by).toBe(USER_ID);
    expect(row.voided_at).toBeTruthy();
  });

  it('rejects reversing a payment twice', async () => {
    const patient = await seedPatient();
    const created = await createPayment(
      patient.id,
      {
        amount: 100.5,
        method: 'cash',
        paidAt: '2026-09-15T10:00:00Z',
      },
      USER_ID
    );
    await reversePayment(created.id, { reason: 'Captura duplicada' }, USER_ID);

    await expect(
      reversePayment(created.id, { reason: 'Segundo intento' }, USER_ID)
    ).rejects.toBeInstanceOf(ConflictError);

    // La reversión original queda intacta (no se sobrescribe la auditoría).
    const row = await readPaymentRow(created.id);
    expect(row.void_reason).toBe('Captura duplicada');
  });

  it('updatePayment throws NotFoundError for a missing payment', async () => {
    await expect(
      updatePayment(MISSING_ID, { reference: 'REC-404' })
    ).rejects.toThrow(NotFoundError);
  });
});
