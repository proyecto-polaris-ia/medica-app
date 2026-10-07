-- ============================================================
-- Set de datos DEMO — generador idempotente y extensible
-- ============================================================
-- Uso (Supabase local):
--   npm run demo:seed
-- Uso (producción u otro entorno):
--   Ejecutar este archivo contra la base con psql o el SQL editor.
--
-- Propiedades:
--  * NO toca datos reales: solo crea entidades con UUIDs reservados y
--    registra cada fila en demo_data_registry.
--  * Idempotente: re-ejecutar no duplica filas (claves deterministas).
--  * Extensible: re-ejecutar extiende las citas futuras hasta hoy + 14 días.
--  * Fechas relativas a hoy en America/Mexico_City.
-- Borrado: scripts/demo/remove-demo-data.sql (npm run demo:wipe).
-- ============================================================

BEGIN;

-- Helpers de sesión (no persisten en el esquema)
create function pg_temp.demo_uuid(p_key text) returns uuid
language sql immutable as $fn$ select md5(p_key)::uuid $fn$;

create function pg_temp.demo_registered(p_key text) returns boolean
language sql stable as $fn$
  select exists (select 1 from public.demo_data_registry where entity_key = p_key)
$fn$;

create function pg_temp.demo_reg(p_table text, p_id uuid, p_key text) returns void
language sql as $fn$
  insert into public.demo_data_registry (entity_table, record_id, entity_key)
  values (p_table, p_id, p_key)
  on conflict (entity_key) do nothing
$fn$;

-- Resuelve servicios por patrón de nombre (local y producción) o por
-- posición en el catálogo, sin depender de UUIDs fijos del catálogo.
create function pg_temp.demo_service_id(p_idx int) returns uuid
language sql stable as $fn$
  select coalesce(
    (select id from public.services
      where name ilike (array['%valoració%', '%limpieza%', '%resina%'])[p_idx + 1]
      order by length(name)
      limit 1),
    (select id from public.services order by duration_minutes, name offset p_idx limit 1)
  )
$fn$;

DO $demo$
DECLARE
  v_today date := (now() at time zone 'America/Mexico_City')::date;
  v_anchor date;
  v_start date;
  v_through date;
  v_horizon date;

  -- Entidades fijas (UUIDs reservados del set demo)
  v_provider1 uuid := '00000000-0000-4000-8000-000000000102';
  v_provider2 uuid := '00000000-0000-4000-8000-000000000103';
  v_p1 uuid := '00000000-0000-4000-8000-000000000201';
  v_p2 uuid := '00000000-0000-4000-8000-000000000202';
  v_p3 uuid := '00000000-0000-4000-8000-000000000203';
  v_c1 uuid := '00000000-0000-4000-8000-000000000801';
  v_c2 uuid := '00000000-0000-4000-8000-000000000802';
  v_c3 uuid := '00000000-0000-4000-8000-000000000803';
  v_plan1 uuid := '00000000-0000-4000-8000-000000000301';
  v_plan2 uuid := '00000000-0000-4000-8000-000000000302';
  v_plan3 uuid := '00000000-0000-4000-8000-000000000303';
  v_item1a uuid := '00000000-0000-4000-8000-000000000401';
  v_item1b uuid := '00000000-0000-4000-8000-000000000402';
  v_item2a uuid := '00000000-0000-4000-8000-000000000403';
  v_item2b uuid := '00000000-0000-4000-8000-000000000404';
  v_item3a uuid := '00000000-0000-4000-8000-000000000405';
  v_item3b uuid := '00000000-0000-4000-8000-000000000406';
  v_pay1a uuid := '00000000-0000-4000-8000-000000000501';
  v_pay1b uuid := '00000000-0000-4000-8000-000000000502';
  v_pay2a uuid := '00000000-0000-4000-8000-000000000503';
  v_pay2b uuid := '00000000-0000-4000-8000-000000000504';
  v_pay2c uuid := '00000000-0000-4000-8000-000000000505';
  v_intent1 uuid := '00000000-0000-4000-8000-000000000601';
  v_intent2 uuid := '00000000-0000-4000-8000-000000000602';
  v_prem1 uuid := '00000000-0000-4000-8000-000000000701';
  v_prem2 uuid := '00000000-0000-4000-8000-000000000702';
  v_fu1 uuid := '00000000-0000-4000-8000-000000000901';
  v_fu2 uuid := '00000000-0000-4000-8000-000000000902';
  v_fu3 uuid := '00000000-0000-4000-8000-000000000903';
  v_draft1 uuid := '00000000-0000-4000-8000-000000001001';

  -- Variables del ciclo de citas
  v_d date;
  v_dayoff int;
  v_slot_n int;
  v_slot_time time;
  v_appt_key text;
  v_rem_key text;
  v_visit_key text;
  v_patient uuid;
  v_provider uuid;
  v_service uuid;
  v_dur int;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_status text;
  v_visit_case int;
  v_rot int;
