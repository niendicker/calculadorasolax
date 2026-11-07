-- No documented parallel capability is presumed for existing integrated products.
alter table public.ci_bess_products
  add column max_parallel_units integer not null default 1
  check (max_parallel_units between 1 and 256);
