-- Down migration para el nudge de onboarding pendiente (20261003174659).
-- Revierte exactamente lo creado en 20261003174659_onboarding_nudges.sql:
-- índices, tabla, enum y objetos RLS asociados a la tabla.

DROP INDEX IF EXISTS idx_onboarding_nudges_appointment;

DROP INDEX IF EXISTS idx_onboarding_nudges_patient;

DROP TABLE IF EXISTS onboarding_nudges;

DROP TYPE IF EXISTS onboarding_nudge_status;
