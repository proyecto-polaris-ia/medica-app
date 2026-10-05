import { listAccountsReceivable } from '@/lib/admin/accounts-receivable';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { sendWhatsAppTemplateMessage, type WhatsAppSendResult } from '@/lib/whatsapp/client';

export type ReminderCandidate = {
  patientId: string;
  patientName: string;
  patientPhoneE164: string;
  balance: number;
  pastDuePlans: {
    treatmentPlanId: string;
    name: string;
    balance: number;
    daysPastDue: number;
    isPastDue: boolean;
  }[];
};

export type SendPaymentReminderInput = {
  patientId: string;
  treatmentPlanId: string;
  patientPhoneE164: string;
  patientName: string;
  balance: number;
  daysPastDue: number;
  periodKey: string;
  dryRun: boolean;
};

export type SendPaymentReminderResult = {
  reminderKey: string;
  sent: boolean;
  skipped: boolean;
  dryRun?: boolean;
  providerMessageId?: string;
  error?: string;
};

const PAYMENT_REMINDER_COLUMNS = 'id, patient_id, treatment_plan_id, reminder_key, template_name, status, dry_run';

function formatMxMoney(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Build a stable idempotency key for a (patient, plan, period) tuple.
 * `periodKey` is computed by the caller (e.g. ISO week like "2026-W39").
 */
export function buildReminderKey(input: {
  patientId: string;
  treatmentPlanId: string;
  periodKey: string;
}): string {
  return `patient:${input.patientId}:plan:${input.treatmentPlanId}:${input.periodKey}`;
}

/**
 * Pure selection helper over `listAccountsReceivable` output.
 * Keeps only rows that should receive a reminder:
 *  - has at least one `isPastDue` plan, AND
 *  - patient has a phone number, AND
 *  - global balance > 0 (no point reminding a fully-paid or credited patient).
 *
 * Caller is responsible for filtering `opted_out` contacts separately (it is
 * contact-level metadata, not derivable from `listAccountsReceivable`).
 */
export function selectReminderCandidates(rows: ReminderCandidate[]): ReminderCandidate[] {
  return rows.filter((row) => {
    if (row.balance <= 0) return false;
    if (!row.patientPhoneE164 || row.patientPhoneE164.trim().length === 0) return false;
    if (!row.pastDuePlans.some((plan) => plan.isPastDue)) return false;
    return true;
  });
}

async function findExistingReminder(
  reminderKey: string
): Promise<{ id: string; status: string; dry_run: boolean } | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('payment_reminders')
    .select('id, status, dry_run')
    .eq('reminder_key', reminderKey)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as { id: string; status: string; dry_run: boolean } | null) ?? null;
}

async function persistReminderRow(input: {
  patientId: string;
  treatmentPlanId: string;
  reminderKey: string;
  status: 'scheduled' | 'sent' | 'failed';
  dryRun: boolean;
  balanceAtSend: number;
  providerMessageId?: string;
  error?: string;
}): Promise<void> {
  const payload: Record<string, unknown> = {
    patient_id: input.patientId,
    treatment_plan_id: input.treatmentPlanId,
    reminder_key: input.reminderKey,
    template_name: 'recordatorio_pago',
    status: input.status,
    dry_run: input.dryRun,
    balance_at_send: input.balanceAtSend,
  };
  if (input.providerMessageId) {
    payload.provider_message_id = input.providerMessageId;
    payload.sent_at = new Date().toISOString();
  }
  if (input.error) {
    payload.error = input.error;
  }

  const { error } = await getSupabaseAdmin().from('payment_reminders').insert(payload);
  if (error) throw new Error(error.message);
}

/**
 * Deterministic outbound action invoked by `app/api/cron/payment-reminders`.
 * NOT a patient-facing tool — exposed only server-side to prevent template abuse.
 *
 * Idempotent on `reminder_key`: if a row already exists, the call returns
 * `{ sent: false, skipped: true }` and never re-sends.
 */
export async function sendPaymentReminder(
  input: SendPaymentReminderInput
): Promise<SendPaymentReminderResult> {
  const reminderKey = buildReminderKey({
    patientId: input.patientId,
    treatmentPlanId: input.treatmentPlanId,
    periodKey: input.periodKey,
  });

  const existing = await findExistingReminder(reminderKey);
  if (existing) {
    return { reminderKey, sent: false, skipped: true };
  }

  if (input.dryRun) {
    await persistReminderRow({
      patientId: input.patientId,
      treatmentPlanId: input.treatmentPlanId,
      reminderKey,
      status: 'scheduled',
      dryRun: true,
      balanceAtSend: input.balance,
    });
    return { reminderKey, sent: false, skipped: false, dryRun: true };
  }

  const sendResult: WhatsAppSendResult = await sendWhatsAppTemplateMessage({
    to: input.patientPhoneE164,
    templateName: 'recordatorio_pago',
    languageCode: 'es_MX',
    bodyParameters: [
      { type: 'text', text: input.patientName },
      { type: 'text', text: formatMxMoney(input.balance) },
      { type: 'text', text: String(input.daysPastDue) },
    ],
  });

  await persistReminderRow({
    patientId: input.patientId,
    treatmentPlanId: input.treatmentPlanId,
    reminderKey,
    status: sendResult.ok ? 'sent' : 'failed',
    dryRun: false,
    balanceAtSend: input.balance,
    providerMessageId: sendResult.providerMessageId,
    error: sendResult.ok ? undefined : sendResult.error ?? 'send_failed',
  });

  return {
    reminderKey,
    sent: sendResult.ok,
    skipped: false,
    providerMessageId: sendResult.providerMessageId,
    error: sendResult.ok ? undefined : sendResult.error ?? 'send_failed',
  };
}
