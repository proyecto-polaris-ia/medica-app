-- Down migration para recordatorios automáticos de citas (0018).
-- Revierte exactamente lo creado en 0018_appointment_reminders.sql:
-- índices, tabla, enum y objetos RLS asociados a la tabla.

DROP INDEX IF EXISTS idx_appointments_pending_start_at;
DROP INDEX IF EXISTS idx_appointment_reminders_appointment;

DROP TABLE IF EXISTS appointment_reminders;

DROP TYPE IF EXISTS appointment_reminder_status;
