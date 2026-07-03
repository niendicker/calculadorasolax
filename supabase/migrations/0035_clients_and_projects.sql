-- Client registry + server-side projects, so a project can reference a
-- registered client instead of duplicating name/email/phone/document per
-- project, and projects are no longer stuck in a single browser's localStorage.

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  document text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_user_id_idx on clients (user_id);

alter table clients enable row level security;

create policy "users manage own clients"
  on clients for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  name text not null,
  address text,
  notes text,
  residential_options jsonb not null default '{}'::jsonb,
  solution jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on projects (user_id);
create index if not exists projects_client_id_idx on projects (client_id);

alter table projects enable row level security;

create policy "users manage own projects"
  on projects for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
