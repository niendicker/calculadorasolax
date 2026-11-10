-- STS passa a ter cadastro de produto próprio (ci_sts_products), como PCS e bateria.
-- Os IDs são preservados: ci_sts_specs.accessory_id e ci_sts_compatibility_rules.accessory_id
-- continuam apontando para o mesmo identificador (nome de coluna mantido para não alterar
-- snapshots, fingerprints e gerações de soluções já publicados).
create table public.ci_sts_products (like public.ci_accessories including defaults including constraints including indexes);

-- Um controlador obrigatório não pode ser uma STS: a cobrança deixaria de ter dono único.
do $$begin
 if exists(select 1 from public.ci_compatibility_rules r join public.ci_sts_specs s on s.accessory_id=r.controller_accessory_id) then
  raise exception 'Há compatibilidades PCS + bateria usando uma STS como controlador. Revise-as antes de aplicar 0107.';
 end if;
end $$;

insert into public.ci_sts_products select a.* from public.ci_accessories a where a.id in (select accessory_id from public.ci_sts_specs);

alter table public.ci_sts_products enable row level security;
create policy "authenticated read ci_sts_products" on public.ci_sts_products for select to authenticated using (true);
create policy "admin manage ci_sts_products" on public.ci_sts_products for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.ci_sts_products to authenticated;
grant select on public.ci_sts_products to service_role;

-- Fichas e compatibilidades STS passam a depender do produto STS.
alter table public.ci_sts_specs drop constraint ci_sts_specs_accessory_id_fkey;
alter table public.ci_sts_specs add constraint ci_sts_specs_accessory_id_fkey foreign key(accessory_id) references public.ci_sts_products(id) on delete restrict;

create or replace function public.validate_ci_sts_approval() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.approval_status <> 'approved' or not new.active then return new; end if;
  if not exists (select 1 from public.ci_sts_specs s join public.ci_sts_products a on a.id=s.accessory_id where s.accessory_id=new.accessory_id and s.active and a.active and new.frequency_hz=any(s.frequency_hz)) then raise exception 'STS e produto precisam estar ativos e suportar a frequência aprovada.'; end if;
  if new.pcs_id is not null and not exists (select 1 from public.ci_pcs_specs p where p.inverter_id=new.pcs_id and p.active and p.supports_backup and new.max_pcs<=p.max_parallel_units) then raise exception 'PCS deve suportar backup e a quantidade deve respeitar seu paralelismo.'; end if;
  if new.bess_product_id is not null and not exists (select 1 from public.ci_bess_products b where b.id=new.bess_product_id and b.active) then raise exception 'BESS integrado precisa estar ativo.'; end if;
  return new;
end $$;

drop policy "authenticated read active ci sts" on public.ci_sts_specs;
create policy "authenticated read active ci sts" on public.ci_sts_specs for select to authenticated using (active and exists(select 1 from public.ci_sts_products a where a.id=accessory_id and a.active));
drop policy "authenticated read approved ci sts rules" on public.ci_sts_compatibility_rules;
create policy "authenticated read approved ci sts rules" on public.ci_sts_compatibility_rules for select to authenticated using (
 active and approval_status='approved' and exists(select 1 from public.ci_sts_specs s join public.ci_sts_products a on a.id=s.accessory_id where s.accessory_id=ci_sts_compatibility_rules.accessory_id and s.active and a.active)
 and ((pcs_id is not null and exists(select 1 from public.ci_pcs_specs p where p.inverter_id=pcs_id and p.active and p.supports_backup and max_pcs<=p.max_parallel_units))
 or (bess_product_id is not null and exists(select 1 from public.ci_bess_products b where b.id=bess_product_id and b.active)))
);

-- Regras de acessório podem exigir/excluir/referenciar uma STS (a regra só confirma presença;
-- preço e quantidade continuam com o seletor elétrico). A FK única vira validação nas duas tabelas.
alter table public.ci_accessory_rules drop constraint ci_accessory_rules_accessory_id_fkey;
create or replace function public.validate_ci_accessory_dependencies() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.ci_accessories a where a.id=new.accessory_id) and not exists(select 1 from public.ci_sts_products s where s.id=new.accessory_id) then
  raise exception 'O acessório da regra deve pertencer ao catálogo C&I (acessórios ou STS).';
 end if;
 if exists(select 1 from unnest(new.requires_ids || new.excludes_ids) as dependency(accessory_id)
   where not exists(select 1 from public.ci_accessories a where a.id=dependency.accessory_id) and not exists(select 1 from public.ci_sts_products s where s.id=dependency.accessory_id)) then
  raise exception 'Dependências devem pertencer ao catálogo C&I (acessórios ou STS).';
 end if;
 return new;
end $$;

create or replace function public.restrict_ci_accessory_dependency_delete() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.ci_accessory_rules r where old.id=r.accessory_id or old.id=any(r.requires_ids) or old.id=any(r.excludes_ids)) then
  raise foreign_key_violation using message='Produto referenciado por regras de acessórios C&I.';
 end if;
 return old;
end $$;
create trigger ci_sts_product_dependency_delete before delete on public.ci_sts_products for each row execute function public.restrict_ci_accessory_dependency_delete();

-- As STS deixam de existir como acessório. As referências nas regras continuam válidas pelo mesmo ID.
alter table public.ci_accessories disable trigger ci_accessory_dependency_delete;
delete from public.ci_accessories where id in (select id from public.ci_sts_products);
alter table public.ci_accessories enable trigger ci_accessory_dependency_delete;

