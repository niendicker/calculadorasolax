set test.admin='true';
set test.uid='00000000-0000-0000-0000-000000000001';
do $$begin
 if exists(select 1 from public.ci_solution_generations where is_current) then raise exception 'Old generation remained current';end if;
 if exists(select 1 from public.ci_compatibility_rules where approval_status='approved') then raise exception 'Old topology silently approved';end if;
 if not exists(select 1 from public.ci_compatibility_rules where legacy_connection_config is not null) then raise exception 'Old topology lost';end if;
 if not exists(select 1 from public.ci_generated_solutions where solution->>'contractVersion'='ci-grouped-v1') then raise exception 'Historical solution lost';end if;
end $$;
-- Two independent ports, each with a two-module bank, do not violate the
-- battery's two-module association or the old generic inverter quantity=1.
update public.ci_compatibility_rules set min_ports_per_pcs=1,max_ports_per_pcs=2,min_parallel_strings=1,max_parallel_strings=1,approval_status='approved' where id='00000000-0000-0000-0000-000000000007';
do $$begin
 begin update public.ci_compatibility_rules set max_ports_per_pcs=3 where id='00000000-0000-0000-0000-000000000007';raise exception 'Too many ports accepted';exception when raise_exception then if sqlerrm not like 'As portas utilizadas%' then raise;end if;end;
 begin update public.ci_compatibility_rules set max_parallel_strings=2 where id='00000000-0000-0000-0000-000000000007';raise exception 'Unapproved parallel accepted';exception when raise_exception then if sqlerrm not like 'As strings por porta%' then raise;end if;end;
end $$;
create temporary table port_generation as select public.ci_begin_solution_generation(public.ci_solution_source()->>'revision',1) id;
select public.ci_append_solution_generation(id,jsonb_build_array(jsonb_build_object(
 'contractVersion','ci-grouped-v2','key','port-fixture','source',jsonb_build_object('kind','assembly','id','00000000-0000-0000-0000-000000000007'),
 'counts',jsonb_build_object('units',1,'ports',2),'dc',jsonb_build_object('ports',jsonb_build_array(jsonb_build_object('series',7,'parallelStrings',1),jsonb_build_object('series',14,'parallelStrings',1))),
 'ac',jsonb_build_object('dischargePowerKw',60,'chargePowerKw',60),'storage',jsonb_build_object('usableEnergyKwh',270.27,'nominalEnergyKwh',300.3),'applications',jsonb_build_array('peak_shaving')))) from port_generation;
select public.ci_publish_solution_generation(id) from port_generation;
do $$begin
 if not exists(select 1 from public.ci_generated_solutions where solution_key='port-fixture' and port_count=2 and series_count=7 and series_max_count=14 and parallel_count=1 and parallel_max_count=1) then raise exception 'Port bounds were not persisted';end if;
end $$;
set role authenticated;
set test.admin='false';
do $$begin
 if (select count(*) from public.ci_generated_solutions)<>1 then raise exception 'Current/history RLS broken';end if;
 begin update public.ci_generated_solutions set port_count=3;raise exception 'Immutable topology was writable';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'Independent ports: migration, approval, generation bounds, history and RLS verified' result;

-- The C&I extension must not widen the residential catalog's port restriction.
insert into public.ci_inverters(id,model,battery_ports) values(gen_random_uuid(),'PCS com quatro portas',4);
do $$begin
 begin insert into public.inverters(id,battery_ports) values(gen_random_uuid(),4);raise exception 'Residential port constraint changed';exception when check_violation then null;end;
end $$;
