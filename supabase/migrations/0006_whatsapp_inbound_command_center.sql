-- WhatsApp inbound agent and Command Center data foundation.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function normalize_whatsapp_phone(phone text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '');
$$;

create table if not exists whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null unique,
  whatsapp_profile_name text,
  display_name text,
  linked_patient_id uuid references patients(id) on delete set null,
  linked_patient_source text check (linked_patient_source is null or linked_patient_source in ('auto_phone', 'manual')),
  linked_patient_matched_at timestamptz,
  source text not null default 'whatsapp',
  opt_in_status text not null default 'unknown' check (opt_in_status in ('unknown', 'pending', 'opted_in', 'opted_out')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references whatsapp_contacts(id) on delete cascade,
  booking_context jsonb,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  status text not null default 'open' check (status in ('open', 'awaiting_agent', 'escalated', 'resolved', 'archived')),
  last_intent text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  contact_id uuid not null references whatsapp_contacts(id) on delete cascade,
  whatsapp_message_id text not null unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null default 'text',
  body text,
  media jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'responded', 'escalated', 'failed', 'sent', 'delivered', 'read')),
  occurred_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists whatsapp_intents (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  message_id uuid not null references whatsapp_messages(id) on delete cascade,
  contact_id uuid not null references whatsapp_contacts(id) on delete cascade,
  intent_type text not null default 'unknown' check (intent_type in ('inquiry', 'book_appointment', 'check_availability', 'reschedule_request', 'cancel_request', 'support', 'handoff', 'unknown')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  entities jsonb not null default '{}'::jsonb,
  summary text,
  status text not null default 'detected' check (status in ('detected', 'confirmed', 'dismissed', 'synced')),
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists whatsapp_escalations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  contact_id uuid not null references whatsapp_contacts(id) on delete cascade,
  message_id uuid references whatsapp_messages(id) on delete set null,
  intent_id uuid references whatsapp_intents(id) on delete set null,
  reason text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'canceled')),
  summary text,
  assigned_to text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists whatsapp_knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  question text not null,
  answer text not null,
  tags text[] not null default '{}',
  source text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists whatsapp_message_status_callbacks (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references whatsapp_messages(id) on delete set null,
  whatsapp_message_id text not null,
  status text not null check (status in ('sent', 'delivered', 'read', 'failed')),
  recipient_phone text,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  callback_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crm_sync_events (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id uuid not null,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  event_key text unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'processed', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function resolve_whatsapp_contact_patient_id(phone text)
returns uuid
language sql
stable
as $$
  select id from patients where normalize_whatsapp_phone(phone_e164) = normalize_whatsapp_phone(phone) limit 1;
$$;

create or replace function set_whatsapp_contact_linked_patient()
returns trigger
language plpgsql
as $$
declare matched_patient_id uuid;
begin
  if new.linked_patient_id is not null and coalesce(new.linked_patient_source, 'manual') <> 'auto_phone' then
    new.linked_patient_source := coalesce(new.linked_patient_source, 'manual');
    new.linked_patient_matched_at := coalesce(new.linked_patient_matched_at, now());
    return new;
  end if;
  matched_patient_id := resolve_whatsapp_contact_patient_id(new.phone_e164);
  if matched_patient_id is not null then
    new.linked_patient_id := matched_patient_id;
    new.linked_patient_source := 'auto_phone';
    new.linked_patient_matched_at := now();
  elsif new.linked_patient_source = 'auto_phone' then
    new.linked_patient_id := null;
    new.linked_patient_source := null;
    new.linked_patient_matched_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_contacts_set_linked_patient on whatsapp_contacts;
create trigger whatsapp_contacts_set_linked_patient before insert or update of phone_e164, linked_patient_id, linked_patient_source on whatsapp_contacts for each row execute function set_whatsapp_contact_linked_patient();

do $$
declare table_name text;
begin
  foreach table_name in array array['whatsapp_contacts','whatsapp_conversations','whatsapp_intents','whatsapp_escalations','whatsapp_knowledge_entries','whatsapp_message_status_callbacks','crm_sync_events'] loop
    execute format('drop trigger if exists %I_set_updated_at on %I', table_name, table_name);
    execute format('create trigger %I_set_updated_at before update on %I for each row execute function set_updated_at()', table_name, table_name);
  end loop;
end $$;

create index if not exists idx_whatsapp_contacts_linked_patient_id on whatsapp_contacts(linked_patient_id);
create index if not exists idx_whatsapp_contacts_last_message_at on whatsapp_contacts(last_message_at desc);
create index if not exists idx_whatsapp_conversations_contact_id on whatsapp_conversations(contact_id);
create index if not exists idx_whatsapp_conversations_status on whatsapp_conversations(status);
create index if not exists idx_whatsapp_conversations_last_message_at on whatsapp_conversations(last_message_at desc);
create index if not exists idx_whatsapp_messages_conversation_id on whatsapp_messages(conversation_id);
create index if not exists idx_whatsapp_messages_contact_id on whatsapp_messages(contact_id);
create index if not exists idx_whatsapp_messages_status on whatsapp_messages(status);
create index if not exists idx_whatsapp_messages_occurred_at on whatsapp_messages(occurred_at desc);
create index if not exists idx_whatsapp_intents_conversation_id on whatsapp_intents(conversation_id);
create index if not exists idx_whatsapp_intents_status on whatsapp_intents(status);
create index if not exists idx_whatsapp_escalations_status on whatsapp_escalations(status);
create index if not exists idx_whatsapp_escalations_opened_at on whatsapp_escalations(opened_at desc);
create index if not exists idx_whatsapp_knowledge_entries_status on whatsapp_knowledge_entries(status);
create index if not exists idx_whatsapp_knowledge_entries_tags on whatsapp_knowledge_entries using gin(tags);
create index if not exists idx_whatsapp_status_callbacks_whatsapp_message_id on whatsapp_message_status_callbacks(whatsapp_message_id);

alter table whatsapp_contacts enable row level security;
alter table whatsapp_contacts force row level security;
alter table whatsapp_conversations enable row level security;
alter table whatsapp_conversations force row level security;
alter table whatsapp_messages enable row level security;
alter table whatsapp_messages force row level security;
alter table whatsapp_intents enable row level security;
alter table whatsapp_intents force row level security;
alter table whatsapp_escalations enable row level security;
alter table whatsapp_escalations force row level security;
alter table whatsapp_knowledge_entries enable row level security;
alter table whatsapp_knowledge_entries force row level security;
alter table whatsapp_message_status_callbacks enable row level security;
alter table whatsapp_message_status_callbacks force row level security;
alter table crm_sync_events enable row level security;
alter table crm_sync_events force row level security;

revoke all on whatsapp_contacts, whatsapp_conversations, whatsapp_messages, whatsapp_intents, whatsapp_escalations, whatsapp_knowledge_entries, whatsapp_message_status_callbacks, crm_sync_events from anon;
revoke all on whatsapp_contacts, whatsapp_conversations, whatsapp_messages, whatsapp_intents, whatsapp_escalations, whatsapp_knowledge_entries, whatsapp_message_status_callbacks, crm_sync_events from authenticated;
grant select, insert, update, delete on whatsapp_contacts, whatsapp_conversations, whatsapp_messages, whatsapp_intents, whatsapp_escalations, whatsapp_knowledge_entries, whatsapp_message_status_callbacks, crm_sync_events to authenticated;

create policy "whatsapp_contacts_admin_all" on whatsapp_contacts for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "whatsapp_conversations_admin_all" on whatsapp_conversations for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "whatsapp_messages_admin_all" on whatsapp_messages for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "whatsapp_intents_admin_all" on whatsapp_intents for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "whatsapp_escalations_admin_all" on whatsapp_escalations for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "whatsapp_knowledge_entries_admin_all" on whatsapp_knowledge_entries for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "whatsapp_status_callbacks_admin_all" on whatsapp_message_status_callbacks for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "crm_sync_events_admin_all" on crm_sync_events for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
