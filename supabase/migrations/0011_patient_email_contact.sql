ALTER TABLE patients ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE patients ALTER COLUMN phone_e164 DROP NOT NULL;
ALTER TABLE patients ADD CONSTRAINT patients_contact_required CHECK (phone_e164 IS NOT NULL OR email IS NOT NULL);
ALTER TABLE patients ADD CONSTRAINT patients_email_normalized CHECK (email IS NULL OR email = lower(btrim(email)));
CREATE UNIQUE INDEX patients_email_lower_unique ON patients (lower(email)) WHERE email IS NOT NULL;
