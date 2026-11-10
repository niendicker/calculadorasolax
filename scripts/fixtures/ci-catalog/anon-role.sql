do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