-- Portfólio: categoria própria ci_sts, preservando os preços (inclusive zeros) e as contas no limite.
alter table public.user_stock_items drop constraint user_stock_items_product_type_check;
alter table public.user_stock_items add constraint user_stock_items_product_type_check check(product_type in ('inverter','battery','accessory','ci_bess','ci_pcs','ci_battery','ci_accessory','ci_sts'));
do $$begin
 if exists(select 1 from pg_trigger where tgrelid='public.user_stock_items'::regclass and tgname='user_stock_items_limit_check') then
  alter table public.user_stock_items disable trigger user_stock_items_limit_check;
 end if;
end $$;
insert into public.user_stock_items(user_id,product_type,product_model,unit_value)
select s.user_id,'ci_sts',s.product_model,s.unit_value from public.user_stock_items s join public.ci_sts_products p on p.model=s.product_model
where s.product_type='ci_accessory' on conflict(user_id,product_type,product_model) do nothing;
delete from public.user_stock_items s using public.ci_sts_products p where s.product_type='ci_accessory' and s.product_model=p.model;
do $$begin
 if exists(select 1 from pg_trigger where tgrelid='public.user_stock_items'::regclass and tgname='user_stock_items_limit_check') then
  alter table public.user_stock_items enable trigger user_stock_items_limit_check;
 end if;
end $$;

-- Invalidação e revisão das soluções geradas passam a considerar o produto STS.
create or replace function public.ci_solution_source() returns jsonb language plpgsql security definer
set search_path=public,pg_temp as $$
declare sources jsonb;
begin
  if not public.is_admin() then raise insufficient_privilege using message='Apenas administradores podem gerar soluções C&I.';end if;
  select jsonb_build_object(
    'inverters',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_inverters t),'[]'),
    'batteries',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_batteries t),'[]'),
    'pcs',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by inverter_id) from public.ci_pcs_specs t),'[]'),
    'batterySpecs',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by battery_id) from public.ci_battery_specs t),'[]'),
    'rules',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_compatibility_rules t),'[]'),
    'products',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_bess_products t),'[]'),
    'accessories',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_accessories t),'[]'),
    'accessoryRules',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_accessory_rules t),'[]'),
    'stsProducts',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_sts_products t),'[]'),
    'sts',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by accessory_id) from public.ci_sts_specs t),'[]'),
    'stsRules',coalesce((select jsonb_agg(to_jsonb(t)-'updated_at' order by id) from public.ci_sts_compatibility_rules t),'[]')
  ) into sources;
  return jsonb_build_object('revision',md5(sources::text),'sources',sources);
end $$;
create trigger invalidate_ci_solutions after insert or update or delete on public.ci_sts_products for each row execute function public.invalidate_ci_solution_generation();

-- Uma transação salva produto STS e ficha técnica (mesmo padrão de save_ci_equipment).
create function public.save_ci_sts(p_product jsonb, p_limits jsonb, p_id uuid default null) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  sts_id uuid := coalesce(p_id, gen_random_uuid());
  previous_model text;
  prod public.ci_sts_products;
  spec public.ci_sts_specs;
begin
  if not coalesce(public.is_admin(), false) then
    raise insufficient_privilege using message = 'Apenas administradores podem salvar STS C&I.';
  end if;
  if coalesce(btrim(p_product->>'model'), '') = '' then raise exception 'Informe o modelo.'; end if;
  select model into previous_model from public.ci_sts_products where id = sts_id for update;
  if previous_model is not null and previous_model <> btrim(p_product->>'model') then
    raise exception 'Para preservar preços e histórico, mantenha o modelo cadastrado. Use o apelido para alterar o nome exibido.';
  end if;
  prod := jsonb_populate_record(null::public.ci_sts_products, p_product);
  insert into public.ci_sts_products (id, model, nickname, description, active, warranty_years, image_url, documents)
  values (sts_id, prod.model, prod.nickname, prod.description, coalesce(prod.active, true), coalesce(prod.warranty_years, 2), prod.image_url, coalesce(prod.documents, '[]'::jsonb))
  on conflict (id) do update set
    model = excluded.model, nickname = excluded.nickname, description = excluded.description, active = excluded.active,
    warranty_years = excluded.warranty_years, image_url = excluded.image_url, documents = excluded.documents;
  if p_limits is not null and p_limits <> 'null'::jsonb then
    spec := jsonb_populate_record(null::public.ci_sts_specs, p_limits);
    insert into public.ci_sts_specs (accessory_id, active, rated_current_380v_a, rated_current_400v_a, frequency_hz, ems_included, reference_document, revision)
    values (sts_id, spec.active, spec.rated_current_380v_a, spec.rated_current_400v_a, spec.frequency_hz, spec.ems_included, spec.reference_document, spec.revision)
    on conflict (accessory_id) do update set
      active = excluded.active, rated_current_380v_a = excluded.rated_current_380v_a, rated_current_400v_a = excluded.rated_current_400v_a,
      frequency_hz = excluded.frequency_hz, ems_included = excluded.ems_included, reference_document = excluded.reference_document, revision = excluded.revision;
  end if;
  return jsonb_build_object(
    'product', (select to_jsonb(p) from public.ci_sts_products p where id = sts_id),
    'limits', (select to_jsonb(s) from public.ci_sts_specs s where accessory_id = sts_id));
end $$;
revoke all on function public.save_ci_sts(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_ci_sts(jsonb, jsonb, uuid) to authenticated;

-- Remove STS não referenciada. FKs e o gatilho de dependências recusam a remoção se houver uso.
create function public.delete_ci_sts(p_id uuid) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise insufficient_privilege using message = 'Apenas administradores podem remover STS C&I.';
  end if;
  perform 1 from public.ci_sts_products where id = p_id for update;
  delete from public.ci_sts_specs where accessory_id = p_id;
  delete from public.ci_sts_products where id = p_id;
end $$;
revoke all on function public.delete_ci_sts(uuid) from public, anon;
grant execute on function public.delete_ci_sts(uuid) to authenticated;
