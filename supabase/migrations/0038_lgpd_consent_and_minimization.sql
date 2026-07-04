-- LGPD: track terms/privacy acceptance per user, and stop retaining a
-- client's name in usage telemetry (app_simulations), since it was
-- collected but never read anywhere in the app.

alter table profiles add column if not exists terms_accepted_at timestamptz;

update app_simulations set client_name = null where client_name is not null;
