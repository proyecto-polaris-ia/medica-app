-- Agenda domain tables

-- Create appointment status enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
    CREATE TYPE appointment_status AS ENUM (
      'requested',
      'confirmed',
      'pending',
      'cancelled',
      'rescheduled',
      'no_show',
      'attended'
    );
  END IF;
END
$$;

-- Patients table
CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone_e164 text UNIQUE NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Services table
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Providers table
CREATE TABLE IF NOT EXISTS providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Business hours table (per provider)
CREATE TABLE IF NOT EXISTS business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  day_of_week int CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  CHECK (start_time < end_time),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Unique constraint to prevent duplicate business hours for same provider on same day
  UNIQUE(provider_id, day_of_week, start_time)
);

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id),
  service_id uuid NOT NULL REFERENCES services(id),
  provider_id uuid NOT NULL REFERENCES providers(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status appointment_status NOT NULL DEFAULT 'requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Check constraints for valid ranges
  CHECK (end_at > start_at OR status IN ('cancelled', 'rescheduled'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointments_provider_start ON appointments(provider_id, start_at);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone_e164);
CREATE INDEX IF NOT EXISTS idx_business_hours_provider_day ON business_hours(provider_id, day_of_week);