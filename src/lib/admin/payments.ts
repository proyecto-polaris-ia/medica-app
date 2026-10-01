import { getSupabaseAdmin } from '@/lib/supabase/server';
import { ConflictError, NotFoundError } from './errors';
import type {
  Payment,
  PaymentInput,
  PaymentMethod,
  PaymentReversalInput,
  PaymentUpdateInput,
} from './types';
import {
  parseMoneyPositive,
  parseNotes,
  parseOptionalString,
  parsePaidAt,
  parsePaymentMethod,
  parseUuid,
  parseVoidReason,
  ValidationError,
} from './validate';

const PAYMENT_COLUMNS = [
  'id',
  'patient_id',
  'treatment_plan_id',
  'amount',
  'method',
  'paid_at',
  'reference',
  'notes',
  'created_by',
  'voided_at',
  'voided_by',
  'void_reason',
  'created_at',
  'updated_at',
].join(', ');

function mapPaymentRow(row: Record<string, unknown>): Payment {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    treatmentPlanId: (row.treatment_plan_id as string | null) ?? null,
    amount: Number(row.amount ?? 0),
    method: row.method as PaymentMethod,
    paidAt: row.paid_at as string,
    reference: (row.reference as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    voidedAt: (row.voided_at as string | null) ?? null,
    voidedBy: (row.voided_by as string | null) ?? null,
    voidReason: (row.void_reason as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

async function assertTreatmentPlanBelongsToPatient(
  treatmentPlanId: string,
  patientId: string
): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from('treatment_plans')
    .select('id, patient_id')
    .eq('id', treatmentPlanId)
    .eq('patient_id', patientId)
    .single();

  if (error || !data) {
    throw new ValidationError(
      'treatmentPlanId',
      'Treatment plan does not belong to patient'
    );
  }
}

function normalizeTreatmentPlanId(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return parseUuid(value, 'treatmentPlanId');
}

function buildPaymentPayload(
  patientId: string,
  input: PaymentInput,
  createdBy: string | null
): Record<string, unknown> {
  return {
    patient_id: patientId,
    treatment_plan_id: normalizeTreatmentPlanId(input.treatmentPlanId),
    amount: parseMoneyPositive(input.amount, 'amount'),
    method: parsePaymentMethod(input.method, 'method'),
    paid_at: parsePaidAt(input.paidAt, 'paidAt'),
    reference: parseOptionalString(input.reference),
    notes: parseNotes(input.notes, 'notes'),
    created_by: createdBy,
  };
}

function buildPaymentUpdatePayload(
  input: PaymentUpdateInput
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (input.treatmentPlanId !== undefined) {
    payload.treatment_plan_id = normalizeTreatmentPlanId(input.treatmentPlanId);
  }
  if (input.amount !== undefined) {
    payload.amount = parseMoneyPositive(input.amount, 'amount');
  }
  if (input.method !== undefined) {
    payload.method = parsePaymentMethod(input.method, 'method');
  }
  if (input.paidAt !== undefined) {
    payload.paid_at = parsePaidAt(input.paidAt, 'paidAt');
  }
  if (input.reference !== undefined) {
    payload.reference = parseOptionalString(input.reference);
  }
  if (input.notes !== undefined) {
    payload.notes = parseNotes(input.notes, 'notes');
  }

  return payload;
}

async function getPaymentForMutation(
  paymentId: string
): Promise<{ patientId: string; voidedAt: string | null }> {
  const parsedPaymentId = parseUuid(paymentId, 'paymentId');
  const { data, error } = await getSupabaseAdmin()
    .from('payments')
    .select('id, patient_id, voided_at')
    .eq('id', parsedPaymentId)
    .single();

  if (error || !data) {
    throw new NotFoundError('Payment');
  }

  const row = data as unknown as Record<string, unknown>;
  return {
    patientId: row.patient_id as string,
    voidedAt: (row.voided_at as string | null) ?? null,
  };
}

export async function listPayments(patientId: string): Promise<Payment[]> {
  const parsedPatientId = parseUuid(patientId, 'patientId');
  const { data, error } = await getSupabaseAdmin()
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('patient_id', parsedPatientId)
    .order('paid_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as Record<string, unknown>[]).map(
    mapPaymentRow
  );
}

export async function createPayment(
  patientId: string,
  input: PaymentInput,
  createdBy: string | null
): Promise<Payment> {
  const parsedPatientId = parseUuid(patientId, 'patientId');
  const parsedCreatedBy = createdBy === null ? null : parseUuid(createdBy, 'createdBy');
  const payload = buildPaymentPayload(parsedPatientId, input, parsedCreatedBy);

  if (payload.treatment_plan_id) {
    await assertTreatmentPlanBelongsToPatient(
      payload.treatment_plan_id as string,
      parsedPatientId
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from('payments')
    .insert(payload)
    .select(PAYMENT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create payment');
  }

  return mapPaymentRow(data as unknown as Record<string, unknown>);
}

export async function updatePayment(
  paymentId: string,
  input: PaymentUpdateInput
): Promise<Payment> {
  const parsedPaymentId = parseUuid(paymentId, 'paymentId');
  const current = await getPaymentForMutation(parsedPaymentId);

  if (current.voidedAt) {
    throw new ConflictError('Reversed payments cannot be updated', 'payment_voided');
  }

  const payload = buildPaymentUpdatePayload(input);
  if (payload.treatment_plan_id) {
    await assertTreatmentPlanBelongsToPatient(
      payload.treatment_plan_id as string,
      current.patientId
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from('payments')
    .update(payload)
    .eq('id', parsedPaymentId)
    .select(PAYMENT_COLUMNS)
    .single();

  if (error || !data) {
    throw new NotFoundError('Payment');
  }

  return mapPaymentRow(data as unknown as Record<string, unknown>);
}

export async function reversePayment(
  paymentId: string,
  input: PaymentReversalInput,
  voidedBy: string | null
): Promise<Payment> {
  const parsedPaymentId = parseUuid(paymentId, 'paymentId');
  const current = await getPaymentForMutation(parsedPaymentId);

  if (current.voidedAt) {
    throw new ConflictError('Payment is already reversed', 'payment_voided');
  }

  const parsedVoidedBy = voidedBy === null ? null : parseUuid(voidedBy, 'voidedBy');
  const payload = {
    voided_at: new Date().toISOString(),
    voided_by: parsedVoidedBy,
    void_reason: parseVoidReason(input.reason, 'reason'),
  };

  const { data, error } = await getSupabaseAdmin()
    .from('payments')
    .update(payload)
    .eq('id', parsedPaymentId)
    .select(PAYMENT_COLUMNS)
    .single();

  if (error || !data) {
    throw new NotFoundError('Payment');
  }

  return mapPaymentRow(data as unknown as Record<string, unknown>);
}
