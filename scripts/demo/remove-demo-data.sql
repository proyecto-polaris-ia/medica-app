-- ============================================================
-- Set de datos DEMO — borrado por registro
-- ============================================================
-- Uso (Supabase local):
--   npm run demo:wipe
-- Uso (producción u otro entorno):
--   Ejecutar este archivo contra la base con psql o el SQL editor.
--
-- Elimina ÚNICAMENTE las filas anotadas en demo_data_registry, en orden
-- FK-safe. Los datos reales (proveedores, pacientes, citas existentes)
-- no se tocan. Al final limpia el registro y los metadatos del set, de
-- modo que el siguiente seed re-ancla el historial a la nueva fecha.
-- ============================================================

BEGIN;

-- Dependientes directos de citas/planes/pacientes
delete from public.appointment_reminders
  where id in (select record_id from public.demo_data_registry where entity_table = 'appointment_reminders');

delete from public.payment_reminders
  where id in (select record_id from public.demo_data_registry where entity_table = 'payment_reminders');

delete from public.payment_intents
  where id in (select record_id from public.demo_data_registry where entity_table = 'payment_intents');

delete from public.follow_up_message_drafts
  where id in (select record_id from public.demo_data_registry where entity_table = 'follow_up_message_drafts');

delete from public.follow_up_contacts
  where id in (select record_id from public.demo_data_registry where entity_table = 'follow_up_contacts');

delete from public.payments
  where id in (select record_id from public.demo_data_registry where entity_table = 'payments');

delete from public.treatment_plan_items
  where id in (select record_id from public.demo_data_registry where entity_table = 'treatment_plan_items');

delete from public.treatment_plans
  where id in (select record_id from public.demo_data_registry where entity_table = 'treatment_plans');

delete from public.clinical_visits
  where id in (select record_id from public.demo_data_registry where entity_table = 'clinical_visits');

delete from public.appointments
  where id in (select record_id from public.demo_data_registry where entity_table = 'appointments');

delete from public.patient_medical_history
  where patient_id in (select record_id from public.demo_data_registry where entity_table = 'patient_medical_history');

delete from public.whatsapp_contacts
  where id in (select record_id from public.demo_data_registry where entity_table = 'whatsapp_contacts');

delete from public.patients
  where id in (select record_id from public.demo_data_registry where entity_table = 'patients');

-- Horarios demo (el registro usa el id del proveedor como record_id)
delete from public.business_hours
  where provider_id in (select record_id from public.demo_data_registry where entity_table = 'business_hours');

delete from public.providers
  where id in (select record_id from public.demo_data_registry where entity_table = 'providers');

-- Limpiar el registro y los metadatos del set
delete from public.demo_data_registry;
delete from public.demo_data_meta;

COMMIT;
