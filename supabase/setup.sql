-- Run this once in Supabase: SQL Editor > New query > paste > Run.
create table if not exists public.dusk_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Lock it down. Only the server's secret key can read or write it.
alter table public.dusk_state enable row level security;
