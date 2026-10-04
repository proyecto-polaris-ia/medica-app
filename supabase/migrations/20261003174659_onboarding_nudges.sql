-- Capacidad "patient-onboarding-status": nudge de onboarding pendiente (design.md D9).
-- onboarding_nudges: deduplicación (reminder_key) + bitácora de auditoría del nudge
-- enviado aguas abajo del recordatorio de cita.
-- Idempotente: enum/tabla/índices/triggers/policies usan guardas IF NOT EXISTS.
-- Patrón espejo de 0018_appointment_reminders.sql (tabla/trigger/RLS).

-- Enum idempotente: onboarding_nudge_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onboarding_nudge_status') THEN
    CREATE TYPE onboarding_nudge_status AS ENUM ('scheduled', 'sent', 'failed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS onboarding_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  reminder_key text NOT NULL UNIQUE,
  status onboarding_nudge_status NOT NULL DEFAULT 'scheduled',
  template_name text NOT NULL DEFAULT 'onboarding_pendiente',
  dry_run boolean NOT NULL DEFAULT true,
  provider_message_id text,
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice de join: nudges por cita para el panel de citas.
CREATE INDEX IF NOT EXISTS idx_onboarding_nudges_appointment
  ON onboarding_nudges (appointment_id, created_at DESC);

-- Índice de lectura: nudges por paciente para el expediente.
CREATE INDEX IF NOT EXISTS idx_onboarding_nudges_patient
  ON onboarding_nudges (patient_id, created_at DESC);

-- Actualización de updated_at (patrón set_updated_at de 0006 / 0018; idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'onboarding_nudges_set_updated_at'
  ) THEN
    CREATE TRIGGER onboarding_nudges_set_updated_at
      BEFORE UPDATE ON onboarding_nudges
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$$;

-- RLS: enable + force (mismo patrón que appointment_reminders en 0018).
ALTER TABLE onboarding_nudges ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_nudges FORCE ROW LEVEL SECURITY;

-- Revocar anon, otorgar authenticated (el cron usa el admin client / service role).
REVOKE ALL ON onboarding_nudges FROM anon;
REVOKE ALL ON onboarding_nudges FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON onboarding_nudges TO authenticated;

-- Policy admin-all: solo usuarios autenticados (nunca anon).
CREATE POLICY "onboarding_nudges_admin_all" ON onboarding_nudges
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
