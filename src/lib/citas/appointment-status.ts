/**
 * Transición de estado acotada para las respuestas al recordatorio (issue #87,
 * design.md §4). Update **status-only** guardado por el estado de origen.
 *
 * No se reutiliza `updateAppointment` (`src/lib/admin/appointments.ts`): exige
 * un `AppointmentInput` completo y sobrescribiría la fila. Aquí sólo se escribe
 * `status` y el rastro de `notes`.
 */

import { getSupabaseAdmin } from '@/lib/supabase/server';
import { buildTransitionStamp } from '@/lib/admin/metrics/transitions';
import {
  CANCEL_ALLOWED_FROM,
  CONFIRM_ALLOWED_FROM,
  appendReminderReplyNotes,
  buildReminderReplyNotesEntry,
} from './reminder-reply';

export type ReminderReplyTransitionResult =
  | { ok: true; status: 'confirmed' | 'cancelled' }
  | { ok: false; reason: 'not_found' | 'ineligible_status' };

type AppointmentRow = { id: string; status: string; notes: string | null };

function allowedFrom(to: 'confirmed' | 'cancelled'): readonly string[] {
  return to === 'confirmed' ? CONFIRM_ALLOWED_FROM : CANCEL_ALLOWED_FROM;
}

/**
 * Lee la cita, valida el estado de origen y aplica un `UPDATE ... WHERE id = ?
 * AND status IN (allowed)`. Idempotente: una cita ya `confirmed`/`cancelled`
 * (o terminal) no se revierte. Si el update afecta 0 filas (carrera) relee y
 * devuelve `ineligible_status`.
 */
export async function transitionAppointmentFromReminder(input: {
  appointmentId: string;
  to: 'confirmed' | 'cancelled';
  reasonText?: string;
  occurredAt: Date;
}): Promise<ReminderReplyTransitionResult> {
  const allowed = allowedFrom(input.to);

  const { data, error } = await getSupabaseAdmin()
    .from('appointments')
    .select('id, status, notes')
    .eq('id', input.appointmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = (data as AppointmentRow | null) ?? null;
  if (!row) return { ok: false, reason: 'not_found' };
  if (!allowed.includes(row.status)) return { ok: false, reason: 'ineligible_status' };

  const notes = appendReminderReplyNotes(
    row.notes,
    buildReminderReplyNotesEntry({
      to: input.to,
      occurredAt: input.occurredAt,
      reasonText: input.reasonText,
    })
  );

  const { data: updated, error: updateError } = await getSupabaseAdmin()
    .from('appointments')
    .update({
      status: input.to,
      notes,
      // Estampado de transición en la misma sentencia que el cambio de estado.
      ...buildTransitionStamp(input.to, input.occurredAt),
    })
    .eq('id', input.appointmentId)
    .in('status', allowed as unknown as string[])
    .select('id');
  if (updateError) throw new Error(updateError.message);

  if (!updated || (updated as unknown[]).length === 0) {
    const { data: after } = await getSupabaseAdmin()
      .from('appointments')
      .select('id, status, notes')
      .eq('id', input.appointmentId)
      .maybeSingle();
    return after
      ? { ok: false, reason: 'ineligible_status' }
      : { ok: false, reason: 'not_found' };
  }

  return { ok: true, status: input.to };
}
