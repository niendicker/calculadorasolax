-- A single transaction saves each C&I product and its continuous ratings.
-- Keep existing table identities, foreign keys, RLS and invalidation triggers.
create function public.save_ci_equipment(
  p_kind text, p_product jsonb, p_limits jsonb, p_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  equipment_id uuid := coalesce(p_id, gen_random_uuid());
  previous_model text;
  inv public.ci_inverters;
  bat public.ci_batteries;
  pcs public.ci_pcs_specs;
  bs public.ci_battery_specs;
  result_product jsonb;
  result_limits jsonb;
begin
  if not coalesce(public.is_admin(), false) then
    raise insufficient_privilege using message = 'Apenas administradores podem salvar equipamentos C&I.';
  end if;
  if p_kind not in ('pcs', 'batteries') or p_kind is null then
    raise exception 'Tipo de equipamento C&I inválido.';
  end if;
  if coalesce(btrim(p_product->>'model'), '') = '' then raise exception 'Informe o modelo.'; end if;
  if p_kind = 'pcs' then
    select model into previous_model from public.ci_inverters where id = equipment_id for update;
  else
    select model into previous_model from public.ci_batteries where id = equipment_id for update;
  end if;
  if previous_model is not null and previous_model <> btrim(p_product->>'model') then
    raise exception 'Para preservar preços e histórico, mantenha o modelo cadastrado. Use o apelido para alterar o nome exibido.';
  end if;

  if p_kind = 'pcs' then
    inv := jsonb_populate_record(null::public.ci_inverters, p_product);
    insert into public.ci_inverters (
      id, model, nickname, power_kw, standard_power_kva, peak_power_kva, phases, topology, grid_types, max_battery_qty, battery_ports, battery_voltage_min_v, battery_voltage_max_v, battery_current_max_a, max_power_per_phase_w, battery_charge_efficiency_percent, battery_discharge_efficiency_percent, standby_consumption_w, max_battery_charge_power_w, max_battery_discharge_power_w, flags, pv_oversizing_percent, warranty_years, image_url, documents)
    values (
      equipment_id, inv.model, inv.nickname, inv.power_kw, inv.standard_power_kva, inv.peak_power_kva, inv.phases, inv.topology, inv.grid_types, inv.max_battery_qty, inv.battery_ports, inv.battery_voltage_min_v, inv.battery_voltage_max_v, inv.battery_current_max_a, inv.max_power_per_phase_w, inv.battery_charge_efficiency_percent, inv.battery_discharge_efficiency_percent, inv.standby_consumption_w, inv.max_battery_charge_power_w, inv.max_battery_discharge_power_w, inv.flags, inv.pv_oversizing_percent, inv.warranty_years, inv.image_url, inv.documents)
    on conflict (id) do update set
      model = excluded.model,
      nickname = excluded.nickname,
      power_kw = excluded.power_kw,
      standard_power_kva = excluded.standard_power_kva,
      peak_power_kva = excluded.peak_power_kva,
      phases = excluded.phases,
      topology = excluded.topology,
      grid_types = excluded.grid_types,
      max_battery_qty = excluded.max_battery_qty,
      battery_ports = excluded.battery_ports,
      battery_voltage_min_v = excluded.battery_voltage_min_v,
      battery_voltage_max_v = excluded.battery_voltage_max_v,
      battery_current_max_a = excluded.battery_current_max_a,
      max_power_per_phase_w = excluded.max_power_per_phase_w,
      battery_charge_efficiency_percent = excluded.battery_charge_efficiency_percent,
      battery_discharge_efficiency_percent = excluded.battery_discharge_efficiency_percent,
      standby_consumption_w = excluded.standby_consumption_w,
      max_battery_charge_power_w = excluded.max_battery_charge_power_w,
      max_battery_discharge_power_w = excluded.max_battery_discharge_power_w,
      flags = excluded.flags,
      pv_oversizing_percent = excluded.pv_oversizing_percent,
      warranty_years = excluded.warranty_years,
      image_url = excluded.image_url,
      documents = excluded.documents;

    if p_limits is not null and p_limits <> 'null'::jsonb then
      pcs := jsonb_populate_record(null::public.ci_pcs_specs, p_limits);
      pcs.charge_current_a := pcs.port_charge_current_a;
      pcs.discharge_current_a := pcs.port_discharge_current_a;
      insert into public.ci_pcs_specs (
      inverter_id, active, charge_power_kw, discharge_power_kw, charge_current_a, discharge_current_a, max_parallel_units, supports_backup, port_charge_current_a, port_discharge_current_a, port_charge_power_kw, port_discharge_power_kw, max_strings_per_port, updated_at)
    values (
      equipment_id, pcs.active, pcs.charge_power_kw, pcs.discharge_power_kw, pcs.charge_current_a, pcs.discharge_current_a, pcs.max_parallel_units, pcs.supports_backup, pcs.port_charge_current_a, pcs.port_discharge_current_a, pcs.port_charge_power_kw, pcs.port_discharge_power_kw, pcs.max_strings_per_port, now())
    on conflict (inverter_id) do update set
      active = excluded.active,
      charge_power_kw = excluded.charge_power_kw,
      discharge_power_kw = excluded.discharge_power_kw,
      charge_current_a = excluded.charge_current_a,
      discharge_current_a = excluded.discharge_current_a,
      max_parallel_units = excluded.max_parallel_units,
      supports_backup = excluded.supports_backup,
      port_charge_current_a = excluded.port_charge_current_a,
      port_discharge_current_a = excluded.port_discharge_current_a,
      port_charge_power_kw = excluded.port_charge_power_kw,
      port_discharge_power_kw = excluded.port_discharge_power_kw,
      max_strings_per_port = excluded.max_strings_per_port,
      updated_at = excluded.updated_at;

    end if;
    select * into pcs from public.ci_pcs_specs where inverter_id = equipment_id;
    if inv.power_kw > 0 and pcs.discharge_power_kw > inv.power_kw then
      raise exception 'A potência contínua C&I excede a potência nominal da ficha do inversor.';
    end if;
    if inv.battery_current_max_a > 0 and greatest(pcs.port_charge_current_a, pcs.port_discharge_current_a) > inv.battery_current_max_a then
      raise exception 'A corrente por porta excede o limite por porta da ficha do PCS.';
    end if;
    select to_jsonb(p) into result_product from public.ci_inverters p where id = equipment_id;
    select to_jsonb(s) into result_limits from public.ci_pcs_specs s where inverter_id = equipment_id;
  else
    bat := jsonb_populate_record(null::public.ci_batteries, p_product);
    insert into public.ci_batteries (
      id, model, nickname, capacity_kwh, topology, standard_power_kw, peak_power_kw, min_soc_percent, round_trip_efficiency_percent, initial_soh_percent, annual_soh_loss_percent, warranty_end_soh_percent, nominal_voltage_v, voltage_min_v, voltage_max_v, recommended_current_a, max_current_a, flags, max_association_qty, expansion_model, warranty_years, warranty_cycles, image_url, documents)
    values (
      equipment_id, bat.model, bat.nickname, bat.capacity_kwh, bat.topology, bat.standard_power_kw, bat.peak_power_kw, bat.min_soc_percent, bat.round_trip_efficiency_percent, bat.initial_soh_percent, bat.annual_soh_loss_percent, bat.warranty_end_soh_percent, bat.nominal_voltage_v, bat.voltage_min_v, bat.voltage_max_v, bat.recommended_current_a, bat.max_current_a, bat.flags, bat.max_association_qty, bat.expansion_model, bat.warranty_years, bat.warranty_cycles, bat.image_url, bat.documents)
    on conflict (id) do update set
      model = excluded.model,
      nickname = excluded.nickname,
      capacity_kwh = excluded.capacity_kwh,
      topology = excluded.topology,
      standard_power_kw = excluded.standard_power_kw,
      peak_power_kw = excluded.peak_power_kw,
      min_soc_percent = excluded.min_soc_percent,
      round_trip_efficiency_percent = excluded.round_trip_efficiency_percent,
      initial_soh_percent = excluded.initial_soh_percent,
      annual_soh_loss_percent = excluded.annual_soh_loss_percent,
      warranty_end_soh_percent = excluded.warranty_end_soh_percent,
      nominal_voltage_v = excluded.nominal_voltage_v,
      voltage_min_v = excluded.voltage_min_v,
      voltage_max_v = excluded.voltage_max_v,
      recommended_current_a = excluded.recommended_current_a,
      max_current_a = excluded.max_current_a,
      flags = excluded.flags,
      max_association_qty = excluded.max_association_qty,
      expansion_model = excluded.expansion_model,
      warranty_years = excluded.warranty_years,
      warranty_cycles = excluded.warranty_cycles,
      image_url = excluded.image_url,
      documents = excluded.documents;

    if p_limits is not null and p_limits <> 'null'::jsonb then
      bs := jsonb_populate_record(null::public.ci_battery_specs, p_limits);
      insert into public.ci_battery_specs (
      battery_id, active, unit_kind, charge_power_kw, discharge_power_kw, charge_current_a, discharge_current_a, soc_max_percent, updated_at)
    values (
      equipment_id, bs.active, bs.unit_kind, bs.charge_power_kw, bs.discharge_power_kw, bs.charge_current_a, bs.discharge_current_a, bs.soc_max_percent, now())
    on conflict (battery_id) do update set
      active = excluded.active,
      unit_kind = excluded.unit_kind,
      charge_power_kw = excluded.charge_power_kw,
      discharge_power_kw = excluded.discharge_power_kw,
      charge_current_a = excluded.charge_current_a,
      discharge_current_a = excluded.discharge_current_a,
      soc_max_percent = excluded.soc_max_percent,
      updated_at = excluded.updated_at;

    end if;
    select * into bs from public.ci_battery_specs where battery_id = equipment_id;
    if bs.soc_max_percent <= bat.min_soc_percent then
      raise exception 'SOC máximo deve ser maior que o SOC mínimo da ficha da bateria.';
    end if;
    if bat.max_current_a > 0 and greatest(bs.charge_current_a, bs.discharge_current_a) > bat.max_current_a then
      raise exception 'A corrente contínua C&I excede a corrente máxima da ficha da bateria.';
    end if;
    select to_jsonb(p) into result_product from public.ci_batteries p where id = equipment_id;
    select to_jsonb(s) into result_limits from public.ci_battery_specs s where battery_id = equipment_id;
  end if;
  return jsonb_build_object('product', result_product, 'limits', result_limits);
end $$;
revoke all on function public.save_ci_equipment(text, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_ci_equipment(text, jsonb, jsonb, uuid) to authenticated;

-- Remove unreferenced equipment and ratings together. Existing foreign keys
-- reject removal if compatibility, STS or accessory rules still use either row.
create function public.delete_ci_equipment(p_kind text, p_id uuid) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise insufficient_privilege using message = 'Apenas administradores podem remover equipamentos C&I.';
  end if;
  if p_kind = 'pcs' then
    perform 1 from public.ci_inverters where id = p_id for update;
    delete from public.ci_pcs_specs where inverter_id = p_id;
    delete from public.ci_inverters where id = p_id;
  elsif p_kind = 'batteries' then
    perform 1 from public.ci_batteries where id = p_id for update;
    delete from public.ci_battery_specs where battery_id = p_id;
    delete from public.ci_batteries where id = p_id;
  else raise exception 'Tipo de equipamento C&I inválido.';
  end if;
end $$;
revoke all on function public.delete_ci_equipment(text, uuid) from public, anon;
grant execute on function public.delete_ci_equipment(text, uuid) to authenticated;
