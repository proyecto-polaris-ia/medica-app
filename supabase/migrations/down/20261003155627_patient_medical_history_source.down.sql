-- Down migration para provenance de la historia clínica (20261003155627).
-- Revierte exactamente lo creado en 20261003155627_patient_medical_history_source.sql
-- en orden inverso: constraint y luego columna, ambos con IF EXISTS.

ALTER TABLE public.patient_medical_history
  DROP CONSTRAINT IF EXISTS patient_medical_history_source_check;

ALTER TABLE public.patient_medical_history
  DROP COLUMN IF EXISTS source;
