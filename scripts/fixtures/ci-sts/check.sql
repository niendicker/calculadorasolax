insert into public.accessories values ('11111111-1111-1111-1111-111111111111','STS teste',true);
insert into public.inverters values ('22222222-2222-2222-2222-222222222222',100,600,1000,96,95);
insert into public.batteries values ('33333333-3333-3333-3333-333333333333',200,400,480,100,10,98);
insert into public.ci_pcs_specs(inverter_id,charge_power_kw,discharge_power_kw,charge_current_a,discharge_current_a,max_parallel_units,supports_backup) values ('22222222-2222-2222-2222-222222222222',80,100,200,200,2,true);
set role authenticated;
set test.admin='false';
do $$begin
 begin
  insert into public.ci_sts_specs values ('11111111-1111-1111-1111-111111111111',true,189.4,181.2,array[50,60],true,'Ficha teste','1');
  raise exception 'User unexpectedly wrote STS';
 exception when insufficient_privilege then null;end;
end$$;
set test.admin='true';
insert into public.ci_sts_specs values ('11111111-1111-1111-1111-111111111111',true,189.4,181.2,array[50,60],true,'Ficha teste','1');
do $$begin
 begin
 insert into public.ci_sts_compatibility_rules(accessory_id,pcs_id,max_pcs,line_voltage_v,frequency_hz,approval_status,reference_document,revision,communication_profile,firmware) values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',3,380,60,'approved','Teste','1','EMS','1');
 raise exception 'PCS limit unexpectedly accepted';
 exception when others then if SQLERRM not like 'PCS deve%' then raise;end if;end;
end$$;
insert into public.ci_sts_compatibility_rules(accessory_id,pcs_id,max_pcs,line_voltage_v,frequency_hz,approval_status,reference_document,revision,communication_profile,firmware) values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',2,380,60,'approved','Teste','1','EMS','1');
set test.admin='false';
do $$begin if (select count(*) from public.ci_sts_specs)<>1 or (select count(*) from public.ci_sts_compatibility_rules)<>1 then raise exception 'Active catalog not readable';end if;end$$;
set test.admin='true';
update public.ci_sts_compatibility_rules set approval_status='revoked';
set test.admin='false';
do $$begin if (select count(*) from public.ci_sts_compatibility_rules)<>0 then raise exception 'Revoked rule visible';end if;end$$;
set test.admin='true';
update public.ci_sts_compatibility_rules set approval_status='approved';
reset role;
update public.accessories set active=false;
set role authenticated;
set test.admin='false';
do $$begin if (select count(*) from public.ci_sts_specs)<>0 or (select count(*) from public.ci_sts_compatibility_rules)<>0 then raise exception 'Inactive accessory visible';end if;end$$;
reset role;
select 'STS migration, approval, maximum PCS and RLS checks passed' as result;
