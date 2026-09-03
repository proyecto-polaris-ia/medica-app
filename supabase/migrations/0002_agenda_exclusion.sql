-- Agenda domain exclusion constraint for atomic booking.
-- Prevents two appointments from overlapping for the same provider.
-- `btree_gist` provides the gist operator class required for `provider_id WITH =`.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_provider_no_overlap;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_provider_no_overlap
  EXCLUDE USING gist (
    provider_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  );
