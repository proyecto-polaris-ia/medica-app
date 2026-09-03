import { getSupabaseAdmin } from '../supabase/server';
import type { Slot } from './types';

const MAX_DAYS_AHEAD = 30;

/** Format a Date as a YYYY-MM-DD string in the clinic timezone. */
function toLocalDateString(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export async function findNextAvailable({
  providerId,
  serviceId,
  after,
  timezone = 'America/Mexico_City',
}: {
  providerId: string;
  serviceId: string;
  after: Date;
  timezone?: string;
}): Promise<Slot | null> {
  const supabase = getSupabaseAdmin();

  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('duration_minutes')
    .eq('id', serviceId)
    .single();

  if (serviceError || !service) {
    throw new Error(
      `Service not found (${serviceId}): ${serviceError?.message ?? 'no rows'}`
    );
  }

  const start = new Date(after);

  // Search forward day by day for the earliest free slot that fits the service duration.
  for (let day = 0; day < MAX_DAYS_AHEAD; day++) {
    const target = new Date(start);
    target.setDate(start.getDate() + day);

    const { data, error } = await supabase.rpc('booking_free_slots', {
      p_provider_id: providerId,
      p_duration: `${service.duration_minutes} minutes`,
      p_target_date: toLocalDateString(target, timezone),
      p_clinic_tz: timezone,
    });

    if (error) throw new Error(`Failed to find next available slot: ${error.message}`);

    const candidates = (data ?? [])
      .map((slot: { start_at: string; end_at: string }) => ({
        start_at: new Date(slot.start_at),
        end_at: new Date(slot.end_at),
      }))
      .filter(
        (slot: { start_at: Date; end_at: Date }) =>
          slot.start_at.getTime() > after.getTime()
      );

    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  return null;
}
