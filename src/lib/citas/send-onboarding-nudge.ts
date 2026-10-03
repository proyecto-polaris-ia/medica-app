import { deriveOnboardingStatus } from '@/lib/admin/onboarding-status';
import type { MedicalHistorySource } from '@/lib/admin/types';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  sendWhatsAppTemplateMessage,
  type WhatsAppSendResult,
  type WhatsAppTemplateParameter,
} from '@/lib/whatsapp/client';
import { isOnboardingNudgeEnabled } from '@/lib/whatsapp/onboarding-flag';
import {
  appointmentReminderPeriod,
  formatPatientFirstName,
  type AppointmentReminderPeriod,
} from './send-appointment-reminder';

/**
 * Nudge de onboarding pendiente (design.md D9, requirement ST-R2).
 *
 * Acción determinista, server-only, invocada por el cron
 * `app/api/cron/appointment-reminders` **después** de que el recordatorio de
 * cita salió (`sent === true`). Es aditiva: no modifica la plantilla
 * `recordatorio_cita` ni su orden de parámetros, ni el archivo congelado
 * `send-appointment-reminder.ts`.
 *
 * Guardrails:
 * - Sólo puede salir por `sendWhatsAppTemplateMessage` (plantilla HSM). **No
 *   existe** camino de texto libre: un fallo del transporte se persiste como
 *   `failed` con `error` y nunca degrada a `sendWhatsAppTextMessage`.
 * - Flag `WHATSAPP_ONBOARDING_NUDGE_ENABLED` default **off** (fail-closed).
 * - `dryRun` fail-closed: persiste `scheduled` sin llamar al proveedor.
 * - Deduplicación idempotente por `reminder_key` (un nudge por paciente por
 *   semana ISO de la cita); `23505` se trata como duplicado.
 * - Respeta `whatsapp_contacts.opt_in_status = 'opted_out'`.
 */

export const ONBOARDING_NUDGE_TEMPLATE_NAME = 'onboarding_pendiente';
const ONBOARDING_NUDGE_TEMPLATE_LANGUAGE = 'es_MX';
const DUPLICATE_KEY_CODE = '23505';

export type SendOnboardingNudgeInput = {
  patientId: string;
  patientName: string;
  patientPhoneE164: string;
  appointmentId: string;
  startAt: string;
  dryRun: boolean;
};

export type SendOnboardingNudgeResult = {
  reminderKey: string;
  sent: boolean;
  skipped: boolean;
  dryRun?: boolean;
  providerMessageId?: string;
  error?: string;
};

/** Llave estable de deduplicación: un nudge por paciente por semana ISO. */
function buildOnboardingNudgeKey(patientId: string, period: AppointmentReminderPeriod): string {
  return `onboarding:${patientId}:${period.isoWeekKey}`;
}

/**
 * Hechos del paciente necesarios para derivar su estado de onboarding.
 * Una fila real nunca llega con `source` null (migración D1); el fallback `null`
 * se conserva por robustez y no cambia el resultado binario.
 */
async function loadOnboardingFacts(
  patientId: string
): Promise<{ historyExists: boolean; source: MedicalHistorySource | null }> {
  const { data, error } = await getSupabaseAdmin()
    .from('patient_medical_history')
    .select('source')
    .eq('patient_id', patientId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const row = data as { source?: MedicalHistorySource | null } | null;
  return { historyExists: row !== null, source: row?.source ?? null };
}

/**
 * `true` si el contacto de WhatsApp del teléfono está dado de baja. Query mínima
 * duplicada a propósito para no exportar la privada `isPhoneOptedOut` del
 * archivo congelado `send-appointment-reminder.ts` (design.md D9).
 */
async function isPhoneOptedOut(phone: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('whatsapp_contacts')
    .select('opt_in_status')
    .eq('phone_e164', phone)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as { opt_in_status?: string } | null)?.opt_in_status === 'opted_out';
}

