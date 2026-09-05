-- Remove notes column from appointments table
ALTER TABLE appointments DROP COLUMN IF EXISTS notes;
