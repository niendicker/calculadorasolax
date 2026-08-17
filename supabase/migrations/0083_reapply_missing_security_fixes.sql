-- Auditoria de schema (comparando as 82 migrações aplicadas do zero num
-- Postgres local vs. o schema real do banco self-hosted de produção)
-- encontrou que 0076_security_fixes.sql nunca chegou a rodar em produção:
-- nem a function enforce_profile_role_guard, nem o trigger
-- profiles_role_guard existiam, e a policy antiga "users manage own quote
-- shares" (sem checar dono do project_id) ainda estava no lugar das 4
-- policies granulares. As duas vulnerabilidades descritas no comentário
-- original da 0076 (escalação de privilégio em profiles.role via update
-- direto, e IDOR em quote_shares através da rota pública
-- /api/quote-shares/[token]/respond) estavam live em produção até este fix.
--
-- Conteúdo idêntico ao de 0076 — reaplicado aqui pra ficar versionado e
-- pra qualquer ambiente (incluindo ambientes recriados do zero) garantir
-- que essa proteção existe, já que aplicar migrações nesse banco self-hosted
-- não é automático.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    'user'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
    phone = coalesce(nullif(excluded.phone, ''), profiles.phone),
    updated_at = now();

  return new;
end;
$$;

create or replace function public.enforce_profile_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.role := 'user';
    elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_role_guard();

drop policy if exists "users manage own quote shares" on public.quote_shares;
drop policy if exists "users read own quote shares" on public.quote_shares;
drop policy if exists "users insert own quote shares" on public.quote_shares;
drop policy if exists "users update own quote shares" on public.quote_shares;
drop policy if exists "users delete own quote shares" on public.quote_shares;

create policy "users read own quote shares"
  on public.quote_shares for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users insert own quote shares"
  on public.quote_shares for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

create policy "users update own quote shares"
  on public.quote_shares for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own quote shares"
  on public.quote_shares for delete
  to authenticated
  using (auth.uid() = user_id);
