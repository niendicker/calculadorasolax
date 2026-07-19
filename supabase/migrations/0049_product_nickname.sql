-- Optional admin-facing nickname for catalog products, shown to end users
-- more prominently than the technical model name when set (e.g. "Super
-- Baterião" instead of "TP-HS3.6").
alter table inverters add column if not exists nickname text;
alter table batteries add column if not exists nickname text;
alter table accessories add column if not exists nickname text;
