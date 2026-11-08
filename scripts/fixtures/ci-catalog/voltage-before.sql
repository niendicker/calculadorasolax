set test.admin='true';
set test.uid='00000000-0000-0000-0000-000000000001';
create temporary table before_voltage_generation as select public.ci_begin_solution_generation(public.ci_solution_source()->>'revision',0) id;
select public.ci_publish_solution_generation(id) from before_voltage_generation;
