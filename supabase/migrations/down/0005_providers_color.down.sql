-- Down migration for provider color and calendar range index

DROP INDEX IF EXISTS idx_appointments_start_at;

ALTER TABLE providers
  DROP CONSTRAINT IF EXISTS providers_color_hex_check,
  DROP COLUMN IF EXISTS color;
