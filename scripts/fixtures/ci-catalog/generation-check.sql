set test.admin='true';
set test.uid='00000000-0000-0000-0000-000000000001';
create temporary table generation_test as select public.ci_begin_solution_generation(public.ci_solution_source()->>'revision',1) id;
-- Incomplete drafts cannot replace a published generation.
do $$begin
 begin perform public.ci_publish_solution_generation((select id from generation_test));raise exception 'Incomplete generation accepted';
 exception when raise_exception then if sqlerrm not like 'Geração incompleta%' then raise;end if;end;
end $$;
select public.ci_append_solution_generation(id,jsonb_build_array(jsonb_build_object(
 'contractVersion','ci-grouped-v1','key','fixture','source',jsonb_build_object('kind','cabinet','id','00000000-0000-0000-0000-000000000002'),
 'counts',jsonb_build_object('units',1,'series',1,'parallel',1),'ac',jsonb_build_object('dischargePowerKw',100,'chargePowerKw',80),
 'storage',jsonb_build_object('usableEnergyKwh',170,'nominalEnergyKwh',200),'applications',jsonb_build_array('peak_shaving')))) from generation_test;
set role authenticated;
set test.admin='false';
do $$begin
 if exists(select 1 from public.ci_generated_solutions) then raise exception 'Draft visible';end if;
 begin perform public.ci_solution_source();raise exception 'Nonadmin source allowed';exception when insufficient_privilege then null;end;
 begin delete from public.ci_generated_solutions;raise exception 'Client mutation allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set test.admin='true';
select public.ci_publish_solution_generation(id) from generation_test;
set role authenticated;
set test.admin='false';
do $$begin
 if (select count(*) from public.ci_generated_solutions)<>1 then raise exception 'Published generation invisible';end if;
end $$;
reset role;
set test.admin='true';
-- A real catalog edit invalidates new calculations, preserving snapshots.
update public.ci_bess_products set active=active;
do $$begin
 if exists(select 1 from public.ci_solution_generations where is_current) then raise exception 'Catalog edit did not invalidate';end if;
 if (select count(*) from public.ci_generated_solutions)<>1 then raise exception 'Historical solution lost';end if;
end $$;
create temporary table stale_test as select public.ci_begin_solution_generation(public.ci_solution_source()->>'revision',0) id;
insert into public.ci_bess_products(id,active) values(gen_random_uuid(),false);
do $$begin
 begin perform public.ci_publish_solution_generation((select id from stale_test));raise exception 'Stale generation accepted';
 exception when raise_exception then if sqlerrm not like 'O catálogo mudou%' then raise;end if;end;
end $$;
select 'Grouped generations: publication, RLS, invalidation and history verified' result;
-- Reject malformed contracts even when their numerical filter columns are present.
do $$declare draft uuid; payload jsonb;begin
 draft:=public.ci_begin_solution_generation(public.ci_solution_source()->>'revision',1);
 select solution-'contractVersion' into payload from public.ci_generated_solutions limit 1;
 begin perform public.ci_append_solution_generation(draft,jsonb_build_array(payload));raise exception 'Missing contract version accepted';exception when check_violation then null;end;
 perform public.ci_cancel_solution_generation(draft);
end $$;
