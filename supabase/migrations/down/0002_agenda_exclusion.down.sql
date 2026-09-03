-- Down migration for agenda exclusion constraint

-- Remove exclusion constraint from appointments table
ALTER TABLE appointments 
DROP CONSTRAINT IF EXISTS appointments_provider_no_overlap;