import { getSupabaseAdmin } from '../supabase/server';
import type { BookingConflict } from './types';

export async function bookAppointment({
  patientId,
  serviceId,
  providerId,
  startAt,
  endAt,
}: {
  patientId: string;
  serviceId: string;
  providerId: string;
  startAt: Date;
  endAt: Date;
}): Promise<{ ok: true } | BookingConflict> {
  const supabase = getSupabaseAdmin();
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await supabase.from('appointments').insert({
      patient_id: patientId,
      service_id: serviceId,
      provider_id: providerId,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      status: 'requested',
    });

    if (!error) return { ok: true };

    // 23P01 = exclusion_violation → provider interval already taken.
    if (error.code === '23P01') {
      return {
        type: 'conflict',
        message: 'This time slot is no longer available. Please select another time.',
      };
    }

    // Retry transient errors (network, deadlock) with short backoff.
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }

  throw new Error(`Booking failed after ${maxRetries} attempts`);
}
