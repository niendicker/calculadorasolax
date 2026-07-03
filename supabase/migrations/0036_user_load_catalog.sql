-- Personal load catalog: loads a user adds manually get saved here for reuse,
-- kept separate from the admin-managed global load_catalog.

create table if not exists user_load_catalog (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  power_w numeric not null,
  ip_in_ratio numeric not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_load_catalog_user_id_idx on user_load_catalog (user_id);

alter table user_load_catalog enable row level security;

create policy "users manage own load catalog"
  on user_load_catalog for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
