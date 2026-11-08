set test.admin='true';
set test.uid='00000000-0000-0000-0000-000000000001';
do $$begin
 if exists(select 1 from public.ci_solution_generations where is_current) then raise exception 'Old voltage-less catalog remained current';end if;
 if exists(select 1 from public.ci_bess_products where cardinality(ac_voltages_v)<>0) then raise exception 'Voltage was inferred';end if;
 begin update public.ci_bess_products set ac_voltages_v=array[400];raise exception 'Unsupported voltage accepted';exception when check_violation then null;end;
 begin update public.ci_bess_products set ac_voltages_v=array[220,null];raise exception 'Unknown voltage accepted';exception when check_violation then null;end;
end $$;
update public.ci_bess_products set ac_voltages_v=array[220,380];
create temporary table voltage_revision as select public.ci_solution_source()->>'revision' revision;
create temporary table voltage_generation as select public.ci_begin_solution_generation(public.ci_solution_source()->>'revision',1) id;
select public.ci_append_solution_generation(id,jsonb_build_array((select jsonb_set(solution,'{ac,lineVoltagesV}','[220,380]'::jsonb) from public.ci_generated_solutions where solution_key='port-fixture' limit 1))) from voltage_generation;
select public.ci_publish_solution_generation(id) from voltage_generation;
update public.ci_bess_products set ac_voltages_v=array[220,380],updated_at=clock_timestamp();
do $$begin
 if not exists(select 1 from public.ci_solution_generations where is_current) then raise exception 'No-op voltage save invalidated';end if;
end $$;
set role authenticated;
set test.admin='false';
do $$begin
 if not exists(select 1 from public.ci_generated_solutions where solution->'ac'->'lineVoltagesV'='[220,380]'::jsonb) then raise exception 'User cannot read published voltages';end if;
 begin update public.ci_bess_products set ac_voltages_v=array[220];raise exception 'User changed voltage';exception when insufficient_privilege then null;end;
end $$;
reset role;
set test.admin='true';
update public.ci_bess_products set ac_voltages_v=array[380];
do $$begin
 if exists(select 1 from public.ci_solution_generations where is_current) then raise exception 'Voltage change did not invalidate';end if;
 if (select revision from voltage_revision)=public.ci_solution_source()->>'revision' then raise exception 'Voltage change left revision unchanged';end if;
end $$;
select 'AC operating voltage: explicit declaration, invalidation, current user catalog and RLS verified' result;
