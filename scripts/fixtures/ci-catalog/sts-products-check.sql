-- 0107: STS has its own product table; IDs, prices, rules and RLS are preserved.
do $$begin
 if (select count(*) from public.ci_sts_products)<>1 or not exists(select 1 from public.ci_sts_products where id='00000000-0000-0000-0000-000000000005' and model='STS C&I') then raise exception 'STS product not moved with its ID';end if;
 if exists(select 1 from public.ci_accessories where id='00000000-0000-0000-0000-000000000005') then raise exception 'STS still listed as accessory';end if;
 if not exists(select 1 from public.user_stock_items where product_type='ci_sts' and product_model='STS C&I' and unit_value=0) then raise exception 'STS price (explicit zero) not moved to ci_sts';end if;
 if exists(select 1 from public.user_stock_items where product_type='ci_accessory' and product_model='STS C&I') then raise exception 'Old accessory price kept for STS';end if;
 if not exists(select 1 from public.ci_accessory_rules where requires_ids @> array['00000000-0000-0000-0000-000000000005'::uuid]) then raise exception 'Accessory rule dependency on STS lost';end if;
 if not exists(select 1 from pg_constraint where conname='ci_sts_specs_accessory_id_fkey' and confrelid='public.ci_sts_products'::regclass) then raise exception 'STS spec FK not retargeted';end if;
end $$;
select set_config('test.admin','true',false);
set role authenticated;
do $$declare saved jsonb;begin
 -- A STS referenced by compatibilities or rules cannot be removed.
 begin perform public.delete_ci_sts('00000000-0000-0000-0000-000000000005');raise exception 'Referenced STS removed';exception when foreign_key_violation then null;end;
 -- Saves product and ratings atomically; rejects renaming (prices are keyed by model).
 saved:=public.save_ci_sts('{"model":"STS nova","active":true,"warranty_years":3,"documents":[]}','{"active":true,"rated_current_380v_a":100,"rated_current_400v_a":95,"frequency_hz":[50,60],"ems_included":false,"reference_document":"Doc","revision":"1"}','00000000-0000-0000-0000-000000000030');
 if saved->'product'->>'model'<>'STS nova' or (saved->'limits'->>'rated_current_380v_a')::numeric<>100 then raise exception 'save_ci_sts result';end if;
 begin perform public.save_ci_sts('{"model":"Outro nome"}',null,'00000000-0000-0000-0000-000000000030');raise exception 'Rename accepted';exception when raise_exception then if sqlerrm like 'Rename accepted' then raise;end if;end;
 -- A rule may reference an STS, but not an unknown product.
 insert into public.ci_accessory_rules(name,accessory_id,inclusion,metric,reference_document) values('Exige STS','00000000-0000-0000-0000-000000000030','required','system','Doc');
 begin insert into public.ci_accessory_rules(name,accessory_id,inclusion,metric,reference_document) values('Desconhecido',gen_random_uuid(),'required','system','Doc');raise exception 'Unknown product accepted';exception when raise_exception then if sqlerrm like 'Unknown product accepted' then raise;end if;end;
 delete from public.ci_accessory_rules where name='Exige STS';
 perform public.delete_ci_sts('00000000-0000-0000-0000-000000000030');
end $$;
select set_config('test.admin','false',false);
do $$begin
 begin perform public.save_ci_sts('{"model":"Proibida"}',null);raise exception 'Non-admin saved STS';exception when insufficient_privilege then null;end;
 if (select count(*) from public.ci_sts_products)<>1 then raise exception 'Authenticated read of STS products';end if;
end $$;
reset role;
select 'C&I STS product table verified' as result;
