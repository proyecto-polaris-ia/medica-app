/**
 * Orquestación I/O de las respuestas al recordatorio (issue #87, design.md §3,
 * §7 y §9).
 *
 * Consulta `appointment_reminders` (con embeds a `appointments` y `patients`),
 * empareja el teléfono normalizado en JS, aplica la transición guardada y
 * escala a humano cuando corresponde. La interpretación pura vive en
 * `reminder-reply.ts`; el update de estado en `appointment-status.ts`. Este
 * módulo nunca reclasifica el mensaje ni envía WhatsApps: eso lo hace el hook
 * del pipeline (`inbound-service.ts`).
 */

import { getSupabaseAdmin } from '@/lib/supabase/server';
import { createEveWhatsAppEscalation } from '@/lib/whatsapp/eve-escalation';
import { transitionAppointmentFromReminder } from './appointment-status';
import {
  type ReminderReplyCandidate,
  classifyReminderReply,
  isEligibleReminderReplyCandidate,
  pickEligibleReminderReplyCandidate,
  reminderReplyWindowStart,
} from './reminder-reply';
import {
  buildReminderAlreadyConfirmedReply,
  buildReminderAmbiguityReply,
  buildReminderCancellationAck,
  buildReminderConfirmationAck,
  buildReminderOutOfWindowReply,
} from './reminder-reply-messages';

/** Embeds anidados: recordatorio → cita (`!inner`) → paciente (`!inner`). */
export const REMINDER_REPLY_SELECT =
  'id, appointment_id, sent_at, ' +
  'appointments!inner(id, patient_id, start_at, end_at, status, notes, ' +
  'patients!inner(full_name, phone_e164))';

const REMINDER_REPLY_LIMIT = 10;

export type HandleReminderReplyInput = {
  phone: string;
  message: string;
  providerMessageId: string;
  patientName?: string;
  now?: Date;
};

export type ReminderReplyOutcome =
  | 'confirmation'
  | 'cancellation'
  | 'ambiguous'
  | 'already'
  | 'out_of_window'
  | 'none';

export type HandleReminderReplyResult = {
  handled: boolean;
  outcome: ReminderReplyOutcome;
  responseText: string;
  needsHuman: boolean;
};

type PatientEmbed = { full_name: string | null; phone_e164: string | null };
type AppointmentEmbed = {
  id: string;
  patient_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
  notes: string | null;
  patients: PatientEmbed | PatientEmbed[] | null;
};
type ReminderRow = {
  id: string;
  appointment_id: string;
  sent_at: string | null;
  appointments: AppointmentEmbed | AppointmentEmbed[] | null;
};

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapReminderRow(row: ReminderRow): ReminderReplyCandidate | null {
  const appointment = firstEmbed(row.appointments);
  const patient = firstEmbed(appointment?.patients);
  const patientPhoneE164 = patient?.phone_e164?.trim() ?? '';
  if (!appointment || !row.sent_at || !patientPhoneE164) return null;
  return {
    reminderId: row.id,
    appointmentId: appointment.id,
    sentAt: row.sent_at,
    appointmentStatus: appointment.status as ReminderReplyCandidate['appointmentStatus'],
    patientName: patient?.full_name?.trim() ?? '',
    patientPhoneE164,
    startAt: appointment.start_at,
    endAt: appointment.end_at,
    notes: appointment.notes,
  };
}

/**
 * Candidatas de recordatorio vigente: `status='sent'`, `dry_run=false`,
 * `sent_at >= now - 36h` y cita en estado `requested|pending|confirmed`.
 * `order sent_at desc` + `limit 10`; el emparejamiento de teléfono y la
 * elegibilidad final se resuelven en JS.
 */
