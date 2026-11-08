begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

insert into auth.users(id, email) values
 ('f1000000-0000-4000-8000-000000000001', 'ci-unified-test@example.invalid');
update public.profiles set role = 'admin' where id = 'f1000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);

create temporary table equipment_test_fixture(kind text primary key, product jsonb, limits jsonb);
insert into equipment_test_fixture values ('pcs', '{"model": "Teste PCS unificado", "nickname": "Original", "power_kw": 100, "standard_power_kva": 100, "peak_power_kva": 120, "phases": 3, "topology": "HV", "grid_types": ["3P_380V"], "max_battery_qty": 4, "battery_ports": 2, "battery_voltage_min_v": 200, "battery_voltage_max_v": 800, "battery_current_max_a": 200, "max_power_per_phase_w": null, "battery_charge_efficiency_percent": 97, "battery_discharge_efficiency_percent": 97, "standby_consumption_w": 0, "max_battery_charge_power_w": null, "max_battery_discharge_power_w": null, "flags": [], "pv_oversizing_percent": 100, "warranty_years": 10, "image_url": null, "documents": []}', '{"active": true, "charge_power_kw": 80, "discharge_power_kw": 100, "charge_current_a": 150, "discharge_current_a": 160, "port_charge_current_a": 150, "port_discharge_current_a": 160, "port_charge_power_kw": null, "port_discharge_power_kw": null, "max_parallel_units": 4, "max_strings_per_port": 2, "supports_backup": true}');
insert into equipment_test_fixture values ('batteries', '{"model": "Teste bateria unificada", "nickname": null, "capacity_kwh": 50, "topology": "HV", "standard_power_kw": 40, "peak_power_kw": 50, "min_soc_percent": 10, "round_trip_efficiency_percent": 95, "initial_soh_percent": 100, "annual_soh_loss_percent": 2, "warranty_end_soh_percent": 70, "nominal_voltage_v": 500, "voltage_min_v": 400, "voltage_max_v": 600, "recommended_current_a": 80, "max_current_a": 100, "flags": [], "max_association_qty": 15, "expansion_model": null, "warranty_years": 10, "warranty_cycles": 6000, "image_url": null, "documents": []}', '{"active": true, "unit_kind": "rack", "charge_power_kw": 40, "discharge_power_kw": 45, "charge_current_a": 80, "discharge_current_a": 90, "soc_max_percent": 95}');
grant select on equipment_test_fixture to authenticated;
set local role authenticated;

select lives_ok($$select public.save_ci_equipment('pcs', product, limits, 'f2000000-0000-4000-8000-000000000001') from equipment_test_fixture where kind='pcs'$$,
 'PCS product and limits save together');
select is((select charge_power_kw from public.ci_pcs_specs where inverter_id='f2000000-0000-4000-8000-000000000001'), 80::numeric, 'PCS ratings use the product ID');
select lives_ok($$select public.save_ci_equipment('batteries', product, limits, 'f2000000-0000-4000-8000-000000000002') from equipment_test_fixture where kind='batteries'$$,
 'Battery product and limits save together');
select is((select soc_max_percent from public.ci_battery_specs where battery_id='f2000000-0000-4000-8000-000000000002'), 95::numeric, 'Battery SOC saved');
select throws_ok($$select public.save_ci_equipment('pcs', product || '{"nickname":"Should roll back"}', limits || '{"port_charge_current_a":201}', 'f2000000-0000-4000-8000-000000000001') from equipment_test_fixture where kind='pcs'$$,
 'P0001', 'A corrente por porta excede o limite por porta da ficha do PCS.', 'Rejects excessive port current');
select is((select nickname from public.ci_inverters where id='f2000000-0000-4000-8000-000000000001'), 'Original', 'Failed limits roll back product changes');
select throws_ok($$select public.save_ci_equipment('batteries', product || '{"nickname":"Should roll back"}', limits || '{"soc_max_percent":5}', 'f2000000-0000-4000-8000-000000000002') from equipment_test_fixture where kind='batteries'$$,
 'P0001', 'SOC máximo deve ser maior que o SOC mínimo da ficha da bateria.', 'Rejects inconsistent SOC');
select is((select nickname from public.ci_batteries where id='f2000000-0000-4000-8000-000000000002'), null::text, 'Failed SOC rolls back battery changes');
select lives_ok($$select public.save_ci_equipment('pcs', product || '{"nickname":"Updated"}', limits || '{"charge_power_kw":70}', 'f2000000-0000-4000-8000-000000000001') from equipment_test_fixture where kind='pcs'$$,
 'Updates product and limits with the same ID');
select throws_ok($$select public.save_ci_equipment('pcs', product || '{"model":"Renamed"}', limits, 'f2000000-0000-4000-8000-000000000001') from equipment_test_fixture where kind='pcs'$$,
 'P0001', 'Para preservar preços e histórico, mantenha o modelo cadastrado. Use o apelido para alterar o nome exibido.', 'Protects model identity');
select lives_ok($$select public.save_ci_equipment('pcs', product || '{"model":"Pending PCS"}', null, 'f2000000-0000-4000-8000-000000000003') from equipment_test_fixture where kind='pcs'$$,
 'Supports a product with pending limits');
select is((select count(*) from public.ci_pcs_specs where inverter_id='f2000000-0000-4000-8000-000000000003'), 0::bigint, 'Draft has no invented ratings');

insert into public.ci_compatibility_rules(name,pcs_id,battery_id,min_series,max_series,min_parallel_strings,max_parallel_strings,min_pcs,max_pcs)
 values ('Unified test reference','f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002',1,1,1,1,1,1);
select throws_ok($$select public.delete_ci_equipment('pcs','f2000000-0000-4000-8000-000000000001')$$,
 '23503', null, 'Preserves equipment referenced by compatibility');
delete from public.ci_compatibility_rules where pcs_id='f2000000-0000-4000-8000-000000000001';
select lives_ok($$select public.delete_ci_equipment('pcs','f2000000-0000-4000-8000-000000000001')$$,
 'Deletes an unreferenced product and its ratings together');
select lives_ok($$select public.save_ci_equipment('pcs', product || '{"model":"Generated identity PCS"}', limits) from equipment_test_fixture where kind='pcs'$$,
 'Creates a product and ratings with a generated ID');
select ok(exists(select 1 from public.ci_inverters i join public.ci_pcs_specs s on s.inverter_id=i.id where i.model='Generated identity PCS'), 'Generated ID is shared by product and ratings');
select throws_ok($$select public.save_ci_equipment('pcs', product || '{"model":"Rejected new PCS"}', limits || '{"charge_power_kw":-1}') from equipment_test_fixture where kind='pcs'$$,
 '23514', null, 'Rejects invalid new equipment ratings');
select is((select count(*) from public.ci_inverters where model='Rejected new PCS'), 0::bigint, 'Failed creation leaves no orphan product');
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000099', true);
select throws_ok($$select public.save_ci_equipment('pcs', product, limits, null) from equipment_test_fixture where kind='pcs'$$,
 '42501', 'Apenas administradores podem salvar equipamentos C&I.', 'Non-admin cannot save equipment');
select ok(not has_function_privilege('anon', 'public.save_ci_equipment(text,jsonb,jsonb,uuid)', 'EXECUTE'), 'Anonymous cannot call equipment RPC');
select * from finish();
rollback;
