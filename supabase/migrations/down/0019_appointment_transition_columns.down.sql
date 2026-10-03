-- Down migration para métricas del dashboard (0019).
-- Revierte exactamente lo creado en 0019_appointment_transition_columns.sql:
-- las tres columnas de transición aditivas y nullable. No hay índices ni
-- cambios de enum que revertir.

ALTER TABLE public.appointments
  DROP COLUMN IF EXISTS no_show_at,
  DROP COLUMN IF EXISTS cancelled_at,
  DROP COLUMN IF EXISTS confirmed_at;
