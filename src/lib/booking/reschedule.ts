import { getSupabaseAdmin } from '../supabase/server';
import type { AppointmentStatus, BookingConflict } from './types';

const SELECT_COLUMNS = 'id, patient_id, service_id, provider_id, start_at, end_at, status, notes';

type AppointmentRow = {
  id: string;
  patient_id: string | null;
  service_id: string;
  provider_id: string;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  notes: string | null;
};

export type RescheduledAppointment = {
  id: string;
  patientId: string | null;
  serviceId: string;
  providerId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  notes: string | null;
};

export type RescheduleResult =
  | { ok: true; appointment: RescheduledAppointment }
  | BookingConflict
  | { type: 'not_found' | 'invalid_status'; message: string };

export async function rescheduleAppointment({
  appointmentId,
  patientId,
  serviceId,
  providerId,
  currentStartAt,
  currentEndAt,
  newStartAt,
  newEndAt,
  notes,
}: {
  appointmentId?: string;
  patientId: string;
  serviceId: string;
  providerId: string;
  currentStartAt?: Date;
  currentEndAt?: Date;
  newStartAt: Date;
  newEndAt: Date;
  notes?: string | null;
}): Promise<RescheduleResult> {
  const supabase = getSupabaseAdmin();

  if (newEndAt.getTime() <= newStartAt.getTime()) {
    return { type: 'not_found', message: 'The new end time must be after the new start time.' };
  }

  let query = supabase
    .from('appointments')
    .select(SELECT_COLUMNS)
    .match({
      patient_id: patientId,
      service_id: serviceId,
      provider_id: providerId,
    });

  if (appointmentId) {
    query = query.eq('id', appointmentId);
  } else if (currentStartAt && currentEndAt) {
    query = query.match({
      start_at: currentStartAt.toISOString(),
      end_at: currentEndAt.toISOString(),
    });
  } else {
    return {
      type: 'not_found',
      message: 'Original appointment identity is required before rescheduling.',
    };
  }

  const { data: existing, error: readError } = await query.maybeSingle();
  if (readError) throw new Error(`Failed to read appointment: ${readError.message}`);
  if (!existing) {
    return { type: 'not_found', message: 'Original appointment was not found.' };
  }

  const appointment = existing as AppointmentRow;
  if (appointment.status === 'cancelled' || appointment.status === 'attended' || appointment.status === 'no_show') {
    return {
      type: 'invalid_status',
      message: `Appointment with status ${appointment.status} cannot be rescheduled.`,
    };
  }

  const normalizedNotes = notes === undefined ? appointment.notes : notes?.trim() ? notes.trim() : null;

  const { data: updated, error: updateError } = await supabase
    .from('appointments')
    .update({
      start_at: newStartAt.toISOString(),
      end_at: newEndAt.toISOString(),
      notes: normalizedNotes,
    })
    .eq('id', appointment.id)
    .select(SELECT_COLUMNS)
    .single();

  if (updateError?.code === '23P01') {
    return {
      type: 'conflict',
      message: 'This time slot is no longer available. Please select another time.',
    };
  }
  if (updateError || !updated) {
    throw new Error(`Failed to reschedule appointment: ${updateError?.message ?? 'no row'}`);
  }

  const row = updated as AppointmentRow;
  return {
    ok: true,
    appointment: {
      id: row.id,
      patientId: row.patient_id,
      serviceId: row.service_id,
      providerId: row.provider_id,
      startAt: row.start_at,
      endAt: row.end_at,
      status: row.status,
      notes: row.notes,
    },
  };
}
