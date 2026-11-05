-- Reuse physical catalog IDs; C&I ratings extend, rather than duplicate, model records.
create table public.ci_pcs_specs (
  inverter_id uuid primary key references public.inverters(id) on delete restrict,
  active boolean not null default true,
  charge_power_kw numeric not null check (charge_power_kw > 0), -- AC input
  discharge_power_kw numeric not null check (discharge_power_kw > 0), -- AC output
  charge_current_a numeric not null check (charge_current_a > 0), -- total DC bus
  discharge_current_a numeric not null check (discharge_current_a > 0),
  max_parallel_units integer not null check (max_parallel_units > 0),
  supports_backup boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.ci_battery_specs (
  battery_id uuid primary key references public.batteries(id) on delete restrict,
  active boolean not null default true,
  unit_kind text not null check (unit_kind in ('module', 'rack', 'cabinet')),
  charge_power_kw numeric not null check (charge_power_kw > 0), -- DC per commercial unit
  discharge_power_kw numeric not null check (discharge_power_kw > 0),
  charge_current_a numeric not null check (charge_current_a > 0),
  discharge_current_a numeric not null check (discharge_current_a > 0),
  soc_max_percent numeric not null check (soc_max_percent > 0 and soc_max_percent <= 100),
  updated_at timestamptz not null default now()
);
create table public.ci_compatibility_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  pcs_id uuid not null references public.ci_pcs_specs(inverter_id) on delete restrict,
  battery_id uuid not null references public.ci_battery_specs(battery_id) on delete restrict,
  active boolean not null default true,
  approval_status text not null default 'draft' check (approval_status in ('draft', 'approved', 'revoked')),
  min_series integer not null check (min_series > 0),
  max_series integer not null check (max_series >= min_series),
  min_parallel_strings integer not null check (min_parallel_strings > 0),
  max_parallel_strings integer not null check (max_parallel_strings >= min_parallel_strings),
  min_pcs integer not null check (min_pcs > 0),
  max_pcs integer not null check (max_pcs >= min_pcs),
  supports_backup boolean not null default false,
  communication_profile text not null default '',
  pcs_firmware text not null default '',
  battery_firmware text not null default '',
  reference_document text not null default '',
  revision text not null default '',
  controller_accessory_id uuid references public.accessories(id) on delete restrict,
  controller_quantity_per_pcs integer not null default 1 check (controller_quantity_per_pcs > 0),
  notes text not null default '',
  updated_at timestamptz not null default now(),
  check (approval_status <> 'approved' or (
    length(btrim(reference_document)) > 0 and length(btrim(revision)) > 0
    and length(btrim(communication_profile)) > 0 and length(btrim(pcs_firmware)) > 0 and length(btrim(battery_firmware)) > 0
  ))
);

-- An approval must reference complete electrical ratings. Later catalog edits are
-- revalidated by the calculator as well; approval is never inferred from voltage alone.
create function public.validate_ci_compatibility_approval() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare p record; b record;
begin
  if new.approval_status <> 'approved' or not new.active then return new; end if;
  select s.*, i.power_kw, i.battery_voltage_min_v, i.battery_voltage_max_v,
    i.battery_charge_efficiency_percent, i.battery_discharge_efficiency_percent
    into p from public.ci_pcs_specs s join public.inverters i on i.id = s.inverter_id where s.inverter_id = new.pcs_id;
  select s.*, c.max_current_a, c.voltage_min_v, c.voltage_max_v, c.capacity_kwh, c.min_soc_percent, c.round_trip_efficiency_percent
    into b from public.ci_battery_specs s join public.batteries c on c.id = s.battery_id where s.battery_id = new.battery_id;
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
  if new.controller_accessory_id is not null and not exists (select 1 from public.accessories a where a.id = new.controller_accessory_id and a.active) then raise exception 'O controlador obrigatório precisa estar ativo.'; end if;
  if new.supports_backup and not p.supports_backup then raise exception 'O PCS não está cadastrado para backup.'; end if;
  return new;
end $$;
create trigger ci_compatibility_approval before insert or update on public.ci_compatibility_rules
for each row execute function public.validate_ci_compatibility_approval();

alter table public.ci_pcs_specs enable row level security;
alter table public.ci_battery_specs enable row level security;
alter table public.ci_compatibility_rules enable row level security;
create policy "authenticated read active ci pcs" on public.ci_pcs_specs for select to authenticated using (active);
create policy "authenticated read active ci batteries" on public.ci_battery_specs for select to authenticated using (active);
create policy "authenticated read approved ci compatibility" on public.ci_compatibility_rules for select to authenticated using (
  active and approval_status = 'approved'
  and (controller_accessory_id is null or exists (select 1 from public.accessories a where a.id = controller_accessory_id and a.active))
  and exists (select 1 from public.ci_pcs_specs p where p.inverter_id = pcs_id and p.active)
  and exists (select 1 from public.ci_battery_specs b where b.battery_id = ci_compatibility_rules.battery_id and b.active)
);
create policy "admin manage ci pcs" on public.ci_pcs_specs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin manage ci batteries" on public.ci_battery_specs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin manage ci compatibility" on public.ci_compatibility_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.ci_pcs_specs, public.ci_battery_specs, public.ci_compatibility_rules to authenticated;
grant select on public.ci_pcs_specs, public.ci_battery_specs, public.ci_compatibility_rules to service_role;

-- Match the existing admin audit trail for these additional catalog records.
alter table public.admin_activity_logs drop constraint if exists admin_activity_logs_entity_type_check;
alter table public.admin_activity_logs add constraint admin_activity_logs_entity_type_check
  check (entity_type in ('inverter', 'battery', 'accessory', 'ci_bess_product', 'ci_pcs', 'ci_battery', 'ci_compatibility', 'solution', 'rule', 'load_catalog_item', 'load_preset'));
