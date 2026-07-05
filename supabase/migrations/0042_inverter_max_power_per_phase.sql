-- Optional admin-configured max power per phase for an inverter, used to
-- validate phase balance of loads in the residential sizing app. When left
-- blank, the app falls back to standard power / number of network phases.

alter table inverters add column if not exists max_power_per_phase_w numeric;
