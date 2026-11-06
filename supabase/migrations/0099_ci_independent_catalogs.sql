-- Independent C&I catalogs. Preserve immutable IDs, approvals and historical sources.
create table public.ci_inverters (like public.inverters including defaults including constraints including indexes);
create table public.ci_batteries (like public.batteries including defaults including constraints including indexes);
create table public.ci_accessories (like public.accessories including defaults including constraints including indexes);
-- Draft product forms allow unknown electrical ratings. Approval/calculation still require complete values.
alter table public.ci_inverters alter column battery_voltage_min_v drop not null, alter column battery_voltage_max_v drop not null, alter column battery_current_max_a drop not null;
alter table public.ci_batteries alter column nominal_voltage_v drop not null, alter column voltage_min_v drop not null, alter column voltage_max_v drop not null, alter column recommended_current_a drop not null, alter column max_current_a drop not null;
insert into public.ci_inverters select i.* from public.inverters i join public.ci_pcs_specs s on s.inverter_id=i.id;
insert into public.ci_batteries select b.* from public.batteries b join public.ci_battery_specs s on s.battery_id=b.id;
insert into public.ci_accessories select a.* from public.accessories a where a.id in
 (select controller_accessory_id from public.ci_compatibility_rules union select accessory_id from public.ci_sts_specs);
alter table public.ci_pcs_specs drop constraint ci_pcs_specs_inverter_id_fkey;
alter table public.ci_pcs_specs add constraint ci_pcs_specs_inverter_id_fkey foreign key(inverter_id) references public.ci_inverters(id) on delete restrict;
alter table public.ci_battery_specs drop constraint ci_battery_specs_battery_id_fkey;
alter table public.ci_battery_specs add constraint ci_battery_specs_battery_id_fkey foreign key(battery_id) references public.ci_batteries(id) on delete restrict;
alter table public.ci_compatibility_rules drop constraint ci_compatibility_rules_controller_accessory_id_fkey;
alter table public.ci_compatibility_rules add constraint ci_compatibility_rules_controller_accessory_id_fkey foreign key(controller_accessory_id) references public.ci_accessories(id) on delete restrict;
alter table public.ci_sts_specs drop constraint ci_sts_specs_accessory_id_fkey;
alter table public.ci_sts_specs add constraint ci_sts_specs_accessory_id_fkey foreign key(accessory_id) references public.ci_accessories(id) on delete restrict;
create or replace function public.validate_ci_compatibility_approval() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare p record; b record;
begin
  if new.approval_status <> 'approved' or not new.active then return new; end if;
  select s.*, i.power_kw, i.battery_voltage_min_v, i.battery_voltage_max_v,
    i.battery_charge_efficiency_percent, i.battery_discharge_efficiency_percent
    into p from public.ci_pcs_specs s join public.ci_inverters i on i.id = s.inverter_id where s.inverter_id = new.pcs_id;
  select s.*, c.max_current_a, c.voltage_min_v, c.voltage_max_v, c.capacity_kwh, c.min_soc_percent, c.round_trip_efficiency_percent
    into b from public.ci_battery_specs s join public.ci_batteries c on c.id = s.battery_id where s.battery_id = new.battery_id;
  if not coalesce(p.active, false) or not coalesce(b.active, false) then raise exception 'PCS e bateria precisam estar ativos.'; end if;
  if p.battery_voltage_min_v is null or p.battery_voltage_max_v is null or b.voltage_min_v is null or b.voltage_max_v is null
     or p.battery_voltage_min_v <= 0 or p.battery_voltage_max_v < p.battery_voltage_min_v or b.voltage_min_v <= 0 or b.voltage_max_v < b.voltage_min_v then
    raise exception 'Complete as faixas de tensão DC nas fichas do inversor e da bateria.';
  end if;
  if b.voltage_min_v * new.min_series < p.battery_voltage_min_v or b.voltage_max_v * new.max_series > p.battery_voltage_max_v then
    raise exception 'A faixa de tensão das associações não cabe na janela DC do PCS.';
  end if;
  if b.min_soc_percent >= b.soc_max_percent or b.capacity_kwh <= 0 or b.round_trip_efficiency_percent is null
     or b.round_trip_efficiency_percent <= 0 or b.round_trip_efficiency_percent > 100
     or p.battery_charge_efficiency_percent is null or p.battery_charge_efficiency_percent <= 0 or p.battery_charge_efficiency_percent > 100
     or p.battery_discharge_efficiency_percent is null or p.battery_discharge_efficiency_percent <= 0 or p.battery_discharge_efficiency_percent > 100 then
    raise exception 'Verifique capacidade, SOC e eficiências nas fichas dos equipamentos.';
  end if;
  if new.max_pcs > p.max_parallel_units then raise exception 'Quantidade de PCS excede o paralelismo cadastrado.'; end if;
  if p.power_kw > 0 and p.discharge_power_kw > p.power_kw then raise exception 'A potência C&I excede a potência nominal da ficha do inversor.'; end if;
  if b.max_current_a > 0 and greatest(b.charge_current_a, b.discharge_current_a) > b.max_current_a then raise exception 'A corrente C&I excede a corrente máxima da ficha da bateria.'; end if;
  if new.controller_accessory_id is not null and not exists (select 1 from public.ci_accessories a where a.id = new.controller_accessory_id and a.active) then raise exception 'O controlador obrigatório precisa estar ativo.'; end if;
  if new.supports_backup and not p.supports_backup then raise exception 'O PCS não está cadastrado para backup.'; end if;
  return new;
