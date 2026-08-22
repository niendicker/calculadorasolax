begin;

select plan(10);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.projects'::regclass),
  'projects has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.quote_shares'::regclass),
  'quote_shares has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.project_events'::regclass),
  'project_events has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.app_simulations'::regclass),
  'app_simulations has RLS enabled'
);

select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'projects'
    and policyname = 'users manage own projects'
    and qual ilike '%auth.uid()%'
    and with_check ilike '%auth.uid()%'
), 'projects policy is owner-scoped');

select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'quote_shares'
    and policyname = 'users insert own quote shares'
    and with_check ilike '%auth.uid()%'
    and with_check ilike '%projects%'
), 'quote share inserts require the authenticated owner project');

select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'quote_shares'
    and policyname = 'users update own quote shares'
    and qual ilike '%auth.uid()%'
    and with_check ilike '%auth.uid()%'
), 'quote share updates are owner-scoped');

select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'project_events'
    and policyname = 'users insert own project events'
    and with_check ilike '%projects%'
    and with_check ilike '%auth.uid()%'
), 'project event inserts require the project owner');

select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'app_simulations'
    and policyname = 'authenticated insert own app simulations'
    and with_check ilike '%auth.uid()%'
    and with_check ilike '%user_id%'
), 'simulation metrics require the authenticated user id');

select ok(not exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'app_simulations'
    and policyname = 'anyone insert app simulations'
), 'anonymous simulation insert policy is absent');

select * from finish();
rollback;
