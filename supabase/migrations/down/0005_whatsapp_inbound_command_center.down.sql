-- Roll back WhatsApp inbound agent and Command Center data foundation.

drop policy if exists "crm_sync_events_admin_all" on crm_sync_events;
drop policy if exists "whatsapp_status_callbacks_admin_all" on whatsapp_message_status_callbacks;
drop policy if exists "whatsapp_knowledge_entries_admin_all" on whatsapp_knowledge_entries;
drop policy if exists "whatsapp_escalations_admin_all" on whatsapp_escalations;
drop policy if exists "whatsapp_intents_admin_all" on whatsapp_intents;
drop policy if exists "whatsapp_messages_admin_all" on whatsapp_messages;
drop policy if exists "whatsapp_conversations_admin_all" on whatsapp_conversations;
drop policy if exists "whatsapp_contacts_admin_all" on whatsapp_contacts;

drop table if exists crm_sync_events;
drop table if exists whatsapp_message_status_callbacks;
drop table if exists whatsapp_knowledge_entries;
drop table if exists whatsapp_escalations;
drop table if exists whatsapp_intents;
drop table if exists whatsapp_messages;
drop table if exists whatsapp_conversations;
drop table if exists whatsapp_contacts;

drop function if exists set_whatsapp_contact_linked_patient();
drop function if exists resolve_whatsapp_contact_patient_id(text);
drop function if exists normalize_whatsapp_phone(text);
