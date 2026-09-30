-- Pagos manuales y reversos auditables para el expediente financiero.
-- Idempotente: enum, tabla e índices usan verificaciones seguras.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE payment_method AS ENUM ('cash', 'card', 'transfer', 'other');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  treatment_plan_id uuid REFERENCES treatment_plans(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  method payment_method NOT NULL,
  paid_at timestamptz NOT NULL,
  reference text,
  notes text,
  created_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_positive CHECK (amount > 0),
  CONSTRAINT payments_void_reason_required CHECK (
    voided_at IS NULL OR nullif(trim(void_reason), '') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_payments_patient_paid_at
  ON payments (patient_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_treatment_plan
  ON payments (treatment_plan_id)
  WHERE treatment_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_active_patient
  ON payments (patient_id)
  WHERE voided_at IS NULL;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE payments FROM anon;
