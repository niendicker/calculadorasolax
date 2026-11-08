set test.admin='true';
set test.uid='00000000-0000-0000-0000-000000000001';
-- The disposable base only declares a subset of production cabinet fields.
alter table public.ci_bess_products add column updated_at timestamptz default now();
create temporary table noop_generation as select public.ci_begin_solution_generation(public.ci_solution_source()->>'revision',1) id;
select public.ci_append_solution_generation(id,jsonb_build_array((select solution from public.ci_generated_solutions where solution_key='port-fixture' limit 1))) from noop_generation;
create temporary table noop_revision as select public.ci_solution_source()->>'revision' revision;
-- The reported failure happened on Save with no field changes. Even while
-- generating, a timestamp-only save must neither stale nor cancel the draft.
update public.ci_bess_products set active=active,updated_at=clock_timestamp();
update public.ci_pcs_specs set updated_at=clock_timestamp();
do $$begin
 if (select revision from noop_revision)<>public.ci_solution_source()->>'revision' then raise exception 'No-op changed source revision';end if;
end $$;
select public.ci_publish_solution_generation(id) from noop_generation;
update public.ci_bess_products set active=active,updated_at=clock_timestamp();
update public.ci_compatibility_rules set notes=notes,updated_at=clock_timestamp();
do $$begin
 if not exists(select 1 from public.ci_solution_generations where id=(select id from noop_generation) and is_current and invalidated_at is null) then raise exception 'No-op invalidated published generation';end if;
end $$;
-- Ordinary users must still see the unchanged generation and its solution.
set role authenticated;
set test.admin='false';
do $$begin
 if (select count(*) from public.ci_solution_generations where is_current)<>1 or (select count(*) from public.ci_generated_solutions)<>1 then raise exception 'No-op broke user catalog visibility';end if;
 begin perform public.ci_solution_source();raise exception 'Nonadmin source allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set test.admin='true';
-- Actual changes still invalidate, keep history and stop in-flight drafts.
create temporary table changed_generation as select public.ci_begin_solution_generation(public.ci_solution_source()->>'revision',0) id;
update public.ci_bess_products set active=not active;
do $$begin
 if exists(select 1 from public.ci_solution_generations where is_current) then raise exception 'Real change did not invalidate';end if;
 if (select revision from noop_revision)=public.ci_solution_source()->>'revision' then raise exception 'Real change left revision unchanged';end if;
 if not exists(select 1 from public.ci_solution_generations where id=(select id from noop_generation) and invalidation_reason='ci_bess_products') then raise exception 'Invalidation reason lost';end if;
 if not exists(select 1 from public.ci_generated_solutions where generation_id=(select id from noop_generation)) then raise exception 'History lost';end if;
 begin perform public.ci_publish_solution_generation((select id from changed_generation));raise exception 'Stale generation accepted';exception when raise_exception then if sqlerrm not like 'O catálogo mudou%' then raise;end if;end;
end $$;
-- INSERT/DELETE do not have two row images, and must continue invalidating.
create temporary table insert_generation as select public.ci_begin_solution_generation(public.ci_solution_source()->>'revision',0) id;
select public.ci_publish_solution_generation(id) from insert_generation;
insert into public.ci_bess_products(id,active) values('00000000-0000-0000-0000-000000000099',false);
do $$begin if exists(select 1 from public.ci_solution_generations where is_current) then raise exception 'Insert did not invalidate';end if;end $$;
create temporary table delete_generation as select public.ci_begin_solution_generation(public.ci_solution_source()->>'revision',0) id;
select public.ci_publish_solution_generation(id) from delete_generation;
delete from public.ci_bess_products where id='00000000-0000-0000-0000-000000000099';
do $$begin if exists(select 1 from public.ci_solution_generations where is_current) then raise exception 'Delete did not invalidate';end if;end $$;
select 'No-op saves: stable revision, publication, current catalog, real changes, history and RLS verified' result;
