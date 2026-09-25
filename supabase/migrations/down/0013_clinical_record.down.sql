-- Down migration para expediente clínico fase 1.
-- Revierte tablas, índices, columnas de ficha y restricciones CHECK.

DROP INDEX IF EXISTS idx_clinical_visits_patient_created;
DROP INDEX IF EXISTS idx_clinical_visits_appointment;

DROP TABLE IF EXISTS clinical_visits;
DROP TABLE IF EXISTS patient_medical_history;

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_sex_check;

ALTER TABLE patients DROP COLUMN IF EXISTS emergency_contact_relationship;
ALTER TABLE patients DROP COLUMN IF EXISTS emergency_contact_phone;
ALTER TABLE patients DROP COLUMN IF EXISTS emergency_contact_name;
ALTER TABLE patients DROP COLUMN IF EXISTS secondary_phone;
ALTER TABLE patients DROP COLUMN IF EXISTS referral_source;
ALTER TABLE patients DROP COLUMN IF EXISTS occupation;
ALTER TABLE patients DROP COLUMN IF EXISTS address;
ALTER TABLE patients DROP COLUMN IF EXISTS sex;
ALTER TABLE patients DROP COLUMN IF EXISTS birth_date;
