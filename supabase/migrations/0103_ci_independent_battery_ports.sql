-- C&I port counts are independent of the residential one/two-port restriction.
do $$declare item record;begin
 for item in select conname from pg_constraint where conrelid='public.ci_inverters'::regclass and contype='c' and conkey=array[(select attnum from pg_attribute where attrelid='public.ci_inverters'::regclass and attname='battery_ports')]::smallint[] loop
 execute format('alter table public.ci_inverters drop constraint %I',item.conname);end loop;
end $$;
alter table public.ci_inverters add constraint ci_inverters_port_count check(battery_ports between 1 and 32);

-- Independent battery inputs. Existing AC powers remain TOTAL PCS ratings.
alter table public.ci_pcs_specs
 add column port_charge_current_a numeric check(port_charge_current_a>0),
 add column port_discharge_current_a numeric check(port_discharge_current_a>0),
 add column port_charge_power_kw numeric check(port_charge_power_kw>0),
 add column port_discharge_power_kw numeric check(port_discharge_power_kw>0),
 add column max_strings_per_port integer not null default 1 check(max_strings_per_port between 1 and 32);
comment on column public.ci_pcs_specs.port_charge_current_a is 'Continuous DC charge current of EACH independent battery port';
comment on column public.ci_pcs_specs.charge_current_a is 'Legacy aggregated DC rating; not used by the independent-port engine';
comment on column public.ci_pcs_specs.discharge_current_a is 'Legacy aggregated DC rating; not used by the independent-port engine';
comment on column public.ci_pcs_specs.charge_power_kw is 'Total AC charge power of the PCS, shared by all ports';
comment on column public.ci_pcs_specs.discharge_power_kw is 'Total AC discharge power of the PCS, shared by all ports';
-- Only migrate currents backed by the existing documented per-port base limit.
update public.ci_pcs_specs s set port_charge_current_a=least(s.charge_current_a,i.battery_current_max_a),port_discharge_current_a=least(s.discharge_current_a,i.battery_current_max_a)
from public.ci_inverters i where i.id=s.inverter_id and i.battery_current_max_a>0 and i.battery_ports>0;

alter table public.ci_compatibility_rules
 add column min_ports_per_pcs integer not null default 1 check(min_ports_per_pcs>0),
 add column max_ports_per_pcs integer not null default 1,
 add column legacy_connection_config jsonb,
 add constraint ci_port_range check(max_ports_per_pcs>=min_ports_per_pcs);
-- Preserve the old interpretation. A manufacturer approval for parallel strings
-- is not silently promoted to an approval for independent ports.
update public.ci_compatibility_rules r set
 legacy_connection_config=jsonb_build_object('min_parallel_strings',r.min_parallel_strings,'max_parallel_strings',r.max_parallel_strings,'approval_status',r.approval_status),
 min_ports_per_pcs=case when r.max_parallel_strings<=i.battery_ports then r.min_parallel_strings else 1 end,
 max_ports_per_pcs=case when r.max_parallel_strings<=i.battery_ports then r.max_parallel_strings else 1 end,
 min_parallel_strings=1,max_parallel_strings=1,
 approval_status=case when r.approval_status='approved' then 'draft' else r.approval_status end
from public.ci_inverters i where i.id=r.pcs_id;
comment on column public.ci_compatibility_rules.max_parallel_strings is 'Approved parallel strings per independent battery PORT';

create or replace function public.validate_ci_compatibility_approval() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare p record;b record;
begin
 if new.approval_status<>'approved' or not new.active then return new;end if;
 select s.*,i.power_kw,i.battery_ports,i.battery_current_max_a,i.battery_voltage_min_v,i.battery_voltage_max_v,i.battery_charge_efficiency_percent,i.battery_discharge_efficiency_percent
 into p from public.ci_pcs_specs s join public.ci_inverters i on i.id=s.inverter_id where s.inverter_id=new.pcs_id;
 select s.*,c.max_current_a,c.max_association_qty,c.voltage_min_v,c.voltage_max_v,c.capacity_kwh,c.min_soc_percent,c.round_trip_efficiency_percent
 into b from public.ci_battery_specs s join public.ci_batteries c on c.id=s.battery_id where s.battery_id=new.battery_id;
 if not coalesce(p.active,false) or not coalesce(b.active,false) then raise exception 'PCS e bateria precisam estar ativos.';end if;
 if p.battery_ports is null or p.battery_ports<1 or new.max_ports_per_pcs>p.battery_ports then raise exception 'As portas utilizadas excedem a quantidade física de portas do PCS.';end if;
 if new.max_parallel_strings>p.max_strings_per_port then raise exception 'As strings por porta excedem o paralelo aprovado para cada porta do PCS.';end if;
 if b.max_association_qty>0 and new.max_series*new.max_parallel_strings>b.max_association_qty then raise exception 'A associação de módulos em uma porta excede o limite da bateria.';end if;
 if p.port_charge_current_a is null or p.port_discharge_current_a is null then raise exception 'Complete as correntes por porta do PCS.';end if;
 if p.battery_current_max_a>0 and greatest(p.port_charge_current_a,p.port_discharge_current_a)>p.battery_current_max_a then raise exception 'A corrente C&I por porta excede o limite por porta da ficha do PCS.';end if;
 if p.battery_voltage_min_v is null or p.battery_voltage_max_v is null or b.voltage_min_v is null or b.voltage_max_v is null
 or p.battery_voltage_min_v<=0 or p.battery_voltage_max_v<p.battery_voltage_min_v or b.voltage_min_v<=0 or b.voltage_max_v<b.voltage_min_v then raise exception 'Complete as faixas de tensão por porta e por módulo.';end if;
 if b.voltage_min_v*new.min_series<p.battery_voltage_min_v or b.voltage_max_v*new.max_series>p.battery_voltage_max_v then raise exception 'A tensão de uma string não cabe na janela da porta do PCS.';end if;
 if b.min_soc_percent>=b.soc_max_percent or b.capacity_kwh<=0 or b.round_trip_efficiency_percent is null or b.round_trip_efficiency_percent<=0 or b.round_trip_efficiency_percent>100
 or p.battery_charge_efficiency_percent is null or p.battery_charge_efficiency_percent<=0 or p.battery_charge_efficiency_percent>100
 or p.battery_discharge_efficiency_percent is null or p.battery_discharge_efficiency_percent<=0 or p.battery_discharge_efficiency_percent>100 then raise exception 'Verifique capacidade, SOC e eficiências das fichas.';end if;
 if new.max_pcs>p.max_parallel_units then raise exception 'Quantidade de PCS excede o paralelismo cadastrado.';end if;
 if p.power_kw>0 and p.discharge_power_kw>p.power_kw then raise exception 'A potência CA total excede a potência nominal do PCS.';end if;
 if b.max_current_a>0 and greatest(b.charge_current_a,b.discharge_current_a)>b.max_current_a then raise exception 'A corrente C&I excede a corrente máxima da bateria.';end if;
 if new.controller_accessory_id is not null and not exists(select 1 from public.ci_accessories a where a.id=new.controller_accessory_id and a.active) then raise exception 'O controlador obrigatório precisa estar ativo.';end if;
 if new.supports_backup and not p.supports_backup then raise exception 'O PCS não está cadastrado para backup.';end if;
 return new;
