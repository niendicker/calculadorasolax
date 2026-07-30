-- Supplier procurement: public supplier capabilities, restricted integrations,
-- normalized offers and atomic, idempotent purchase requests.

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  active boolean not null default true,
  ordering_enabled boolean not null default false,
  order_mode text not null default 'quote' check (order_mode in ('quote', 'direct', 'both')),
  description text,
  logo_url text,
  website_url text,
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  minimum_order_value numeric(14,2) not null default 0 check (minimum_order_value >= 0),
  payment_terms text,
  shipping_terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.supplier_integrations (
  supplier_id uuid primary key references public.suppliers(id) on delete cascade,
  connector_type text not null default 'manual' check (connector_type in ('manual', 'generic_json')),
  base_url text,
  products_path text not null default '',
  auth_type text not null default 'none' check (auth_type in ('none', 'bearer', 'api_key')),
  credential_env_key text,
  api_key_header text not null default 'x-api-key',
  mapping jsonb not null default '{"items":"items","sku":"sku","price":"price","stock":"stock","lead_days":"lead_days"}'::jsonb,
  enabled boolean not null default false,
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status in ('success', 'partial', 'error')),
  last_sync_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (base_url is null or base_url ~ '^https://')
);

create table public.supplier_product_mappings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  product_type text not null check (product_type in ('inverter', 'battery', 'accessory')),
  product_model text not null,
  supplier_sku text not null,
  pack_quantity integer not null default 1 check (pack_quantity > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, supplier_sku),
  unique (supplier_id, product_type, product_model)
);

