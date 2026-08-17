-- AuthPanel.tsx's signup() used to set terms_accepted_at with a follow-up
-- `profiles.upsert(...)` right after auth.signUp() — but when email
-- confirmation is required (mailer_autoconfirm: false), signUp() returns no
-- session yet, so that upsert runs unauthenticated, RLS silently drops it
-- (0 rows affected, no error surfaced — the call site didn't check anyway),
-- and terms_accepted_at stays null. Every new signup then hit the
-- /aceite-termos gate right after confirming their email — a screen meant
-- for existing users after a terms update, not brand-new signups.
--
-- Same fix pattern as full_name/phone: read it from raw_user_meta_data in
-- handle_new_user (security definer, runs regardless of session state) —
-- the signup form already requires the checkbox before calling signUp(), so
-- this is the same trust tier as full_name/phone, not the privilege-relevant
-- case 0076_security_fixes.sql hardened `role` against.
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
