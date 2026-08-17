-- One-time backfill for accounts caught by the bug fixed in 0080: anyone who
-- signed up through AuthPanel's form (required checkbox, so they did
-- consent) before that fix, but whose terms_accepted_at never got recorded
-- because the client-side upsert ran without a session while email
-- confirmation was pending.
--
-- Scope, deliberately narrow: only rows where terms_accepted_at is still
-- null AND raw_user_meta_data has 'full_name' — that key is only ever set by
-- AuthPanel's own signUp() call (options.data), so its presence is a proxy
-- for "went through the mandatory-checkbox form", without needing to guess
-- a migration-date cutoff. Pre-existing accounts from before terms tracking
-- existed at all (profiles.terms_accepted_at, added in
-- 0038_lgpd_consent_and_minimization.sql) never had that metadata key and
-- are correctly left alone — they still get one real /aceite-termos prompt,
-- same as intended for "existing accounts the first time the policy changed".
--
-- Uses each profile's own created_at (= signup time, set by handle_new_user
-- inserting inline with the auth.users row) rather than now(), so the
-- recorded acceptance timestamp reflects when the checkbox was actually
-- checked, not when this backfill happened to run.
update public.profiles p
set terms_accepted_at = coalesce(p.created_at, now())
from auth.users u
where p.id = u.id
  and p.terms_accepted_at is null
  and u.raw_user_meta_data ? 'full_name';
