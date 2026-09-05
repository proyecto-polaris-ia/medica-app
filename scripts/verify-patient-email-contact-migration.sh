#!/usr/bin/env bash
set -euo pipefail

# Reproducible, isolated Postgres proof for 0011. It never uses a Supabase
# project or a shared database; the container is removed on every exit path.
container="medica-patient-email-contact-${RANDOM}${RANDOM}"
postgres=(docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres)
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --rm --name "$container" -d -e POSTGRES_PASSWORD=postgres postgres:16 >/dev/null
# The image starts a temporary server during initialization. Wait for the second
# ready log (the final server) and then prove it accepts a SQL query.
until [[ $(docker logs "$container" 2>&1 | grep -c 'database system is ready to accept connections' || true) -ge 2 ]] \
  && docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'SELECT 1;' >/dev/null 2>&1; do
  sleep 0.2
done

"${postgres[@]}" -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;' >/dev/null
"${postgres[@]}" <<'SQL' >/dev/null
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid; $$;
CREATE ROLE anon;
CREATE ROLE authenticated;
SQL
"${postgres[@]}" < supabase/migrations/0001_agenda_tables.sql >/dev/null
"${postgres[@]}" < supabase/migrations/0006_whatsapp_inbound_command_center.sql >/dev/null
"${postgres[@]}" < supabase/migrations/0011_patient_email_contact.sql >/dev/null

# The DB, rather than application validation, enforces normalized, unique,
# non-empty contact data.
"${postgres[@]}" <<'SQL' >/dev/null
INSERT INTO patients (full_name, email) VALUES ('Email only', 'email@example.com');
INSERT INTO patients (full_name, phone_e164, email) VALUES ('Both contacts', '+5215512345678', 'both@example.com');
DO $$
BEGIN
  BEGIN
    INSERT INTO patients (full_name) VALUES ('No contact');
    RAISE EXCEPTION 'missing-contact insert unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO patients (full_name, email) VALUES ('Uppercase email', 'EMAIL@example.com');
    RAISE EXCEPTION 'unnormalized email insert unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO patients (full_name, email) VALUES ('Duplicate email', 'email@example.com');
    RAISE EXCEPTION 'duplicate email insert unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;
SQL

# An inbound WhatsApp contact is persisted before booking resolves a new patient.
# The explicit link written by the inbound orchestrator must therefore work with
# a nullable patient email and must not depend on a notification provider.
whatsapp_contact_id=$("${postgres[@]}" -Atq -c "INSERT INTO whatsapp_contacts (phone_e164) VALUES ('+5215511112222') RETURNING id;")
[[ -z $("${postgres[@]}" -Atq -c "SELECT linked_patient_id FROM whatsapp_contacts WHERE id = '$whatsapp_contact_id';") ]]
whatsapp_patient_id=$("${postgres[@]}" -Atq -c "INSERT INTO patients (full_name, phone_e164) VALUES ('WhatsApp patient', '+5215511112222') RETURNING id;")
"${postgres[@]}" -c "UPDATE whatsapp_contacts SET linked_patient_id = '$whatsapp_patient_id', linked_patient_source = 'auto_phone', linked_patient_matched_at = now() WHERE id = '$whatsapp_contact_id';" >/dev/null
[[ $("${postgres[@]}" -Atq -c "SELECT linked_patient_id FROM whatsapp_contacts WHERE id = '$whatsapp_contact_id';") == "$whatsapp_patient_id" ]]
[[ $("${postgres[@]}" -Atq -c "SELECT linked_patient_source FROM whatsapp_contacts WHERE id = '$whatsapp_contact_id';") == 'auto_phone' ]]

patient_id=$("${postgres[@]}" -Atq -c "INSERT INTO patients (full_name, phone_e164) VALUES ('Concurrent patient', '+5215587654321') RETURNING id;")
"${postgres[@]}" -c "BEGIN; UPDATE patients SET email = 'winner@example.com' WHERE id = '$patient_id' AND email IS NULL; SELECT pg_sleep(1); COMMIT;" >/dev/null &
winner_pid=$!
sleep 0.2
loser_result=$("${postgres[@]}" -Atq -c "UPDATE patients SET email = 'loser@example.com' WHERE id = '$patient_id' AND email IS NULL RETURNING email;")
wait "$winner_pid"
[[ -z "$loser_result" ]]
[[ $("${postgres[@]}" -Atq -c "SELECT email FROM patients WHERE id = '$patient_id';") == 'winner@example.com' ]]

# The down migration refuses destructive rollback while an email-only patient exists.
if "${postgres[@]}" < supabase/migrations/down/0011_patient_email_contact.down.sql >/dev/null 2>&1; then
  echo 'down migration unexpectedly accepted an email-only patient' >&2
  exit 1
fi
"${postgres[@]}" -c 'DELETE FROM patients WHERE phone_e164 IS NULL;' >/dev/null
"${postgres[@]}" < supabase/migrations/down/0011_patient_email_contact.down.sql >/dev/null

echo 'PASS: 0011 enforces contact invariants, links a newly resolved WhatsApp patient with nullable email, preserves a single concurrent conditional-update winner, and protects destructive rollback.'
