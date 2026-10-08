import { getSupabaseAdmin } from '@/lib/supabase/server';

export type PaymentIntentSource = 'whatsapp' | 'manual' | 'discord';
export type PaymentIntentStatus = 'pending' | 'confirmed' | 'fulfilled' | 'cancelled';

export type CreatePaymentIntentInput = {
  patientId: string;
  treatmentPlanId?: string | null;
  whatsappContactId?: string | null;
  amount?: number | null;
  commitmentText?: string | null;
  method?: 'cash' | 'card' | 'transfer' | 'other' | null;
  notes?: string | null;
  source: PaymentIntentSource;
};

export type PaymentIntentRow = {
  id: string;
  patientId: string;
  treatmentPlanId: string | null;
  whatsappContactId: string | null;
  source: PaymentIntentSource;
  amount: number | null;
  commitmentText: string | null;
  method: 'cash' | 'card' | 'transfer' | 'other' | null;
  status: PaymentIntentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

const PAYMENT_INTENT_COLUMNS =
  'id, patient_id, treatment_plan_id, whatsapp_contact_id, intent_source, amount, commitment_text, method, status, notes, created_at, updated_at';

function mapPaymentIntentRow(row: Record<string, unknown>): PaymentIntentRow {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    treatmentPlanId: (row.treatment_plan_id as string | null) ?? null,
    whatsappContactId: (row.whatsapp_contact_id as string | null) ?? null,
    source: row.intent_source as PaymentIntentSource,
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    commitmentText: (row.commitment_text as string | null) ?? null,
    method: (row.method as PaymentIntentRow['method']) ?? null,
    status: row.status as PaymentIntentStatus,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function buildPaymentIntentPayload(input: CreatePaymentIntentInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    patient_id: input.patientId,
    intent_source: input.source,
  };

  if (input.treatmentPlanId !== undefined && input.treatmentPlanId !== null) {
    payload.treatment_plan_id = input.treatmentPlanId;
  }
  if (input.whatsappContactId !== undefined && input.whatsappContactId !== null) {
    payload.whatsapp_contact_id = input.whatsappContactId;
  }
  if (input.amount !== undefined && input.amount !== null) {
    payload.amount = input.amount;
  }
  if (input.commitmentText !== undefined && input.commitmentText !== null) {
    payload.commitment_text = input.commitmentText;
  }
  if (input.method !== undefined && input.method !== null) {
    payload.method = input.method;
  }
  if (input.notes !== undefined && input.notes !== null) {
    payload.notes = input.notes;
  }

  return payload;
}

/**
 * Insert a `payment_intents` row.
 *
 * Mora guardrail: this table NEVER moves money. There is no path that
 * touches `payments` from this module; the actual ledger (`payments`) is
 * only written by the human-facing admin flow in `src/lib/admin/payments.ts`.
 */
export async function createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentRow> {
  const payload = buildPaymentIntentPayload(input);
  const { data, error } = await getSupabaseAdmin()
    .from('payment_intents')
    .insert(payload)
    .select(PAYMENT_INTENT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create payment intent.');
  }

  return mapPaymentIntentRow(data as unknown as Record<string, unknown>);
}