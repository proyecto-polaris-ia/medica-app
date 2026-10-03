-- Capacidad "follow-up": borradores de mensaje con aprobación humana y envío.
-- follow_up_message_drafts: un borrador por (paciente, ronda) con el ciclo
-- draft -> approved/rejected -> sent/sent_failed y deduplicación por `dedup_key`.
-- Idempotente: enum/tabla/índices/triggers/policies usan guardas IF NOT EXISTS.
-- Patrón espejo de 0018_appointment_reminders.sql / 0019_follow_up_contacts.sql (RLS).

-- Enum idempotente: follow_up_draft_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'follow_up_draft_status') THEN
    CREATE TYPE follow_up_draft_status AS ENUM
      ('draft', 'approved', 'rejected', 'sent', 'sent_failed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS follow_up_message_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  body text NOT NULL,
  template_name text NOT NULL DEFAULT 'seguimiento_paciente',
  status follow_up_draft_status NOT NULL DEFAULT 'draft',
  dedup_key text NOT NULL UNIQUE,
  provider_message_id text,
  error_message text,
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice de lectura: cola de borradores por estado para el Command Center.
CREATE INDEX IF NOT EXISTS idx_follow_up_drafts_status
  ON follow_up_message_drafts (status, created_at DESC);

-- Índice de join: borradores por paciente para la página de seguimiento.
CREATE INDEX IF NOT EXISTS idx_follow_up_drafts_patient
  ON follow_up_message_drafts (patient_id, created_at DESC);

-- Actualización de updated_at (patrón set_updated_at de 0006 / 0018; idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'follow_up_message_drafts_set_updated_at'
  ) THEN
    CREATE TRIGGER follow_up_message_drafts_set_updated_at
      BEFORE UPDATE ON follow_up_message_drafts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$$;

-- RLS: enable + force (mismo patrón que 0018_appointment_reminders).
ALTER TABLE follow_up_message_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_message_drafts FORCE ROW LEVEL SECURITY;

-- Revocar anon, otorgar authenticated (la API usa el admin client / service role).
REVOKE ALL ON follow_up_message_drafts FROM anon;
REVOKE ALL ON follow_up_message_drafts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON follow_up_message_drafts TO authenticated;

-- Policy admin-all: solo usuarios autenticados (nunca anon).
CREATE POLICY "follow_up_message_drafts_admin_all" ON follow_up_message_drafts
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
