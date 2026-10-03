-- Capacidad "follow-up": estado de contacto por ronda de la lista diaria.
-- follow_up_contacts: un registro por (paciente, ronda) con estado contacted/dismissed.
-- Idempotente: enum/tabla/índices/triggers/policies usan guardas IF NOT EXISTS.
-- Patrón espejo de 0018_appointment_reminders.sql (RLS).

-- Enum idempotente: follow_up_contact_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'follow_up_contact_status') THEN
    CREATE TYPE follow_up_contact_status AS ENUM ('contacted', 'dismissed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS follow_up_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  round_date date NOT NULL,
  status follow_up_contact_status NOT NULL,
  contacted_at timestamptz,
  dismissed_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follow_up_contacts_unique_round UNIQUE (patient_id, round_date)
);

-- Índice de lectura por ronda: coincide con el filtro .eq('round_date', ...) y el
-- estado de contacto de la lista del día.
CREATE INDEX IF NOT EXISTS idx_follow_up_contacts_round
  ON follow_up_contacts (round_date, status);

-- Actualización de updated_at (patrón set_updated_at de 0006 / 0018; idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'follow_up_contacts_set_updated_at'
  ) THEN
    CREATE TRIGGER follow_up_contacts_set_updated_at
      BEFORE UPDATE ON follow_up_contacts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$$;

-- RLS: enable + force (mismo patrón que 0018_appointment_reminders).
ALTER TABLE follow_up_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_contacts FORCE ROW LEVEL SECURITY;

-- Revocar anon, otorgar authenticated.
REVOKE ALL ON follow_up_contacts FROM anon;
REVOKE ALL ON follow_up_contacts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON follow_up_contacts TO authenticated;

-- Policy admin-all: solo usuarios autenticados (nunca anon).
CREATE POLICY "follow_up_contacts_admin_all" ON follow_up_contacts
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
