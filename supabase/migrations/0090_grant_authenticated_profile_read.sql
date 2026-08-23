-- The profile RLS policy is row-scoped, but the authenticated PostgREST role
-- also needs table-level SELECT privilege for the policy to be evaluated.
grant select on table public.profiles to authenticated;
