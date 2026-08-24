-- The user-owned tables use RLS for row isolation, but PostgREST still needs
-- table privileges for the authenticated role to evaluate those policies.
grant select, insert, update, delete on table public.clients to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.user_load_catalog to authenticated;
grant select, insert, update, delete on table public.user_stock_items to authenticated;
grant select, insert, update, delete on table public.user_load_presets to authenticated;
grant select, insert, update, delete on table public.user_services to authenticated;

-- These are read-only catalogs consumed during the initial application load.
grant select on table public.load_catalog to authenticated;
grant select on table public.load_presets to authenticated;
