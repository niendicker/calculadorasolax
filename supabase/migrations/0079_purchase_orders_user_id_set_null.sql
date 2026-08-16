-- purchase_orders.user_id was "on delete restrict" (0063_supplier_procurement.sql),
-- unlike project_id/actor_id in the same table/purchase_order_events, which
-- already use "on delete set null" — this blocked delete_own_account (0078)
-- with "violates foreign key constraint purchase_orders_user_id_fkey" for
-- any user who had ever placed an order. A purchase order is also the
-- supplier's own transactional record, not just the buyer's, so it should
-- survive account deletion (LGPD erasure of the buyer's identity, not the
-- order itself) instead of cascading — same treatment as project_id/actor_id.
alter table public.purchase_orders
  alter column user_id drop not null;

alter table public.purchase_orders
  drop constraint purchase_orders_user_id_fkey,
  add constraint purchase_orders_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;
