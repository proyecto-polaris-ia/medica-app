-- Fase 4 — "Mora" payments & arrears agent.
-- payment_intents: structured "intent to pay" records (never moves money).
-- payment_reminders: scheduler idempotency + audit trail for proactive reminders.
-- Idempotent: enums/tables/indexes/policies use IF NOT EXISTS guards.

-- Idempotent enum: payment_intent_source
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_intent_source') THEN
    CREATE TYPE payment_intent_source AS ENUM ('whatsapp', 'manual');
  END IF;
END
$$;

-- Idempotent enum: payment_intent_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_intent_status') THEN
    CREATE TYPE payment_intent_status AS ENUM ('pending', 'confirmed', 'fulfilled', 'cancelled');
  END IF;
END
$$;

-- Idempotent enum: payment_reminder_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_reminder_status') THEN
    CREATE TYPE payment_reminder_status AS ENUM ('scheduled', 'sent', 'skipped', 'failed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  treatment_plan_id uuid REFERENCES treatment_plans(id) ON DELETE SET NULL,
  whatsapp_contact_id uuid REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
  intent_source payment_intent_source NOT NULL DEFAULT 'whatsapp',
  amount numeric(12,2),
  commitment_text text,
  method text,
  status payment_intent_status NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_intents_amount_positive CHECK (amount IS NULL OR amount > 0),
  CONSTRAINT payment_intents_method_valid CHECK (
    method IS NULL OR method IN ('cash', 'card', 'transfer', 'other')
  )
);

CREATE TABLE IF NOT EXISTS payment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  treatment_plan_id uuid REFERENCES treatment_plans(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
  reminder_key text NOT NULL UNIQUE,
  template_name text NOT NULL DEFAULT 'recordatorio_pago',
  status payment_reminder_status NOT NULL DEFAULT 'scheduled',
  dry_run boolean NOT NULL DEFAULT true,
  balance_at_send numeric(12,2),
  provider_message_id text,
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_patient_created
  ON payment_intents (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status
  ON payment_intents (status);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_patient_created
  ON payment_reminders (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_status
  ON payment_reminders (status);

-- Updated_at maintenance (mirrors 0006 set_updated_at pattern; idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'payment_intents_set_updated_at'
  ) THEN
    CREATE TRIGGER payment_intents_set_updated_at
      BEFORE UPDATE ON payment_intents
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'payment_reminders_set_updated_at'
  ) THEN
    CREATE TRIGGER payment_reminders_set_updated_at
      BEFORE UPDATE ON payment_reminders
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$$;

-- RLS: enable + force (mirroring 0006 pattern).
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_reminders FORCE ROW LEVEL SECURITY;

-- Revoke anon/authenticated, grant authenticated (mirroring 0006).
REVOKE ALL ON payment_intents, payment_reminders FROM anon;
REVOKE ALL ON payment_intents, payment_reminders FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_intents, payment_reminders TO authenticated;

-- Admin-all policies (mirroring 0006).
CREATE POLICY "payment_intents_admin_all" ON payment_intents
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "payment_reminders_admin_all" ON payment_reminders
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);