-- Capacidad "appointment-reminders": recordatorios automáticos de citas (H-24 y día mismo).
-- appointment_reminders: deduplicación (reminder_key) + bitácora de auditoría del cron.
-- Idempotente: enum/tabla/índices/triggers/policies usan guardas IF NOT EXISTS.
-- Patrón espejo de 0017_payment_intents_reminders.sql.

-- Enum idempotente: appointment_reminder_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_reminder_status') THEN
    CREATE TYPE appointment_reminder_status AS ENUM ('scheduled', 'sent', 'failed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS appointment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  reminder_key text NOT NULL UNIQUE,
  cadence text NOT NULL CHECK (cadence IN ('h24', 'same_day')),
  status appointment_reminder_status NOT NULL DEFAULT 'scheduled',
  template_name text NOT NULL DEFAULT 'recordatorio_cita',
  dry_run boolean NOT NULL DEFAULT true,
  provider_message_id text,
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice parcial: coincide exactamente con el predicado del cron y del tab "Citas"
-- del Command Center (status de cita + rango de start_at).
CREATE INDEX IF NOT EXISTS idx_appointments_pending_start_at
  ON appointments (start_at)
  WHERE status IN ('requested', 'pending');

-- Índice de join: recordatorios por cita para el panel de citas.
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_appointment
  ON appointment_reminders (appointment_id, created_at DESC);

-- Actualización de updated_at (patrón set_updated_at de 0006 / 0017; idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'appointment_reminders_set_updated_at'
  ) THEN
    CREATE TRIGGER appointment_reminders_set_updated_at
      BEFORE UPDATE ON appointment_reminders
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$$;

-- RLS: enable + force (mismo patrón que payment_reminders en 0017).
ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_reminders FORCE ROW LEVEL SECURITY;

-- Revocar anon, otorgar authenticated (el cron usa el admin client / service role).
REVOKE ALL ON appointment_reminders FROM anon;
REVOKE ALL ON appointment_reminders FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON appointment_reminders TO authenticated;

-- Policy admin-all: solo usuarios autenticados (nunca anon).
CREATE POLICY "appointment_reminders_admin_all" ON appointment_reminders
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