end $$;
create or replace function public.validate_ci_sts_approval() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.approval_status <> 'approved' or not new.active then return new; end if;
  if not exists (select 1 from public.ci_sts_specs s join public.ci_accessories a on a.id=s.accessory_id where s.accessory_id=new.accessory_id and s.active and a.active and new.frequency_hz=any(s.frequency_hz)) then raise exception 'STS e acessório precisam estar ativos e suportar a frequência aprovada.'; end if;
  if new.pcs_id is not null and not exists (select 1 from public.ci_pcs_specs p where p.inverter_id=new.pcs_id and p.active and p.supports_backup and new.max_pcs<=p.max_parallel_units) then raise exception 'PCS deve suportar backup e a quantidade deve respeitar seu paralelismo.'; end if;
  if new.bess_product_id is not null and not exists (select 1 from public.ci_bess_products b where b.id=new.bess_product_id and b.active) then raise exception 'BESS integrado precisa estar ativo.'; end if;
  return new;
end $$;
drop policy "authenticated read approved ci compatibility" on public.ci_compatibility_rules;
create policy "authenticated read approved ci compatibility" on public.ci_compatibility_rules for select to authenticated using (
  active and approval_status = 'approved'
  and (controller_accessory_id is null or exists (select 1 from public.ci_accessories a where a.id = controller_accessory_id and a.active))
  and exists (select 1 from public.ci_pcs_specs p where p.inverter_id = pcs_id and p.active)
  and exists (select 1 from public.ci_battery_specs b where b.battery_id = ci_compatibility_rules.battery_id and b.active)
);
drop policy "authenticated read active ci sts" on public.ci_sts_specs;
create policy "authenticated read active ci sts" on public.ci_sts_specs for select to authenticated using (active and exists(select 1 from public.ci_accessories a where a.id=accessory_id and a.active));
drop policy "authenticated read approved ci sts rules" on public.ci_sts_compatibility_rules;
create policy "authenticated read approved ci sts rules" on public.ci_sts_compatibility_rules for select to authenticated using (
 active and approval_status='approved' and exists(select 1 from public.ci_sts_specs s join public.ci_accessories a on a.id=s.accessory_id where s.accessory_id=ci_sts_compatibility_rules.accessory_id and s.active and a.active)
 and ((pcs_id is not null and exists(select 1 from public.ci_pcs_specs p where p.inverter_id=pcs_id and p.active and p.supports_backup and max_pcs<=p.max_parallel_units))
 or (bess_product_id is not null and exists(select 1 from public.ci_bess_products b where b.id=bess_product_id and b.active)))
);
alter table public.ci_inverters enable row level security;
create policy "authenticated read ci_inverters" on public.ci_inverters for select to authenticated using (true);
create policy "admin manage ci_inverters" on public.ci_inverters for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.ci_inverters to authenticated;
grant select on public.ci_inverters to service_role;
alter table public.ci_batteries enable row level security;
create policy "authenticated read ci_batteries" on public.ci_batteries for select to authenticated using (true);
create policy "admin manage ci_batteries" on public.ci_batteries for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.ci_batteries to authenticated;
grant select on public.ci_batteries to service_role;
alter table public.ci_accessories enable row level security;
create policy "authenticated read ci_accessories" on public.ci_accessories for select to authenticated using (true);
create policy "admin manage ci_accessories" on public.ci_accessories for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.ci_accessories to authenticated;
grant select on public.ci_accessories to service_role;
alter table public.user_stock_items drop constraint user_stock_items_product_type_check;
alter table public.user_stock_items add constraint user_stock_items_product_type_check check(product_type in ('inverter','battery','accessory','ci_bess','ci_pcs','ci_battery','ci_accessory'));
-- Preserve migrated personal prices even for accounts already at their product limit.
do $$begin
 if exists(select 1 from pg_trigger where tgrelid='public.user_stock_items'::regclass and tgname='user_stock_items_limit_check') then
  alter table public.user_stock_items disable trigger user_stock_items_limit_check;
 end if;
end $$;
insert into public.user_stock_items(user_id,product_type,product_model,unit_value)
select s.user_id, m.ci_type,s.product_model,s.unit_value from public.user_stock_items s join (
 select 'inverter' as old_type,'ci_pcs' as ci_type,model from public.ci_inverters
 union all select 'battery','ci_battery',model from public.ci_batteries
 union all select 'accessory','ci_accessory',model from public.ci_accessories
) m on m.old_type=s.product_type and m.model=s.product_model on conflict(user_id,product_type,product_model) do nothing;
do $$begin
 if exists(select 1 from pg_trigger where tgrelid='public.user_stock_items'::regclass and tgname='user_stock_items_limit_check') then
  alter table public.user_stock_items enable trigger user_stock_items_limit_check;
 end if;
end $$;
