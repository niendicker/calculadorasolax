-- Personal product stock: a user picks products from the admin catalog and
-- sets their own value for each, used later to estimate a project's total
-- system cost. Not a physical stock (no quantity/reservation tracking) —
-- just a per-user price list keyed by product model.

create table if not exists user_stock_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_type text not null check (product_type in ('inverter', 'battery', 'accessory')),
  product_model text not null,
  unit_value numeric(12, 2) not null check (unit_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_type, product_model)
);

create index if not exists user_stock_items_user_id_idx on user_stock_items (user_id);

alter table user_stock_items enable row level security;

create policy "users manage own stock items"
  on user_stock_items for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