BEGIN
  ------------------------------------------------------------------
  -- Ancla temporal y horizonte
  ------------------------------------------------------------------
  insert into public.demo_data_meta (key, value)
  values ('anchor_date', to_char(v_today, 'YYYY-MM-DD'))
  on conflict (key) do nothing;

  select value::date into v_anchor
    from public.demo_data_meta where key = 'anchor_date';

  select value::date into v_through
    from public.demo_data_meta where key = 'generated_through';

  v_horizon := v_today + 14;
  v_start := coalesce(v_through + 1, v_anchor - 21);

  if v_start > v_horizon then
    raise notice 'demo: horizonte ya cubierto hasta %, nada por generar', v_through;
    return;
  end if;

  ------------------------------------------------------------------
  -- Doctores demo (no toca proveedores existentes)
  ------------------------------------------------------------------
  if not pg_temp.demo_registered('provider:1') then
    insert into public.providers (id, name, color) values
      (v_provider1, 'Dra. Elena Ramírez (demo)', '#0d9488')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('providers', v_provider1, 'provider:1');
  end if;

  if not pg_temp.demo_registered('provider:2') then
    insert into public.providers (id, name, color) values
      (v_provider2, 'Dr. Marco Antonio Silva (demo)', '#b45309')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('providers', v_provider2, 'provider:2');
  end if;

  if not pg_temp.demo_registered('business-hours:1') then
    insert into public.business_hours (provider_id, day_of_week, start_time, end_time)
    select v_provider1, d, '09:00'::time, '18:00'::time
    from generate_series(1, 5) as g(d)
    on conflict do nothing;
    perform pg_temp.demo_reg('business_hours', v_provider1, 'business-hours:1');
  end if;

  if not pg_temp.demo_registered('business-hours:2') then
    insert into public.business_hours (provider_id, day_of_week, start_time, end_time)
    select v_provider2, d, '09:00'::time, '18:00'::time from generate_series(1, 5) as g(d)
    union all
    select v_provider2, 6, '09:00'::time, '13:00'::time
    on conflict do nothing;
    perform pg_temp.demo_reg('business_hours', v_provider2, 'business-hours:2');
  end if;

  ------------------------------------------------------------------
  -- Pacientes demo (falla si el teléfono ya existe en un no-demo)
  ------------------------------------------------------------------
  if not pg_temp.demo_registered('patient:1') then
    if exists (select 1 from public.patients where phone_e164 = '+5215500000001' and id <> v_p1) then
      raise exception 'demo: el teléfono +5215500000001 ya existe en un paciente no demo';
    end if;
    insert into public.patients
      (id, full_name, phone_e164, email, birth_date, sex, address, occupation,
       referral_source, emergency_contact_name, emergency_contact_phone,
       emergency_contact_relationship, notes)
    values
      (v_p1, 'María Fernanda López García', '+5215500000001',
       'demo.fernanda@example.com', date '1985-03-14', 'female',
       'Av. Reforma 123, CDMX', 'Diseñadora', 'Instagram',
       'Laura López', '+5215580000001', 'Hermana',
       'Registro de prueba (demo).')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('patients', v_p1, 'patient:1');
  end if;

  if not pg_temp.demo_registered('patient:2') then
    if exists (select 1 from public.patients where phone_e164 = '+5215500000002' and id <> v_p2) then
      raise exception 'demo: el teléfono +5215500000002 ya existe en un paciente no demo';
    end if;
    insert into public.patients
      (id, full_name, phone_e164, email, birth_date, sex, address, occupation,
       referral_source, emergency_contact_name, emergency_contact_phone,
       emergency_contact_relationship, notes)
    values
      (v_p2, 'Jorge Alberto Méndez Ruiz', '+5215500000002',
       'demo.jorge@example.com', date '1978-11-02', 'male',
       'C. Morelos 45, CDMX', 'Contador', 'Recomendación',
       'Ana Méndez', '+5215580000002', 'Esposa',
       'Registro de prueba (demo).')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('patients', v_p2, 'patient:2');
  end if;

  if not pg_temp.demo_registered('patient:3') then
    if exists (select 1 from public.patients where phone_e164 = '+5215500000003' and id <> v_p3) then
      raise exception 'demo: el teléfono +5215500000003 ya existe en un paciente no demo';
    end if;
    insert into public.patients
      (id, full_name, phone_e164, email, birth_date, sex, address, occupation,
       referral_source, emergency_contact_name, emergency_contact_phone,
       emergency_contact_relationship, notes)
    values
      (v_p3, 'Sofía Valentina Torres Peña', '+5215500000003',
       'demo.sofia@example.com', date '1996-07-25', 'female',
       'Polanco 789, CDMX', 'Estudiante', 'Google',
       'Marta Peña', '+5215580000003', 'Madre',
       'Registro de prueba (demo).')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('patients', v_p3, 'patient:3');
  end if;

  ------------------------------------------------------------------
  -- Historial médico
  ------------------------------------------------------------------
  if not pg_temp.demo_registered('medical-history:1') then
    insert into public.patient_medical_history
      (patient_id, allergies, systemic_conditions, medications, pregnancy_status,
       smoking, alcohol, dental_history, oral_habits, clinical_notes,
       last_reviewed_at, source)
    values
      (v_p1, '["Penicilina"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'no',
       'never', 'occasional',
       'Resinas previas en sector posterior. Sensibilidad ocasional al frío.',
       '[]'::jsonb, 'Paciente puntual y colaboradora.',
       (v_anchor - 20 + time '10:00') at time zone 'America/Mexico_City', 'staff')
      on conflict (patient_id) do nothing;
    perform pg_temp.demo_reg('patient_medical_history', v_p1, 'medical-history:1');
  end if;

  if not pg_temp.demo_registered('medical-history:2') then
    insert into public.patient_medical_history
      (patient_id, allergies, systemic_conditions, medications, pregnancy_status,
       smoking, alcohol, dental_history, oral_habits, clinical_notes,
       last_reviewed_at, source)
    values
      (v_p2, '[]'::jsonb, '["Diabetes tipo 2 (controlada)"]'::jsonb,
       '["Metformina 850 mg"]'::jsonb, 'not_applicable',
       'never', 'never',
       'Endodoncia previa en sector posterior. Bruxismo controlado con guarda.',
       '["Bruxismo (usa guarda nocturna)"]'::jsonb,
       'Verificar glucosa antes de procedimientos quirúrgicos.',
       (v_anchor - 25 + time '11:30') at time zone 'America/Mexico_City', 'staff')
      on conflict (patient_id) do nothing;
    perform pg_temp.demo_reg('patient_medical_history', v_p2, 'medical-history:2');
  end if;

  if not pg_temp.demo_registered('medical-history:3') then
    insert into public.patient_medical_history
      (patient_id, allergies, systemic_conditions, medications, pregnancy_status,
       smoking, alcohol, dental_history, oral_habits, clinical_notes,
       last_reviewed_at, source)
    values
      (v_p3, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'no',
       'never', 'never',
       'Ortodoncia en adolescencia. Terceros molares en erupción.',
       '[]'::jsonb, 'Sin antecedentes de riesgo.',
       (v_anchor - 15 + time '12:00') at time zone 'America/Mexico_City', 'staff')
      on conflict (patient_id) do nothing;
    perform pg_temp.demo_reg('patient_medical_history', v_p3, 'medical-history:3');
  end if;

  ------------------------------------------------------------------
  -- Contactos de WhatsApp demo (ligados a los pacientes demo)
  ------------------------------------------------------------------
  if not pg_temp.demo_registered('whatsapp-contact:1') then
    insert into public.whatsapp_contacts
      (id, phone_e164, display_name, linked_patient_id, linked_patient_source,
       opt_in_status, first_seen_at)
    values
      (v_c1, '+5215500000001', 'Fernanda López', v_p1, 'manual', 'opted_in',
       (v_anchor - 30) at time zone 'America/Mexico_City')
      on conflict (phone_e164) do nothing;
    perform pg_temp.demo_reg('whatsapp_contacts', v_c1, 'whatsapp-contact:1');
  end if;

  if not pg_temp.demo_registered('whatsapp-contact:2') then
    insert into public.whatsapp_contacts
      (id, phone_e164, display_name, linked_patient_id, linked_patient_source,
       opt_in_status, first_seen_at)
    values
      (v_c2, '+5215500000002', 'Jorge Méndez', v_p2, 'manual', 'opted_in',
       (v_anchor - 30) at time zone 'America/Mexico_City')
      on conflict (phone_e164) do nothing;
    perform pg_temp.demo_reg('whatsapp_contacts', v_c2, 'whatsapp-contact:2');
  end if;

  if not pg_temp.demo_registered('whatsapp-contact:3') then
    insert into public.whatsapp_contacts
      (id, phone_e164, display_name, linked_patient_id, linked_patient_source,
       opt_in_status, first_seen_at)
    values
      (v_c3, '+5215500000003', 'Sofía Torres', v_p3, 'manual', 'opted_in',
       (v_anchor - 30) at time zone 'America/Mexico_City')
      on conflict (phone_e164) do nothing;
    perform pg_temp.demo_reg('whatsapp_contacts', v_c3, 'whatsapp-contact:3');
  end if;

  ------------------------------------------------------------------
  -- Planes de tratamiento, partidas y pagos
  ------------------------------------------------------------------
  if not pg_temp.demo_registered('plan:1') then
    insert into public.treatment_plans
      (id, patient_id, provider_id, name, status, total_amount, accepted_at, notes)
    values
      (v_plan1, v_p1, v_provider1, 'Rehabilitación con resinas', 'accepted',
       2600.00, (v_anchor - 18 + time '10:00') at time zone 'America/Mexico_City',
       'Plan demo: resina + limpieza.')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('treatment_plans', v_plan1, 'plan:1');
  end if;

  if not pg_temp.demo_registered('plan:1-item:a') then
    insert into public.treatment_plan_items
      (id, treatment_plan_id, description, service_id, tooth, quantity, unit_price, status)
    values
      (v_item1a, v_plan1, 'Resina en pieza 16', pg_temp.demo_service_id(2), '16', 1, 1800.00, 'done')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('treatment_plan_items', v_item1a, 'plan:1-item:a');
  end if;

  if not pg_temp.demo_registered('plan:1-item:b') then
    insert into public.treatment_plan_items
      (id, treatment_plan_id, description, service_id, tooth, quantity, unit_price, status)
    values
      (v_item1b, v_plan1, 'Limpieza', pg_temp.demo_service_id(1), null, 1, 800.00, 'pending')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('treatment_plan_items', v_item1b, 'plan:1-item:b');
  end if;

  if not pg_temp.demo_registered('plan:2') then
    insert into public.treatment_plans
      (id, patient_id, provider_id, name, status, total_amount, accepted_at, notes)
    values
      (v_plan2, v_p2, v_provider2, 'Endodoncia y corona', 'in_progress',
       8500.00, (v_anchor - 15 + time '11:00') at time zone 'America/Mexico_City',
       'Plan demo: conducto + corona.')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('treatment_plans', v_plan2, 'plan:2');
  end if;

  if not pg_temp.demo_registered('plan:2-item:a') then
    insert into public.treatment_plan_items
      (id, treatment_plan_id, description, service_id, tooth, quantity, unit_price, status)
    values
      (v_item2a, v_plan2, 'Tratamiento de conducto (pieza 36)', null, '36', 1, 4500.00, 'done')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('treatment_plan_items', v_item2a, 'plan:2-item:a');
  end if;

  if not pg_temp.demo_registered('plan:2-item:b') then
    insert into public.treatment_plan_items
      (id, treatment_plan_id, description, service_id, tooth, quantity, unit_price, status)
    values
      (v_item2b, v_plan2, 'Corona de porcelana (pieza 36)', null, '36', 1, 4000.00, 'pending')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('treatment_plan_items', v_item2b, 'plan:2-item:b');
  end if;

  if not pg_temp.demo_registered('plan:3') then
    insert into public.treatment_plans
      (id, patient_id, provider_id, name, status, total_amount, notes)
    values
      (v_plan3, v_p3, v_provider1, 'Ortodoncia de contención', 'presented',
       4800.00, 'Plan demo presentado, pendiente de aceptación.')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('treatment_plans', v_plan3, 'plan:3');
  end if;

  if not pg_temp.demo_registered('plan:3-item:a') then
    insert into public.treatment_plan_items
      (id, treatment_plan_id, description, service_id, tooth, quantity, unit_price, status)
    values
      (v_item3a, v_plan3, 'Aparatología fija (arco superior)', null, null, 1, 3200.00, 'pending')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('treatment_plan_items', v_item3a, 'plan:3-item:a');
  end if;

  if not pg_temp.demo_registered('plan:3-item:b') then
    insert into public.treatment_plan_items
      (id, treatment_plan_id, description, service_id, tooth, quantity, unit_price, status)
    values
      (v_item3b, v_plan3, 'Retenedor', null, null, 1, 1600.00, 'pending')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('treatment_plan_items', v_item3b, 'plan:3-item:b');
  end if;

  if not pg_temp.demo_registered('payment:1a') then
    insert into public.payments
      (id, patient_id, treatment_plan_id, amount, method, paid_at, reference, notes)
    values
      (v_pay1a, v_p1, v_plan1, 1300.00, 'cash',
       (v_anchor - 18 + time '10:30') at time zone 'America/Mexico_City',
       'DEMO-001', 'Anticipo 50%.')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('payments', v_pay1a, 'payment:1a');
  end if;

  if not pg_temp.demo_registered('payment:1b') then
    insert into public.payments
      (id, patient_id, treatment_plan_id, amount, method, paid_at, reference, notes)
    values
      (v_pay1b, v_p1, v_plan1, 500.00, 'transfer',
       (v_anchor - 10 + time '12:00') at time zone 'America/Mexico_City',
       'DEMO-002', null)
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('payments', v_pay1b, 'payment:1b');
  end if;

  if not pg_temp.demo_registered('payment:2a') then
    insert into public.payments
      (id, patient_id, treatment_plan_id, amount, method, paid_at, reference, notes)
    values
      (v_pay2a, v_p2, v_plan2, 4000.00, 'card',
       (v_anchor - 15 + time '11:15') at time zone 'America/Mexico_City',
       'DEMO-003', null)
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('payments', v_pay2a, 'payment:2a');
  end if;

  if not pg_temp.demo_registered('payment:2b') then
    insert into public.payments
      (id, patient_id, treatment_plan_id, amount, method, paid_at, reference, notes)
    values
      (v_pay2b, v_p2, v_plan2, 2000.00, 'transfer',
       (v_anchor - 6 + time '17:00') at time zone 'America/Mexico_City',
       'DEMO-004', null)
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('payments', v_pay2b, 'payment:2b');
  end if;

  -- Pago voidado: sirve para demostrar la anulación de pagos
  if not pg_temp.demo_registered('payment:2c') then
    insert into public.payments
      (id, patient_id, treatment_plan_id, amount, method, paid_at, reference,
       notes, voided_at, void_reason)
    values
      (v_pay2c, v_p2, v_plan2, 300.00, 'cash',
       (v_anchor - 12 + time '13:00') at time zone 'America/Mexico_City',
       'DEMO-005', null,
       (v_anchor - 12 + time '14:00') at time zone 'America/Mexico_City',
       'Pago registrado por error (demo).')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('payments', v_pay2c, 'payment:2c');
  end if;

  ------------------------------------------------------------------
  -- Intents de pago y recordatorios de pago (crons de agentes)
  ------------------------------------------------------------------
  if not pg_temp.demo_registered('payment-intent:1') then
    insert into public.payment_intents
      (id, patient_id, treatment_plan_id, whatsapp_contact_id, intent_source,
       amount, commitment_text, method, status, notes)
    values
      (v_intent1, v_p1, v_plan1, v_c1, 'whatsapp', 800.00,
       'Pasaré el viernes en la tarde a liquidar', null, 'pending', null)
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('payment_intents', v_intent1, 'payment-intent:1');
  end if;

  if not pg_temp.demo_registered('payment-intent:2') then
    insert into public.payment_intents
      (id, patient_id, treatment_plan_id, whatsapp_contact_id, intent_source,
       amount, commitment_text, method, status, notes)
    values
      (v_intent2, v_p2, v_plan2, v_c2, 'manual', 2000.00, null, 'transfer',
       'fulfilled', 'Confirmado por recepción.')
      on conflict (id) do nothing;
    perform pg_temp.demo_reg('payment_intents', v_intent2, 'payment-intent:2');
  end if;

  if not pg_temp.demo_registered('payment-reminder:1') then
    insert into public.payment_reminders
      (id, patient_id, treatment_plan_id, contact_id, reminder_key, status,
       dry_run, balance_at_send)
    values
      (v_prem1, v_p1, v_plan1, v_c1, 'demo:payment-reminder:1', 'scheduled',
       true, 800.00)
      on conflict (reminder_key) do nothing;
    perform pg_temp.demo_reg('payment_reminders', v_prem1, 'payment-reminder:1');
  end if;

  if not pg_temp.demo_registered('payment-reminder:2') then
    insert into public.payment_reminders
      (id, patient_id, treatment_plan_id, contact_id, reminder_key, status,
       dry_run, balance_at_send, sent_at)
    values
      (v_prem2, v_p2, v_plan2, v_c2, 'demo:payment-reminder:2', 'sent',
       true, 6500.00,
       (v_anchor - 5 + time '10:00') at time zone 'America/Mexico_City')
      on conflict (reminder_key) do nothing;
    perform pg_temp.demo_reg('payment_reminders', v_prem2, 'payment-reminder:2');
  end if;

  ------------------------------------------------------------------
  -- Seguimientos (follow-ups) y draft de mensaje
  ------------------------------------------------------------------
  if not pg_temp.demo_registered('follow-up:1') then
    insert into public.follow_up_contacts
      (id, patient_id, round_date, status, contacted_at, note)
    values
      (v_fu1, v_p1, v_anchor - 14, 'contacted',
       (v_anchor - 14 + time '10:00') at time zone 'America/Mexico_City',
       'Confirmó asistencia a su limpieza.')
      on conflict (patient_id, round_date) do nothing;
    perform pg_temp.demo_reg('follow_up_contacts', v_fu1, 'follow-up:1');
  end if;

  if not pg_temp.demo_registered('follow-up:2') then
    insert into public.follow_up_contacts
      (id, patient_id, round_date, status, contacted_at, note)
    values
      (v_fu2, v_p2, v_anchor - 7, 'contacted',
       (v_anchor - 7 + time '11:00') at time zone 'America/Mexico_City',
       'Agendó su cita de corona.')
      on conflict (patient_id, round_date) do nothing;
    perform pg_temp.demo_reg('follow_up_contacts', v_fu2, 'follow-up:2');
  end if;

  if not pg_temp.demo_registered('follow-up:3') then
    insert into public.follow_up_contacts
      (id, patient_id, round_date, status, dismissed_at, note)
    values
      (v_fu3, v_p3, v_anchor - 3, 'dismissed',
       (v_anchor - 3 + time '09:30') at time zone 'America/Mexico_City',
       'Prefirió reprogramar para el próximo mes.')
      on conflict (patient_id, round_date) do nothing;
    perform pg_temp.demo_reg('follow_up_contacts', v_fu3, 'follow-up:3');
  end if;

  if not pg_temp.demo_registered('follow-up-draft:1') then
    insert into public.follow_up_message_drafts
      (id, patient_id, body, status, dedup_key, created_at)
    values
      (v_draft1, v_p3,
       'Hola Sofía, le escribe el Consultorio Dental. ¿Le acomoda agendar su '
       || 'cita de valoración esta semana? Tenemos espacio por la tarde.',
       'draft', 'demo:follow-up-draft:1',
       (v_anchor - 2 + time '09:00') at time zone 'America/Mexico_City')
      on conflict (dedup_key) do nothing;
    perform pg_temp.demo_reg('follow_up_message_drafts', v_draft1, 'follow-up-draft:1');
  end if;

  ------------------------------------------------------------------
  -- Citas día por día (núcleo extensible del set)
  -- 3 slots por día hábil: 09:00, 11:00 y 16:00, rotando paciente,
  -- proveedor y servicio de forma determinista.
  ------------------------------------------------------------------
  for v_d in
    select g.d from generate_series(v_start, v_horizon, interval '1 day') as g(d)
  loop
    if extract(isodow from v_d) not between 1 and 5 then
      continue;
    end if;

    v_dayoff := (v_d - v_anchor);

    for v_slot_n in 1..3
    loop
      v_rot := (((v_dayoff + v_slot_n - 1) % 3) + 3) % 3;
      v_slot_time := case v_slot_n
        when 1 then time '09:00'
        when 2 then time '11:00'
        else time '16:00'
      end;

      v_appt_key := 'appointment:' || to_char(v_d, 'YYYY-MM-DD')
                    || ':' || to_char(v_slot_time, 'HH24MI');
      continue when pg_temp.demo_registered(v_appt_key);

      v_patient := case v_rot
        when 0 then v_p1
        when 1 then v_p2
        else v_p3
      end;

      v_provider := case v_slot_n
        when 1 then v_provider1
        when 2 then v_provider2
        else case (v_dayoff % 2) when 0 then v_provider1 else v_provider2 end
      end;

      v_service := pg_temp.demo_service_id(v_rot);
      select duration_minutes into v_dur
        from public.services where id = v_service;
      v_dur := coalesce(v_dur, 30);

      v_start_at := (v_d + v_slot_time) at time zone 'America/Mexico_City';
      v_end_at := v_start_at + make_interval(mins => v_dur);

      if v_d < v_today then
        v_status := case ((((v_dayoff + v_slot_n) % 7) + 7) % 7)
          when 3 then 'no_show'
          when 5 then 'cancelled'
          else 'attended'
        end;
      elsif v_d = v_today then
        v_status := case v_slot_n
          when 1 then 'confirmed'
          when 2 then 'requested'
          else 'pending'
        end;
      else
        v_status := case v_slot_n
          when 2 then 'requested'
          else 'confirmed'
        end;
      end if;

      insert into public.appointments
        (id, patient_id, service_id, provider_id, start_at, end_at, status,
         notes, confirmed_at, cancelled_at, no_show_at)
      values
        (pg_temp.demo_uuid(v_appt_key), v_patient, v_service, v_provider,
         v_start_at,
         case when v_status = 'cancelled' then v_start_at else v_end_at end,
         v_status::appointment_status,
         case v_status
           when 'cancelled' then 'Cancelada por el paciente (demo).'
           when 'no_show' then 'No asistió a la cita (demo).'
           else null
         end,
         case when v_status in ('confirmed', 'attended')
              then v_start_at - interval '1 day' end,
         case when v_status = 'cancelled' then v_start_at end,
         case when v_status = 'no_show' then v_end_at end)
        on conflict (id) do nothing;
      perform pg_temp.demo_reg('appointments', pg_temp.demo_uuid(v_appt_key), v_appt_key);

      -- Recordatorio de cita (h24) para citas futuras confirmadas
      if v_status = 'confirmed' and v_d >= v_today then
        v_rem_key := 'appointment-reminder:' || v_appt_key;
        if not pg_temp.demo_registered(v_rem_key) then
          insert into public.appointment_reminders
            (id, appointment_id, reminder_key, cadence, status, dry_run)
          values
            (pg_temp.demo_uuid(v_rem_key), pg_temp.demo_uuid(v_appt_key),
             'demo:' || v_appt_key, 'h24', 'scheduled', true)
          on conflict (reminder_key) do nothing;
          perform pg_temp.demo_reg('appointment_reminders', pg_temp.demo_uuid(v_rem_key), v_rem_key);
        end if;
      end if;

      -- Visita clínica SOAP para citas pasadas atendidas
      if v_status = 'attended' then
        v_visit_key := 'clinical-visit:' || v_appt_key;
        if not pg_temp.demo_registered(v_visit_key) then
          v_visit_case := (((v_dayoff + v_slot_n) % 3) + 3) % 3;
          insert into public.clinical_visits
            (id, patient_id, appointment_id, provider_id,
             subjective, objective, assessment, plan, treatment, notes)
          values
            (pg_temp.demo_uuid(v_visit_key), v_patient, pg_temp.demo_uuid(v_appt_key), v_provider,
             case v_visit_case
               when 0 then 'Refiere molestia leve al masticar del lado derecho.'
               when 1 then 'Asiste a limpieza programada; sin dolor.'
               else 'Control de rutina, sin molestias.'
             end,
             case v_visit_case
               when 0 then 'Pieza 16 con resina desgastada; gingiva sana.'
               when 1 then 'Cálculo moderado; encías con leve inflamación.'
               else 'Sin hallazgos patológicos; restauraciones estables.'
             end,
             case v_visit_case
               when 0 then 'Caries recurrente en pieza 16.'
               when 1 then 'Gingivitis generalizada leve.'
               else 'Control sano.'
             end,
             case v_visit_case
               when 0 then 'Reemplazo de resina en 16.'
               when 1 then 'Limpieza y reforzar higiene.'
               else 'Revisión en 6 meses.'
             end,
             case v_visit_case
               when 0 then 'Resina en pieza 16.'
               when 1 then 'Limpieza completa.'
               else 'Ninguno.'
             end,
             null)
          on conflict (id) do nothing;
          perform pg_temp.demo_reg('clinical_visits', pg_temp.demo_uuid(v_visit_key), v_visit_key);
        end if;
      end if;
    end loop;
  end loop;

  ------------------------------------------------------------------
  -- Cerrar horizonte
  ------------------------------------------------------------------
  insert into public.demo_data_meta (key, value, updated_at)
  values ('generated_through', to_char(v_horizon, 'YYYY-MM-DD'), now())
  on conflict (key) do update
    set value = excluded.value, updated_at = now();

  raise notice 'demo: set aplicado. Rango de citas % .. % (ancla %)',
    v_start, v_horizon, v_anchor;
END
$demo$;

COMMIT;
