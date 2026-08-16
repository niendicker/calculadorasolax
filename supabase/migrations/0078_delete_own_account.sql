-- Lets a user delete their own account (see "Excluir conta" in Meu perfil,
-- app/api/account/delete) without the Next.js server needing the
-- service-role key: auth.admin.deleteUser() only exists on GoTrue's admin
-- API, which requires service_role — this does the equivalent row delete
-- directly, through a security-definer function scoped to auth.uid() so it
-- can never target another user's account (no id parameter to spoof at
-- all, unlike a p_user_id-style argument). profiles/clients/projects/
-- user_load_catalog cascade via their existing FK to auth.users, same as
-- with the admin API.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
