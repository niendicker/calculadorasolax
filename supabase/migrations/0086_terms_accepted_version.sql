-- Records which published Terms/Privacy version the user accepted.
-- Existing accepted users intentionally remain without a version so the app
-- asks them to review the current documents once after this mechanism ships.
alter table public.profiles
  add column if not exists terms_accepted_version text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role, terms_accepted_at, terms_accepted_version)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    'user',
    case when new.raw_user_meta_data->>'terms_accepted' = 'true' then now() else null end,
    case when new.raw_user_meta_data->>'terms_accepted' = 'true'
      then nullif(new.raw_user_meta_data->>'terms_accepted_version', '')
      else null
    end
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
    phone = coalesce(nullif(excluded.phone, ''), profiles.phone),
    terms_accepted_at = coalesce(profiles.terms_accepted_at, excluded.terms_accepted_at),
    terms_accepted_version = coalesce(profiles.terms_accepted_version, excluded.terms_accepted_version),
    updated_at = now();

  return new;
end;
$$;
