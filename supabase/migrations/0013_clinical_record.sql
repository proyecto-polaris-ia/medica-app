-- Expediente clínico: ficha de identificación, historia médica 1:1 y notas SOAP.
-- Idempotente: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

-- Ficha de identificación en patients.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS sex text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS occupation text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS referral_source text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS secondary_phone text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_name text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_phone text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_relationship text;

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_sex_check;
ALTER TABLE patients ADD CONSTRAINT patients_sex_check CHECK (sex IS NULL OR sex IN ('male', 'female', 'other'));

-- Historia clínica 1:1 por paciente.
CREATE TABLE IF NOT EXISTS patient_medical_history (
  patient_id uuid PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  allergies jsonb NOT NULL DEFAULT '[]'::jsonb,
  systemic_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  medications jsonb NOT NULL DEFAULT '[]'::jsonb,
  pregnancy_status text,
  coagulation_disorders text,
  anticoagulants text,
  surgeries text,
  infectious_diseases text,
  smoking text,
  alcohol text,
  dental_history text,
  oral_habits jsonb NOT NULL DEFAULT '[]'::jsonb,
  clinical_notes text,
  last_reviewed_at timestamptz,
  last_reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE patient_medical_history DROP CONSTRAINT IF EXISTS patient_medical_history_pregnancy_status_check;
ALTER TABLE patient_medical_history ADD CONSTRAINT patient_medical_history_pregnancy_status_check CHECK (pregnancy_status IS NULL OR pregnancy_status IN ('not_applicable', 'no', 'yes'));

ALTER TABLE patient_medical_history DROP CONSTRAINT IF EXISTS patient_medical_history_smoking_check;
ALTER TABLE patient_medical_history ADD CONSTRAINT patient_medical_history_smoking_check CHECK (smoking IS NULL OR smoking IN ('never', 'former', 'current'));

ALTER TABLE patient_medical_history DROP CONSTRAINT IF EXISTS patient_medical_history_alcohol_check;
ALTER TABLE patient_medical_history ADD CONSTRAINT patient_medical_history_alcohol_check CHECK (alcohol IS NULL OR alcohol IN ('never', 'occasional', 'frequent'));

-- Notas de evolución SOAP.
CREATE TABLE IF NOT EXISTS clinical_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES providers(id) ON DELETE SET NULL,
  subjective text NOT NULL,
  objective text,
  assessment text,
  plan text,
  treatment text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinical_visits_patient_created ON clinical_visits (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_visits_appointment ON clinical_visits (appointment_id);

-- RLS: datos clínicos solo para staff autenticado; anon sin acceso.
ALTER TABLE patient_medical_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_visits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE patient_medical_history, clinical_visits FROM anon;
