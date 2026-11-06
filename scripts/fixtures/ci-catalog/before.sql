alter table public.inverters add column battery_current_max_a numeric not null default 0;
alter table public.batteries add column nominal_voltage_v numeric not null default 0, add column recommended_current_a numeric not null default 0;
alter table public.inverters add column model text unique, add column image_url text, add column documents jsonb default '[]';
alter table public.batteries add column model text unique, add column image_url text, add column documents jsonb default '[]';
alter table public.accessories alter column model set not null;
create unique index accessories_model_key on public.accessories(model);
create table public.user_stock_items(id uuid primary key default gen_random_uuid(),user_id uuid not null,product_type text constraint user_stock_items_product_type_check check(product_type in ('inverter','battery','accessory','ci_bess')),product_model text,unit_value numeric,created_at timestamptz default now(),updated_at timestamptz default now(),unique(user_id,product_type,product_model));
insert into public.inverters(id,power_kw,battery_voltage_min_v,battery_voltage_max_v,battery_charge_efficiency_percent,battery_discharge_efficiency_percent,model,image_url,documents) values ('00000000-0000-0000-0000-000000000001',100,600,1000,96,96,'PCS C&I','image-ci','[{"name":"Ficha","url":"document-ci"}]');
insert into public.inverters(id,model) values('00000000-0000-0000-0000-000000000002','Residencial');
insert into public.batteries(id,max_current_a,voltage_min_v,voltage_max_v,capacity_kwh,min_soc_percent,round_trip_efficiency_percent,model,image_url,documents) values('00000000-0000-0000-0000-000000000003',200,350,450,100,10,96,'Rack C&I','battery-image','[]');
insert into public.accessories values('00000000-0000-0000-0000-000000000004','EMS C&I',true),('00000000-0000-0000-0000-000000000005','STS C&I',true),('00000000-0000-0000-0000-000000000006','Residencial',true);
insert into public.ci_pcs_specs values('00000000-0000-0000-0000-000000000001',true,100,100,200,200,4,true,now());
insert into public.ci_battery_specs values('00000000-0000-0000-0000-000000000003',true,'rack',50,50,100,100,95,now());
insert into public.ci_compatibility_rules(id,name,pcs_id,battery_id,min_series,max_series,min_parallel_strings,max_parallel_strings,min_pcs,max_pcs,controller_accessory_id) values('00000000-0000-0000-0000-000000000007','Documento','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',2,2,1,2,1,4,'00000000-0000-0000-0000-000000000004');
insert into public.ci_sts_specs values('00000000-0000-0000-0000-000000000005',true,190,182,'{50,60}',true,'Nexus','1');
insert into public.user_stock_items(user_id,product_type,product_model,unit_value) values
 ('00000000-0000-0000-0000-000000000010','inverter','PCS C&I',10000),
 ('00000000-0000-0000-0000-000000000010','battery','Rack C&I',20000),
 ('00000000-0000-0000-0000-000000000010','accessory','STS C&I',0);
