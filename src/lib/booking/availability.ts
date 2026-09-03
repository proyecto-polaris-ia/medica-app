import { getSupabaseAdmin } from '../supabase/server';
import type { Slot } from './types';

/** Format a Date as a YYYY-MM-DD string in the clinic timezone. */
function toLocalDateString(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export async function getFreeSlots({
  providerId,
  serviceId,
  localDate,
  timezone = 'America/Mexico_City',
}: {
  providerId: string;
  serviceId: string;
  localDate: Date;
  timezone?: string;
}): Promise<Slot[]> {
  const supabase = getSupabaseAdmin();

  // Service duration defines the slot length (spec: "Services with duration").
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

  const { data, error } = await supabase.rpc('booking_free_slots', {
    p_provider_id: providerId,
    p_duration: `${service.duration_minutes} minutes`,
    p_target_date: toLocalDateString(localDate, timezone),
    p_clinic_tz: timezone,
  });

  if (error) throw new Error(`Failed to get free slots: ${error.message}`);

  return (data ?? []).map((slot: { start_at: string; end_at: string }) => ({
    start_at: new Date(slot.start_at),
    end_at: new Date(slot.end_at),
  }));
}
