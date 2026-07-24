-- Accessory rules could only add a flat quantity_per_match once their
-- trigger_metric crossed min_quantity — there was no way to make the added
-- quantity scale with the metric itself (e.g. "1 unit per battery port in
-- use"), which is what admins configuring a per-port accessory actually
-- expect. scale_with_metric opts a rule into quantity_per_match * the
-- metric's live value instead of a flat quantity_per_match.
alter table accessory_rules
  add column if not exists scale_with_metric boolean not null default false;
