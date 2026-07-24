-- scale_with_metric (0053) only supported "1 unit of accessory per 1 unit of
-- the metric" (times quantity_per_match). Some accessories instead need to
-- be added once per *group* of the metric — e.g. "1 management module per
-- 4 batteries in a port" — which needs dividing the metric by a group size
-- before multiplying, not just multiplying by the raw metric value.
-- metric_divisor is that group size; rounds up (ceil), since real hardware
-- with a max capacity per unit needs a new unit as soon as it's exceeded,
-- not only once a group is exactly full.
alter table accessory_rules
  add column if not exists metric_divisor int not null default 1;

alter table accessory_rules
  add constraint accessory_rules_metric_divisor_check check (metric_divisor > 0);
