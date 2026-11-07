insert into public.ci_bess_products(id,active) values(gen_random_uuid(),true);
do $$begin
 if (select column_default from information_schema.columns where table_schema='public' and table_name='ci_bess_products' and column_name='max_parallel_units') <> '1' then
  raise exception 'Integrated products must default to one documented unit';
 end if;
 if exists(select 1 from public.ci_bess_products where max_parallel_units<>1) then raise exception 'Legacy product parallel default';end if;
 begin
  update public.ci_bess_products set max_parallel_units=257;
  if found then raise exception 'Invalid integrated parallel limit accepted';end if;
 exception when check_violation then null;
 end;
end $$;
select 'Integrated parallel limits verified' as result;