end $$;

-- Keep historical JSON immutable; only new generations use the v2 contract.
do $$declare item record;begin
 for item in select conname from pg_constraint where conrelid='public.ci_generated_solutions'::regclass and pg_get_constraintdef(oid) like '%contractVersion%' loop
 execute format('alter table public.ci_generated_solutions drop constraint %I',item.conname);end loop;
end $$;
alter table public.ci_generated_solutions
 add constraint ci_generated_contract_version check(coalesce(solution->>'contractVersion' in ('ci-grouped-v1','ci-grouped-v2'),false)),
 add column port_count integer not null default 1 check(port_count>0),
 add column series_max_count integer,
 add column parallel_max_count integer;
update public.ci_generated_solutions set series_max_count=series_count,parallel_max_count=parallel_count;
alter table public.ci_generated_solutions alter column series_max_count set not null,alter column parallel_max_count set not null,
 add constraint ci_series_bounds check(series_max_count>=series_count),add constraint ci_parallel_bounds check(parallel_max_count>=parallel_count);

create or replace function public.ci_append_solution_generation(p_generation_id uuid,p_solutions jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare expected integer;
begin
 if not public.is_admin() then raise insufficient_privilege using message='Acesso negado.';end if;
 select expected_count into expected from public.ci_solution_generations where id=p_generation_id and created_by=auth.uid() and status='draft' for update;
 if not found then raise exception 'Geração indisponível para edição.';end if;
 if jsonb_typeof(p_solutions)<>'array' or jsonb_array_length(p_solutions)>500 then raise exception 'Lote inválido.';end if;
 if exists(select 1 from jsonb_array_elements(p_solutions) s where s->>'contractVersion' is distinct from 'ci-grouped-v2' or jsonb_typeof(s->'dc'->'ports') is distinct from 'array' or jsonb_array_length(s->'dc'->'ports')<1) then raise exception 'Gere novamente com o contrato de portas independentes.';end if;
 insert into public.ci_generated_solutions(generation_id,solution_key,source_kind,source_id,unit_count,port_count,series_count,series_max_count,parallel_count,parallel_max_count,discharge_power_kw,charge_power_kw,usable_energy_kwh,nominal_energy_kwh,applications,solution)
 select p_generation_id,s->>'key',s->'source'->>'kind',(s->'source'->>'id')::uuid,(s->'counts'->>'units')::integer,(s->'counts'->>'ports')::integer,
 (select min((p->>'series')::integer) from jsonb_array_elements(s->'dc'->'ports') p),(select max((p->>'series')::integer) from jsonb_array_elements(s->'dc'->'ports') p),
 (select min((p->>'parallelStrings')::integer) from jsonb_array_elements(s->'dc'->'ports') p),(select max((p->>'parallelStrings')::integer) from jsonb_array_elements(s->'dc'->'ports') p),
 (s->'ac'->>'dischargePowerKw')::numeric,(s->'ac'->>'chargePowerKw')::numeric,(s->'storage'->>'usableEnergyKwh')::numeric,(s->'storage'->>'nominalEnergyKwh')::numeric,array(select jsonb_array_elements_text(s->'applications')),s
 from jsonb_array_elements(p_solutions) s;
 if (select count(*) from public.ci_generated_solutions where generation_id=p_generation_id)>expected then raise exception 'Quantidade excede a geração declarada.';end if;
end $$;
-- A draft started by an old application cannot reactivate the old interpretation.
create function public.ci_check_published_port_contract() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.is_current and exists(select 1 from public.ci_generated_solutions s where s.generation_id=new.id and s.solution->>'contractVersion' is distinct from 'ci-grouped-v2') then raise exception 'A geração deve usar portas independentes. Gere novamente.';end if;
 return new;
end $$;
revoke all on function public.ci_check_published_port_contract() from public;
create trigger ci_published_port_contract before update of is_current on public.ci_solution_generations for each row execute function public.ci_check_published_port_contract();
update public.ci_solution_generations set is_current=false,invalidated_at=now(),invalidation_reason='independent_battery_ports' where is_current;
