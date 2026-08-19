alter table public.user_services
  add column if not exists pricing_unit text not null default 'project';

alter table public.user_services
  drop constraint if exists user_services_pricing_unit_check;

alter table public.user_services
  add constraint user_services_pricing_unit_check
  check (pricing_unit in (
    'project', 'pv_kwp', 'nominal_kva', 'peak_kva', 'daily_kwh',
    'battery_qty', 'inverter_qty', 'accessory_qty', 'load_qty'
  ));
