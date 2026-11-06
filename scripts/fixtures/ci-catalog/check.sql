do $$begin
 if (select count(*) from public.ci_inverters)<>1 or (select count(*) from public.ci_batteries)<>1 or (select count(*) from public.ci_accessories)<>2 then raise exception 'Catalog copy scope mismatch';end if;
 if not exists(select 1 from public.ci_inverters where image_url='image-ci' and documents->0->>'url'='document-ci') then raise exception 'Lost media';end if;
 if not exists(select 1 from public.user_stock_items where product_type='ci_accessory' and unit_value=0) or (select count(*) from public.user_stock_items)<>6 then raise exception 'Lost prices / historical entries';end if;
end $$;
-- Independence: edits to C&I do not mutate the source catalog.
update public.ci_inverters set model='PCS C&I separado';
do $$begin if not exists(select 1 from public.inverters where model='PCS C&I') then raise exception 'Residential mutation';end if; end $$;
-- A documented approval now resolves the independent catalog, including its controller.
update public.ci_compatibility_rules set approval_status='approved',reference_document='Doc',revision='1',communication_profile='CAN',pcs_firmware='1',battery_firmware='1';
insert into public.ci_sts_compatibility_rules(accessory_id,pcs_id,max_pcs,line_voltage_v,frequency_hz,approval_status,reference_document,revision,communication_profile,firmware) values('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001',4,380,60,'approved','Doc','1','CAN','1');
insert into public.ci_accessory_rules(name,accessory_id,inclusion,metric,quantity,divisor,reference_document,requires_ids) values('EMS incluso na STS','00000000-0000-0000-0000-000000000004','bundled','pcs',1,1,'Documento 1','{00000000-0000-0000-0000-000000000005}');
set role authenticated;
select set_config('test.admin','false',false);
do $$begin
 if (select count(*) from public.ci_accessory_rules)<>1 or (select count(*) from public.ci_compatibility_rules)<>1 or (select count(*) from public.ci_sts_specs)<>1 then raise exception 'User RLS read';end if;
 begin insert into public.ci_accessories values(gen_random_uuid(),'Forbidden',true);raise exception 'Write should fail';exception when insufficient_privilege then null;end;
 begin update public.ci_accessory_rules set name='Forbidden';if found then raise exception 'User modified rules';end if;end;
end $$;
select set_config('test.admin','true',false);
insert into public.ci_accessories values('00000000-0000-0000-0000-000000000020','New CI',true);
do $$begin
 begin insert into public.ci_accessory_rules(name,accessory_id,inclusion,metric,reference_document,requires_ids) values('Invalid residential dependency','00000000-0000-0000-0000-000000000020','required','system','Doc','{00000000-0000-0000-0000-000000000006}');raise exception 'Dependency should fail';exception when raise_exception then if sqlerrm='Dependency should fail' then raise;end if;end;
end $$;
reset role;
-- No C&I foreign key can accidentally point back to residential products.
do $$begin
 if exists(select 1 from pg_constraint c where c.contype='f' and c.conrelid in ('public.ci_pcs_specs'::regclass,'public.ci_battery_specs'::regclass,'public.ci_compatibility_rules'::regclass,'public.ci_sts_specs'::regclass) and c.confrelid in ('public.inverters'::regclass,'public.batteries'::regclass,'public.accessories'::regclass)) then raise exception 'Cross-catalog FK';end if;
end $$;
select 'C&I catalog migration and RLS verified' as result;
