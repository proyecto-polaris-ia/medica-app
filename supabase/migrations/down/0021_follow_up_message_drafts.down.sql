-- Down migration para los borradores de seguimiento (0020).
-- Revierte exactamente lo creado en 0021_follow_up_message_drafts.sql:
-- índices, tabla y enum (en orden inverso).

DROP INDEX IF EXISTS idx_follow_up_drafts_status;

DROP INDEX IF EXISTS idx_follow_up_drafts_patient;

DROP TABLE IF EXISTS follow_up_message_drafts;

DROP TYPE IF EXISTS follow_up_draft_status;
