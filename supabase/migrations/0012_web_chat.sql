-- Web Chat: sesiones y mensajes para el widget embebible
-- Canal independiente de WhatsApp. El teléfono se pide manualmente al agendar.

create table if not exists web_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  origin text not null default 'widget',
  phone_e164 text,
  flow_state jsonb,
  last_intent text,
  summary text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now(),
  metadata jsonb
);

create index if not exists idx_web_chat_sessions_status
  on web_chat_sessions (status, last_activity desc);

create table if not exists web_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references web_chat_sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_web_chat_messages_session
  on web_chat_messages (session_id, created_at);
