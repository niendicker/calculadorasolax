-- 0083_reapply_missing_security_fixes.sql reapplied handle_new_user() using
-- 0076's original body (written to restore 0076's role-guard fix, which
-- never ran in production) — but 0076 predates 0080_terms_accepted_at_
-- from_signup_metadata.sql, which had *also* modified this same function to
-- read terms_accepted from raw_user_meta_data. Since 0083 ran after both
-- 0080 and 0082 (chronologically later, `create or replace` overwrites
-- unconditionally), it silently reverted that logic back out — every
-- profiles row created since 0083 ran has gotten terms_accepted_at = null
-- regardless of what the signup form actually sent, sending brand-new users
-- through the "aceite-termos" gate a second time right after confirming
-- their email.
--
-- Reapplies 0080/0082's version (identical function body) and repeats
-- 0082's own backfill in case any other environment hit the same 0083
-- regression and has affected rows sitting around.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role, terms_accepted_at)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    'user',
    case when new.raw_user_meta_data->>'terms_accepted' = 'true' then now() else null end
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
    phone = coalesce(nullif(excluded.phone, ''), profiles.phone),
    -- Never clear an already-recorded acceptance; only ever fill it in.
    terms_accepted_at = coalesce(profiles.terms_accepted_at, excluded.terms_accepted_at),
    updated_at = now();

  return new;
end;
$$;

update public.profiles p
set terms_accepted_at = now()
from auth.users u
where u.id = p.id
  and p.terms_accepted_at is null
  and u.raw_user_meta_data->>'terms_accepted' = 'true';
