-- Instrumentación de transiciones para dashboard-metrics (issue #88).
-- Aditiva: columnas nullable, sin backfill, sin índice nuevo y sin tocar el
-- enum de estados de la cita. Cada escritor de status estampa su columna en la
-- MISMA sentencia que el cambio de estado, así que el instante es atómico.
-- No se agrega índice: estas columnas no se filtran en las consultas del
-- dashboard (las métricas se resuelven por solape de start_at / end_at).
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_at timestamptz;
