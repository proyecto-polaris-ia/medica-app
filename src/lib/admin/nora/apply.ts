/**
 * Ruta de aplicación de sugerencias de reacomodo (change
 * `nora-agenda-productiva`, Fase 2, design.md §5).
 *
 * Única superficie que muta agenda a partir de una sugerencia, y lo hace
 * **exclusivamente** mediante `rescheduleAppointment`
 * (`src/lib/booking/reschedule.ts`). Ciclo de vida:
 * `proposed → accepted → applied`, o bien `proposed → expired`, o bien
 * `proposed → rejected` (esta última sin tocar la cita).
 *
 * Garantías:
 * - Guarda optimista: solo la primera decisión sobre `proposed` gana.
 * - Si la cita cambió de horario desde la propuesta, la sugerencia expira.
 * - Un conflicto `23P01` no aplica ni sobrescribe: la sugerencia queda
 *   `accepted` para revisión humana.
 * - El rastro de auditoría se anexa a `appointments.notes` con la hora de la
 *   clínica, sin sobrescribir el contenido previo.
 */

import { rescheduleAppointment } from '@/lib/booking/reschedule';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { CLINIC_TZ, clinicDayKey, clinicTimeLabel } from '../timezone';

const SUGGESTION_COLUMNS =
  'id, appointment_id, provider_id, original_start_at, original_end_at, suggested_start_at, suggested_end_at, status, reason_code, created_at, decided_by, decided_at';
const APPOINTMENT_COLUMNS =
  'id, patient_id, service_id, provider_id, start_at, end_at, status, notes';

export type ApplyResult =
  | { ok: true; appointmentId: string }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'already_decided'
        | 'expired'
        | 'conflict'
        | 'invalid_status';
    };

export type RejectResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'already_decided' };

type SuggestionRow = {
  id: string;
  appointment_id: string;
  provider_id: string;
  original_start_at: string;
  original_end_at: string;
  suggested_start_at: string;
  suggested_end_at: string;
  status: string;
};

type AppointmentRow = {
  id: string;
  patient_id: string | null;
  service_id: string;
  provider_id: string;
  start_at: string;
  end_at: string;
  status: string;
  notes: string | null;
};

/** `timestamptz` de PostgREST → ISO canónico para comparar instantes. */
function iso(value: string): string {
  return new Date(value).toISOString();
}

/** Marca de tiempo legible en la zona de la clínica (nunca UTC del server). */
function clinicStamp(occurredAt: Date): string {
  const instant = occurredAt.toISOString();
  return `${clinicDayKey(instant)} ${clinicTimeLabel(instant)} ${CLINIC_TZ}`;
}

/** Anexa (nunca sobrescribe) el rastro de auditoría a las notas existentes. */
function appendAuditTrail(
  existingNotes: string | null,
  input: {
    suggestionId: string;
    occurredAt: Date;
    originalStartAt: string;
    suggestedStartAt: string;
  }
): string {
  const line = `[${clinicStamp(input.occurredAt)}] Reacomodo aplicado (sugerencia ${
    input.suggestionId
  }): ${clinicTimeLabel(input.originalStartAt)} → ${clinicTimeLabel(
    input.suggestedStartAt
  )}`;
  const base = typeof existingNotes === 'string' ? existingNotes.trim() : '';
  return base ? `${base}\n${line}` : line;
}

/**
 * Acepta y aplica una sugerencia. Devuelve `ok:true` solo cuando la
 * reprogramación tuvo éxito y la sugerencia quedó `applied`.
 */
