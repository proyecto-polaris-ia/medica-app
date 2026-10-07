-- Down migration para sugerencias de reacomodo de Nora (20261007190100).
-- Revierte exactamente lo creado en 20261007190100_nora_reschedule_suggestions.sql:
-- índices, tabla y sus dependencias (trigger, RLS y policy caen con la tabla).
-- No toca el enum `appointment_status` ni `appointments`.

DROP TABLE IF EXISTS public.nora_reschedule_suggestions;
