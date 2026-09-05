DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM patients WHERE phone_e164 IS NULL) THEN
    RAISE EXCEPTION 'Cannot restore phone_e164 NOT NULL while email-only patients exist';
  END IF;
END $$;
DROP INDEX IF EXISTS patients_email_lower_unique;
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_email_normalized;
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_contact_required;
ALTER TABLE patients DROP COLUMN IF EXISTS email;
ALTER TABLE patients ALTER COLUMN phone_e164 SET NOT NULL;
