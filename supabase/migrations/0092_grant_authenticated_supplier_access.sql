-- RLS controls which rows each authenticated user may access, while these
-- table grants allow PostgREST to evaluate those policies at all. The grants
-- deliberately mirror the operations covered by the supplier policies.
grant select, insert, update, delete on table public.suppliers to authenticated;
grant select, insert, update, delete on table public.supplier_integrations to authenticated;
grant select, insert, update, delete on table public.supplier_product_mappings to authenticated;
grant select, insert, update, delete on table public.supplier_offers to authenticated;
grant select, insert, update, delete on table public.supplier_sync_runs to authenticated;
grant select, insert, delete on table public.user_supplier_preferences to authenticated;
grant select, update on table public.app_settings to authenticated;
grant select, update on table public.purchase_orders to authenticated;
grant select on table public.purchase_order_items to authenticated;
grant select on table public.purchase_order_events to authenticated;
grant select on table public.supplier_quote_requests to authenticated;
