-- Add provider color and calendar range index

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS color text,
  ADD CONSTRAINT providers_color_hex_check
    CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$');

CREATE INDEX IF NOT EXISTS idx_appointments_start_at ON appointments(start_at);
