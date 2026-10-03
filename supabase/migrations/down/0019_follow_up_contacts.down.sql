-- Down migration para el estado de contacto de seguimiento (0019).
-- Revierte exactamente lo creado en 0019_follow_up_contacts.sql:
-- índices, tabla, enum y objetos RLS asociados a la tabla.

DROP INDEX IF EXISTS idx_follow_up_contacts_round;

DROP TABLE IF EXISTS follow_up_contacts;

DROP TYPE IF EXISTS follow_up_contact_status;
