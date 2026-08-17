-- on_auth_user_created (criado em 0004_profiles_auth.sql) sumiu do banco
-- self-hosted de produção — handle_new_user() estava presente e atualizado
-- (bateu com 0080), mas sem o trigger chamando ela nenhum signup novo
-- ganhava linha em public.profiles. Só uma conta foi pega antes de isso ser
-- detectado (auth.users sem profiles correspondente), backfillada abaixo com
-- a mesma lógica de 0080's handle_new_user — sem o "só preenche, nunca
-- limpa" do terms_accepted_at porque aqui a linha inteira não existia.
--
-- Recriar o trigger é idempotente (drop if exists + create), então é seguro
-- rodar de novo em qualquer ambiente, mesmo que ele já exista.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email, full_name, phone, role, terms_accepted_at)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  coalesce(u.raw_user_meta_data->>'phone', ''),
  'user',
  case when u.raw_user_meta_data->>'terms_accepted' = 'true' then now() else null end
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