create table public.supplier_offers (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null unique references public.supplier_product_mappings(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  unit_price numeric(14,2) not null check (unit_price >= 0),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  minimum_quantity integer not null default 1 check (minimum_quantity > 0),
  valid_until timestamptz,
  fetched_at timestamptz not null default now(),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.supplier_sync_runs (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  status text not null check (status in ('running', 'success', 'partial', 'error')),
  items_received integer not null default 0,
  items_updated integer not null default 0,
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  request_type text not null check (request_type in ('quote', 'direct')),
  status text not null default 'requested' check (status in ('requested', 'under_review', 'quoted', 'approved', 'submitted', 'confirmed', 'cancelled', 'rejected', 'fulfilled')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  shipping_amount numeric(14,2),
  tax_amount numeric(14,2),
  total_amount numeric(14,2),
  delivery_address jsonb not null default '{}'::jsonb,
  customer_notes text,
  supplier_notes text,
  idempotency_key uuid not null,
  external_order_id text,
  quoted_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.purchase_orders(id) on delete cascade,
  offer_id uuid references public.supplier_offers(id) on delete set null,
  product_type text not null check (product_type in ('inverter', 'battery', 'accessory')),
  product_model text not null,
  supplier_sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_price) stored
);

create table public.purchase_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.purchase_orders(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  message text,
  created_at timestamptz not null default now()
);

create index supplier_mappings_product_idx on public.supplier_product_mappings (product_type, product_model) where active;
create index supplier_offers_supplier_idx on public.supplier_offers (supplier_id) where active;
create index purchase_orders_user_idx on public.purchase_orders (user_id, created_at desc);
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id, created_at desc);
create index purchase_order_events_order_idx on public.purchase_order_events (order_id, created_at);

alter table public.suppliers enable row level security;
alter table public.supplier_integrations enable row level security;
alter table public.supplier_product_mappings enable row level security;
alter table public.supplier_offers enable row level security;
alter table public.supplier_sync_runs enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.purchase_order_events enable row level security;

create policy "users read enabled suppliers" on public.suppliers for select to authenticated
  using (active and ordering_enabled or public.is_admin());
create policy "admins manage suppliers" on public.suppliers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admins manage integrations" on public.supplier_integrations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "users read active mappings" on public.supplier_product_mappings for select to authenticated
  using (active or public.is_admin());
create policy "admins manage mappings" on public.supplier_product_mappings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "users read current offers" on public.supplier_offers for select to authenticated
  using ((active and (valid_until is null or valid_until > now()) and exists (
    select 1 from public.suppliers s where s.id = supplier_id and s.active and s.ordering_enabled
  )) or public.is_admin());
create policy "admins manage offers" on public.supplier_offers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admins read sync runs" on public.supplier_sync_runs for select to authenticated using (public.is_admin());
create policy "users read own orders" on public.purchase_orders for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "admins update orders" on public.purchase_orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "users read own order items" on public.purchase_order_items for select to authenticated
  using (exists (select 1 from public.purchase_orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
create policy "users read own order events" on public.purchase_order_events for select to authenticated
  using (exists (select 1 from public.purchase_orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));

create or replace function public.create_purchase_order(
  p_supplier_id uuid,
  p_request_type text,
  p_items jsonb,
  p_idempotency_key uuid,
  p_project_id uuid default null,
  p_delivery_address jsonb default '{}'::jsonb,
  p_customer_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_supplier public.suppliers%rowtype;
  v_order_id uuid;
  v_subtotal numeric(14,2);
  v_item_count integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_request_type not in ('quote', 'direct') then raise exception using errcode = '22023', message = 'invalid_request_type'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception using errcode = '22023', message = 'invalid_items';
  end if;

  select * into v_supplier from public.suppliers where id = p_supplier_id and active and ordering_enabled for share;
  if not found then raise exception using errcode = '22023', message = 'supplier_unavailable'; end if;
  if p_request_type = 'quote' and v_supplier.order_mode not in ('quote', 'both') then raise exception using errcode = '22023', message = 'quote_not_supported'; end if;
  if p_request_type = 'direct' and v_supplier.order_mode not in ('direct', 'both') then raise exception using errcode = '22023', message = 'direct_order_not_supported'; end if;
  if p_project_id is not null and not exists (select 1 from public.projects where id = p_project_id and user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'invalid_project';
  end if;

  select count(*), sum(o.unit_price * (item->>'quantity')::integer)
    into v_item_count, v_subtotal
  from jsonb_array_elements(p_items) item
  join public.supplier_offers o on o.id = (item->>'offer_id')::uuid
  join public.supplier_product_mappings m on m.id = o.mapping_id
  where o.supplier_id = p_supplier_id and m.supplier_id = p_supplier_id
    and o.active and m.active and (o.valid_until is null or o.valid_until > now())
    and (item->>'quantity') ~ '^[1-9][0-9]*$'
    and (item->>'quantity')::integer >= o.minimum_quantity
    and (o.stock_quantity is null or (item->>'quantity')::integer <= o.stock_quantity);

  if v_item_count <> jsonb_array_length(p_items) then raise exception using errcode = '22023', message = 'invalid_or_unavailable_offer'; end if;
  if v_subtotal < v_supplier.minimum_order_value then raise exception using errcode = '22023', message = 'minimum_order_not_reached'; end if;

  insert into public.purchase_orders (user_id, supplier_id, project_id, request_type, currency, subtotal, total_amount, delivery_address, customer_notes, idempotency_key)
  values (v_user_id, p_supplier_id, p_project_id, p_request_type, v_supplier.currency, v_subtotal, v_subtotal, coalesce(p_delivery_address, '{}'::jsonb), nullif(trim(p_customer_notes), ''), p_idempotency_key)
  on conflict (user_id, idempotency_key) do nothing returning id into v_order_id;
  if v_order_id is null then select id into v_order_id from public.purchase_orders where user_id = v_user_id and idempotency_key = p_idempotency_key; return v_order_id; end if;

  insert into public.purchase_order_items (order_id, offer_id, product_type, product_model, supplier_sku, quantity, unit_price)
  select v_order_id, o.id, m.product_type, m.product_model, m.supplier_sku, (item->>'quantity')::integer, o.unit_price
  from jsonb_array_elements(p_items) item
  join public.supplier_offers o on o.id = (item->>'offer_id')::uuid
  join public.supplier_product_mappings m on m.id = o.mapping_id;

  insert into public.purchase_order_events (order_id, actor_id, event_type, to_status, message)
  values (v_order_id, v_user_id, 'created', 'requested', case when p_request_type = 'quote' then 'Cotação solicitada.' else 'Pedido criado.' end);
  return v_order_id;
end;
$$;

revoke all on function public.create_purchase_order(uuid,text,jsonb,uuid,uuid,jsonb,text) from public;
grant execute on function public.create_purchase_order(uuid,text,jsonb,uuid,uuid,jsonb,text) to authenticated;

create or replace function public.cancel_purchase_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_previous text;
begin
  select status into v_previous from public.purchase_orders
  where id = p_order_id and user_id = auth.uid() and status in ('requested', 'under_review', 'quoted') for update;
  if not found then raise exception using errcode = '22023', message = 'order_cannot_be_cancelled'; end if;
  update public.purchase_orders set status = 'cancelled', updated_at = now() where id = p_order_id;
  insert into public.purchase_order_events (order_id, actor_id, event_type, from_status, to_status, message)
  values (p_order_id, auth.uid(), 'cancelled', v_previous, 'cancelled', 'Pedido cancelado pelo usuário.');
end; $$;

revoke all on function public.cancel_purchase_order(uuid) from public;
grant execute on function public.cancel_purchase_order(uuid) to authenticated;

create or replace function public.admin_transition_purchase_order(
  p_order_id uuid, p_status text, p_message text default null,
  p_shipping_amount numeric default null, p_tax_amount numeric default null,
  p_external_order_id text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_previous text; v_subtotal numeric;
begin
  if not public.is_admin() then raise exception using errcode = '42501', message = 'admin_required'; end if;
  if p_status not in ('requested', 'under_review', 'quoted', 'approved', 'submitted', 'confirmed', 'cancelled', 'rejected', 'fulfilled') then
    raise exception using errcode = '22023', message = 'invalid_status';
  end if;
  select status, subtotal into v_previous, v_subtotal from public.purchase_orders where id = p_order_id for update;
  if not found then raise exception using errcode = '22023', message = 'order_not_found'; end if;
  update public.purchase_orders set status = p_status,
    shipping_amount = coalesce(p_shipping_amount, shipping_amount), tax_amount = coalesce(p_tax_amount, tax_amount),
    total_amount = v_subtotal + coalesce(p_shipping_amount, shipping_amount, 0) + coalesce(p_tax_amount, tax_amount, 0),
    external_order_id = coalesce(nullif(trim(p_external_order_id), ''), external_order_id),
    quoted_at = case when p_status = 'quoted' then now() else quoted_at end,
    submitted_at = case when p_status = 'submitted' then now() else submitted_at end, updated_at = now()
  where id = p_order_id;
  insert into public.purchase_order_events (order_id, actor_id, event_type, from_status, to_status, message)
  values (p_order_id, auth.uid(), 'status_changed', v_previous, p_status, nullif(trim(p_message), ''));
end; $$;

revoke all on function public.admin_transition_purchase_order(uuid,text,text,numeric,numeric,text) from public;
grant execute on function public.admin_transition_purchase_order(uuid,text,text,numeric,numeric,text) to authenticated;
