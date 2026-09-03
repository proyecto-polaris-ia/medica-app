-- Agenda domain functions.

-- Compute free slots for a provider on a given date in the clinic timezone.
-- Free slots = business_hours minus overlapping active appointments.
-- SECURITY DEFINER so it can read the RLS-protected agenda tables regardless of caller.
CREATE OR REPLACE FUNCTION booking_free_slots(
  p_provider_id uuid,
  p_duration interval,
  p_target_date date,
  p_clinic_tz text DEFAULT 'America/Mexico_City'
)
RETURNS TABLE(start_at timestamptz, end_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT slot_start, slot_end
  FROM (
    SELECT
      (p_target_date + bh.start_time) AT TIME ZONE p_clinic_tz + (n * p_duration) AS slot_start,
      (p_target_date + bh.start_time) AT TIME ZONE p_clinic_tz + ((n + 1) * p_duration) AS slot_end
    FROM public.business_hours bh
    CROSS JOIN generate_series(0, 1000) AS n
    WHERE bh.provider_id = p_provider_id
      AND bh.day_of_week = EXTRACT(dow FROM p_target_date)
      AND (p_target_date + bh.start_time) AT TIME ZONE p_clinic_tz + ((n + 1) * p_duration)
          <= (p_target_date + bh.end_time) AT TIME ZONE p_clinic_tz
  ) AS slots
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.provider_id = p_provider_id
      AND a.status NOT IN ('cancelled', 'rescheduled')
      AND a.start_at < slots.slot_end
      AND a.end_at > slots.slot_start
  )
  ORDER BY slot_start;
$$;
