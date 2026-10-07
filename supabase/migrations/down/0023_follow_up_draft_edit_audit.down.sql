-- Down migration para la auditoría de edición del borrador (0023).
-- Revierte exactamente lo agregado en 0023_follow_up_draft_edit_audit.sql:
-- las columnas edited_at y edited_by, en orden inverso.
-- Advertencia: elimina la auditoría de edición ya registrada; respaldar esos
-- valores antes de aplicar este down si se decide revertir la capacidad.

ALTER TABLE follow_up_message_drafts
  DROP COLUMN IF EXISTS edited_at,
  DROP COLUMN IF EXISTS edited_by;
