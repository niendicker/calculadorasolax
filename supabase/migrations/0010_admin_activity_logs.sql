-- Activity log for admin changes in products, approved combinations and rules.

create table if not exists admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  entity_type text not null check (
    entity_type in ('inverter', 'battery', 'accessory', 'solution', 'rule')
  ),
  action text not null check (action in ('create', 'update', 'delete', 'deactivate')),
  target_id uuid,
  target_label text not null,
  summary text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

alter table admin_activity_logs enable row level security;

create policy "public read admin_activity_logs"
  on admin_activity_logs for select
  using (true);

create policy "public write admin_activity_logs"
  on admin_activity_logs for insert
  with check (true);

create index if not exists admin_activity_logs_created_idx
  on admin_activity_logs (created_at desc);

create index if not exists admin_activity_logs_entity_idx
  on admin_activity_logs (entity_type, action, created_at desc);