export async function applyAcceptedSuggestion(input: {
  suggestionId: string;
  decidedBy: string;
  occurredAt: Date;
}): Promise<ApplyResult> {
  const supabase = getSupabaseAdmin();

  // 1. Guarda optimista: solo la primera decisión sobre `proposed` gana.
  const { data: accepted, error: acceptError } = await supabase
    .from('nora_reschedule_suggestions')
    .update({
      status: 'accepted',
      decided_by: input.decidedBy,
      decided_at: input.occurredAt.toISOString(),
    })
    .eq('id', input.suggestionId)
    .eq('status', 'proposed')
    .select(SUGGESTION_COLUMNS)
    .maybeSingle();

  if (acceptError) {
    throw new Error(`Failed to accept suggestion: ${acceptError.message}`);
  }

  if (!accepted) {
    const { data: existing, error: readError } = await supabase
      .from('nora_reschedule_suggestions')
      .select('id')
      .eq('id', input.suggestionId)
      .maybeSingle();
    if (readError) {
      throw new Error(`Failed to read suggestion: ${readError.message}`);
    }
    return { ok: false, reason: existing ? 'already_decided' : 'not_found' };
  }

  const suggestion = accepted as SuggestionRow;

  const expire = async (): Promise<ApplyResult> => {
    await supabase
      .from('nora_reschedule_suggestions')
      .update({ status: 'expired' })
      .eq('id', input.suggestionId)
      .eq('status', 'accepted');
    return { ok: false, reason: 'expired' };
  };

  // 2. Releer la cita: si cambió de horario desde la propuesta, expira.
  const { data: appointmentRow, error: appointmentError } = await supabase
    .from('appointments')
    .select(APPOINTMENT_COLUMNS)
    .eq('id', suggestion.appointment_id)
    .maybeSingle();

  if (appointmentError) {
    throw new Error(`Failed to read appointment: ${appointmentError.message}`);
  }
  if (!appointmentRow) return expire();

  const appointment = appointmentRow as AppointmentRow;
  // Sin paciente no hay identidad para reprogramar: se trata como dato inválido.
  if (!appointment.patient_id) return expire();

  if (
    iso(appointment.start_at) !== iso(suggestion.original_start_at) ||
    iso(appointment.end_at) !== iso(suggestion.original_end_at)
  ) {
    return expire();
  }

  // 3. Aplicar por la única ruta sancionada, con el rastro ya anexado.
  const result = await rescheduleAppointment({
    appointmentId: appointment.id,
    patientId: appointment.patient_id,
    serviceId: appointment.service_id,
    providerId: appointment.provider_id,
    newStartAt: new Date(suggestion.suggested_start_at),
    newEndAt: new Date(suggestion.suggested_end_at),
    notes: appendAuditTrail(appointment.notes, {
      suggestionId: input.suggestionId,
      occurredAt: input.occurredAt,
      originalStartAt: suggestion.original_start_at,
      suggestedStartAt: suggestion.suggested_start_at,
    }),
  });

  if ('ok' in result && result.ok) {
    await supabase
      .from('nora_reschedule_suggestions')
      .update({ status: 'applied' })
      .eq('id', input.suggestionId)
      .eq('status', 'accepted');
    return { ok: true, appointmentId: appointment.id };
  }

  if ('type' in result && result.type === 'conflict') {
    // No se marca `applied` ni se sobrescribe la cita que ocupa el horario.
    return { ok: false, reason: 'conflict' };
  }
  if ('type' in result && result.type === 'invalid_status') {
    return { ok: false, reason: 'invalid_status' };
  }
  return { ok: false, reason: 'not_found' };
}

/**
 * Rechaza una sugerencia `proposed`: registra la decisión y **no** toca la
 * cita asociada. Idempotente: una sugerencia ya decidida no se re-decide.
 */
export async function rejectSuggestion(input: {
  suggestionId: string;
  decidedBy: string;
  decidedAt: Date;
}): Promise<RejectResult> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('nora_reschedule_suggestions')
    .update({
      status: 'rejected',
      decided_by: input.decidedBy,
      decided_at: input.decidedAt.toISOString(),
    })
    .eq('id', input.suggestionId)
    .eq('status', 'proposed')
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to reject suggestion: ${error.message}`);
  }
  if (data) return { ok: true };

  const { data: existing, error: readError } = await supabase
    .from('nora_reschedule_suggestions')
    .select('id')
    .eq('id', input.suggestionId)
    .maybeSingle();
  if (readError) {
    throw new Error(`Failed to read suggestion: ${readError.message}`);
  }
  return existing ? { ok: false, reason: 'already_decided' } : { ok: false, reason: 'not_found' };
}
