-- Down migration for agenda tables

-- Drop indexes
DROP INDEX IF EXISTS idx_appointments_provider_start;
DROP INDEX IF EXISTS idx_patients_phone;
DROP INDEX IF EXISTS idx_business_hours_provider_day;

-- Drop tables in reverse order to respect foreign key constraints
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS business_hours;
DROP TABLE IF EXISTS providers;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS patients;

-- Drop enum type
DROP TYPE IF EXISTS appointment_status;