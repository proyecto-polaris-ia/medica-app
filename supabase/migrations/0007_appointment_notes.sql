-- Add notes column to appointments table
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS notes text;
