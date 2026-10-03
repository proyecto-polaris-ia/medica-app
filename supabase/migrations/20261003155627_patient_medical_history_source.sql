-- Provenance de la historia clínica: columna aditiva `source` (design.md D1).
-- Valores: 'patient_autoreport' (capturado por WhatsApp tras confirmación) y
-- 'staff' (captura/validación por staff). El DEFAULT conserva la semántica de
-- las filas existentes y de todo escritor que no especifique procedencia.
-- Idempotente: ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS / ADD CONSTRAINT.

ALTER TABLE public.patient_medical_history
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'staff';

ALTER TABLE public.patient_medical_history
  DROP CONSTRAINT IF EXISTS patient_medical_history_source_check;
ALTER TABLE public.patient_medical_history
  ADD CONSTRAINT patient_medical_history_source_check
  CHECK (source IN ('patient_autoreport', 'staff'));
