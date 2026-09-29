-- Treatment plans (Fase 2 del expediente): planes e ítems de tratamiento.
-- Idempotente: IF NOT EXISTS en enums, tablas e índices.

-- Enums idempotentes (bloque DO $$, patrón 0001).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'treatment_plan_status') THEN
    CREATE TYPE treatment_plan_status AS ENUM (
      'draft', 'presented', 'accepted', 'in_progress', 'completed', 'cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'treatment_plan_item_status') THEN
    CREATE TYPE treatment_plan_item_status AS ENUM ('pending', 'done');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id),
  clinical_visit_id uuid REFERENCES clinical_visits(id) ON DELETE SET NULL,
  name text NOT NULL,
  status treatment_plan_status NOT NULL DEFAULT 'draft',
  total_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  accepted_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT treatment_plans_total_amount_check CHECK (total_amount >= 0)
);

CREATE TABLE IF NOT EXISTS treatment_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_plan_id uuid NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  description text NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  tooth text,
  quantity int NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  status treatment_plan_item_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT treatment_plan_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT treatment_plan_items_unit_price_check CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient_created
  ON treatment_plans (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treatment_plan_items_plan
  ON treatment_plan_items (treatment_plan_id);

ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_plan_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE treatment_plans, treatment_plan_items FROM anon;