async function findRecentReminderCandidates(now: Date): Promise<ReminderReplyCandidate[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('appointment_reminders')
    .select(REMINDER_REPLY_SELECT)
    .eq('status', 'sent')
    .eq('dry_run', false)
    .gte('sent_at', reminderReplyWindowStart(now).toISOString())
    .in('appointments.status', ['requested', 'pending', 'confirmed'])
    .order('sent_at', { ascending: false })
    .limit(REMINDER_REPLY_LIMIT);
  if (error) throw new Error(error.message);

  const candidates: ReminderReplyCandidate[] = [];
  for (const row of (data ?? []) as unknown as ReminderRow[]) {
    const candidate = mapReminderRow(row);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

async function escalate(input: {
  phone: string;
  patientName?: string;
  message: string;
  reason: string;
  priority: 'normal' | 'high';
  idempotencyKey: string;
  occurredAt: Date;
}): Promise<void> {
  await createEveWhatsAppEscalation({
    patientPhone: input.phone,
    profileName: input.patientName,
    reason: input.reason,
    summary: input.message,
    patientMessage: input.message,
    priority: input.priority,
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt.toISOString(),
  });
}

/**
 * Maneja una posible respuesta a recordatorio.
 *
 * - Intención `'none'` → `handled:false` (el pipeline sigue intacto).
 * - Ambigüedad clínica → escalación, **sin** transición.
 * - Confirmación/cancelación elegible → transición + acuse; la cancelación
 *   escala además ofreciendo reagendar.
 * - Confirmación sobre cita ya `confirmed` → acuse corto, sin transición ni
 *   escalación.
 * - Sin candidato elegible (fuera de ventana / sin recordatorio) → escalación
 *   suave `${providerMessageId}:out_of_window`, sin transición.
 */
export async function handleReminderReply(
  input: HandleReminderReplyInput
): Promise<HandleReminderReplyResult> {
  const now = input.now ?? new Date();
  const intent = classifyReminderReply(input.message);

  if (intent === 'none') {
    return { handled: false, outcome: 'none', responseText: '', needsHuman: false };
  }

  if (intent === 'ambiguous') {
    await escalate({
      phone: input.phone,
      patientName: input.patientName,
      message: input.message,
      reason: 'Respuesta ambigua al recordatorio (posible señal clínica)',
      priority: 'high',
      idempotencyKey: `${input.providerMessageId}:ambiguity`,
      occurredAt: now,
    });
    return {
      handled: true,
      outcome: 'ambiguous',
      responseText: buildReminderAmbiguityReply(),
      needsHuman: true,
    };
  }

  const to = intent === 'confirmation' ? 'confirmed' : 'cancelled';
  const candidates = await findRecentReminderCandidates(now);
  const picked = pickEligibleReminderReplyCandidate(candidates, {
    phone: input.phone,
    now,
    to,
  });

  async function outOfWindow(): Promise<HandleReminderReplyResult> {
    await escalate({
      phone: input.phone,
      patientName: input.patientName,
      message: input.message,
      reason: 'Confirmación/Cancelación fuera de la ventana de recordatorio',
      priority: 'normal',
      idempotencyKey: `${input.providerMessageId}:out_of_window`,
      occurredAt: now,
    });
    return {
      handled: true,
      outcome: 'out_of_window',
      responseText: buildReminderOutOfWindowReply(),
      needsHuman: true,
    };
  }

  if (!picked) {
    // Confirmación sobre una cita ya confirmada: acuse corto, sin revertir ni
    // duplicar escalación.
    if (to === 'confirmed') {
      const already = candidates.find(
        (candidate) =>
          candidate.appointmentStatus === 'confirmed' &&
          isEligibleReminderReplyCandidate(candidate, {
            phone: input.phone,
            now,
            to: 'cancelled',
          })
      );
      if (already) {
        return {
          handled: true,
          outcome: 'already',
          responseText: buildReminderAlreadyConfirmedReply({ startAt: already.startAt }),
          needsHuman: false,
        };
      }
    }
    return outOfWindow();
  }

  const transition = await transitionAppointmentFromReminder({
    appointmentId: picked.appointmentId,
    to,
    reasonText: to === 'cancelled' ? input.message : undefined,
    occurredAt: now,
  });

  if (!transition.ok) {
    // Carrera con recepción u otro proceso: no se revierte el estado.
    return outOfWindow();
  }

  if (to === 'confirmed') {
    return {
      handled: true,
      outcome: 'confirmation',
      responseText: buildReminderConfirmationAck({
        startAt: picked.startAt,
        patientName: picked.patientName || input.patientName,
      }),
      needsHuman: false,
    };
  }

  await escalate({
    phone: input.phone,
    patientName: input.patientName,
    message: input.message,
    reason: 'Cancelación desde recordatorio; ofrecer reagendar',
    priority: 'high',
    idempotencyKey: `${input.providerMessageId}:cancellation`,
    occurredAt: now,
  });

  return {
    handled: true,
    outcome: 'cancellation',
    responseText: buildReminderCancellationAck({ startAt: picked.startAt }),
    needsHuman: true,
  };
}
