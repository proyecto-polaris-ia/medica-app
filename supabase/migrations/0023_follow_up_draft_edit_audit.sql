-- Capacidad "follow-up": auditoría de la edición humana del borrador.
-- follow_up_message_drafts: columnas aditivas y nullable para registrar quién
-- editó el texto y cuándo. Sin FK, en simetría con approved_by/created_by de
-- 0021_follow_up_message_drafts.sql; la integridad la garantiza la API admin.
-- Sin default ni backfill: los borradores existentes conservan su texto y su
-- estado con edited_by/edited_at en NULL. La policy admin existente cubre las
-- columnas nuevas (no se agregan policies, grants, revokes ni índices).
-- Idempotente: guardas IF NOT EXISTS.

ALTER TABLE follow_up_message_drafts
  ADD COLUMN IF NOT EXISTS edited_by uuid,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;
