-- Reconcilia la ficha de identificación del expediente clínico.
-- Idempotente. Necesaria porque en algunos entornos la migración 0013 quedó
-- parcialmente aplicada: las tablas clínicas (clinical_visits,
-- patient_medical_history) existen, pero los ALTER TABLE patients ... ADD COLUMN
-- no se ejecutaron. Sin esas columnas, la lista de pacientes devolvía 500
-- ("error al cargar pacientes") y la lista de citas mostraba el UUID del
-- paciente en lugar de su nombre.

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
