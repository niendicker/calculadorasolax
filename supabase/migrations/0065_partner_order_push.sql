-- Lets specific suppliers receive purchase orders placed here via their own
-- Partner API (POST {base_url}/api/partner/orders), on top of the existing
-- one-way catalog pull. Only one supplier implements this exact contract
-- today (SolaX Nexo — see "Partner API — catálogo e pedidos"), so this is a
-- fixed integration behind a flag, not a generic/configurable push mechanism.
--
-- The flag lives on `suppliers` (not `supplier_integrations`) because
-- ordinary users — who need to know whether their order can be pushed before
-- placing it — can already read `suppliers` (see "users read enabled
-- suppliers"), but never `supplier_integrations`, which holds credentials.

alter table public.suppliers
  add column if not exists supports_partner_orders boolean not null default false;

-- The partner identifies products by their own catalog id (a uuid), not by
-- the sku we already store — captured during sync (see the `catalog_id`
-- mapping field) so an order push has something to send as `items[].catalog_id`.
alter table public.supplier_product_mappings
  add column if not exists external_product_id text;

-- Mirrors cancel_purchase_order's ownership + status-guard pattern: the
-- actual HTTP call to the partner happens in the Next.js route (plpgsql
-- can't do outbound HTTP), but the resulting state change goes through this
-- security-definer function so a plain user session can apply it despite
-- purchase_orders only allowing admin updates directly.
create or replace function public.submit_purchase_order_to_partner(
  p_order_id uuid, p_external_order_id text, p_message text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous text;
begin
  select status into v_previous from public.purchase_orders
  where id = p_order_id and user_id = auth.uid() and status = 'requested' and external_order_id is null
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'order_not_submittable';
  end if;

  update public.purchase_orders
    set status = 'submitted', external_order_id = p_external_order_id, submitted_at = now(), updated_at = now()
    where id = p_order_id;

  insert into public.purchase_order_events (order_id, actor_id, event_type, from_status, to_status, message)
  values (p_order_id, auth.uid(), 'submitted_to_partner', v_previous, 'submitted', p_message);
end;
$$;

revoke all on function public.submit_purchase_order_to_partner(uuid, text, text) from public;
grant execute on function public.submit_purchase_order_to_partner(uuid, text, text) to authenticated;
