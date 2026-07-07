-- Personal load presets: a user's own one-click load bundles, kept separate
-- from the admin-managed global load_presets (mirrors load_catalog vs
-- user_load_catalog). Capped at ACCOUNT_LIMITS.userPresets (lib/limits.ts).

create table if not exists user_load_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  loads jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_load_presets_user_id_idx on user_load_presets (user_id);

alter table user_load_presets enable row level security;

create policy "users manage own load presets"
  on user_load_presets for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists user_load_presets_limit_check on user_load_presets;
create trigger user_load_presets_limit_check
  before insert on user_load_presets
  for each row execute function enforce_user_row_limit(3);
