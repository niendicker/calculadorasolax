-- Allow admins to disable a load catalog item without deleting it,
-- mirroring the accessories active/inactive pattern.

alter table load_catalog add column if not exists active boolean not null default true;
