-- Personal services catalog: freely-named line items (e.g. "Instalação",
-- "Frete", "Mão de obra") a user defines with their own price, separate from
-- user_stock_items (which prices admin-catalog products). Added to a
-- project's services list to compose the final solution cost alongside
-- inverter/battery/accessories. Capped at ACCOUNT_LIMITS.userServices
-- (lib/limits.ts).

create table if not exists user_services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unit_value numeric(12, 2) not null check (unit_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_services_user_id_idx on user_services (user_id);

alter table user_services enable row level security;

create policy "users manage own services"
  on user_services for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists user_services_limit_check on user_services;
create trigger user_services_limit_check
  before insert on user_services
  for each row execute function enforce_user_row_limit(10);

-- Projects reference services by id + qty, snapshotting the name at add time
-- so a line item still reads sensibly even if the service is later renamed
-- or removed from the user's catalog (price then shows as unresolved, same
-- as an accessory/product missing from userStockItems).
alter table projects
  add column if not exists services jsonb not null default '[]'::jsonb;