async function findExistingNudge(reminderKey: string): Promise<{ id: string } | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('onboarding_nudges')
    .select('id, status, dry_run')
    .eq('reminder_key', reminderKey)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as { id: string } | null) ?? null;
}

async function persistNudgeRow(input: {
  patientId: string;
  appointmentId: string;
  reminderKey: string;
  status: 'scheduled' | 'sent' | 'failed';
  dryRun: boolean;
  providerMessageId?: string;
  error?: string;
}): Promise<'inserted' | 'duplicate'> {
  const payload: Record<string, unknown> = {
    patient_id: input.patientId,
    appointment_id: input.appointmentId,
    reminder_key: input.reminderKey,
    template_name: ONBOARDING_NUDGE_TEMPLATE_NAME,
    status: input.status,
    dry_run: input.dryRun,
  };
  if (input.providerMessageId) {
    payload.provider_message_id = input.providerMessageId;
    payload.sent_at = new Date().toISOString();
  }
  if (input.error) {
    payload.error = input.error;
  }

  const { error } = await getSupabaseAdmin().from('onboarding_nudges').insert(payload);
  if (error) {
    // Carrera entre dos corridas sobre la misma llave: idempotente, no es error.
    if ((error as { code?: string }).code === DUPLICATE_KEY_CODE) return 'duplicate';
    throw new Error(error.message);
  }
  return 'inserted';
}

/**
 * Envía (o simula) el nudge de onboarding pendiente para un paciente que acaba
 * de recibir su recordatorio de cita. Idempotente sobre `reminder_key`.
 */
export async function sendOnboardingNudge(
  input: SendOnboardingNudgeInput
): Promise<SendOnboardingNudgeResult> {
  const period = appointmentReminderPeriod(input.startAt);
  const reminderKey = buildOnboardingNudgeKey(input.patientId, period);

  if (!isOnboardingNudgeEnabled()) {
    return { reminderKey, sent: false, skipped: true };
  }

  const facts = await loadOnboardingFacts(input.patientId);
  const status = deriveOnboardingStatus(facts);
  if (status === 'completo') {
    return { reminderKey, sent: false, skipped: true };
  }

  if (await isPhoneOptedOut(input.patientPhoneE164)) {
    return { reminderKey, sent: false, skipped: true };
  }

  if (await findExistingNudge(reminderKey)) {
    return { reminderKey, sent: false, skipped: true };
  }

  if (input.dryRun) {
    const outcome = await persistNudgeRow({
      patientId: input.patientId,
      appointmentId: input.appointmentId,
      reminderKey,
      status: 'scheduled',
      dryRun: true,
    });
    if (outcome === 'duplicate') {
      return { reminderKey, sent: false, skipped: true };
    }
    return { reminderKey, sent: false, skipped: false, dryRun: true };
  }

  const bodyParameters: WhatsAppTemplateParameter[] = [
    { type: 'text', text: formatPatientFirstName(input.patientName) },
  ];

  const sendResult: WhatsAppSendResult = await sendWhatsAppTemplateMessage({
    to: input.patientPhoneE164,
    templateName: ONBOARDING_NUDGE_TEMPLATE_NAME,
    languageCode: ONBOARDING_NUDGE_TEMPLATE_LANGUAGE,
    bodyParameters,
  });

  const errorMessage = sendResult.ok ? undefined : sendResult.error ?? 'send_failed';
  const outcome = await persistNudgeRow({
    patientId: input.patientId,
    appointmentId: input.appointmentId,
    reminderKey,
    status: sendResult.ok ? 'sent' : 'failed',
    dryRun: false,
    providerMessageId: sendResult.providerMessageId,
    error: errorMessage,
  });

  if (outcome === 'duplicate') {
    return { reminderKey, sent: false, skipped: true };
  }

  return {
    reminderKey,
    sent: sendResult.ok,
    skipped: false,
    providerMessageId: sendResult.providerMessageId,
    error: errorMessage,
  };
}
