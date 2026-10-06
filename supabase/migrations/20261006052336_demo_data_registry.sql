-- Registro del set de datos demo.
-- Toda fila insertada por scripts/demo/seed-demo-data.sql se anota en
-- demo_data_registry para poder borrarla sin tocar datos reales.
-- demo_data_meta guarda el ancla temporal del set (anchor_date) y el último
-- día generado (generated_through) para poder extenderlo sin duplicar.

create table if not exists public.demo_data_registry (
  entity_table text not null check (entity_table <> ''),
  record_id uuid not null,
  entity_key text not null unique,
  created_at timestamptz not null default now(),
  primary key (entity_table, record_id)
);

create table if not exists public.demo_data_meta (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create or replace trigger demo_data_meta_set_updated_at
  before update on public.demo_data_meta
  for each row execute function set_updated_at();

alter table public.demo_data_registry enable row level security;
alter table public.demo_data_meta enable row level security;

drop policy if exists demo_data_registry_admin_all on public.demo_data_registry;
create policy demo_data_registry_admin_all
  on public.demo_data_registry for all to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists demo_data_meta_admin_all on public.demo_data_meta;
create policy demo_data_meta_admin_all
  on public.demo_data_meta for all to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
