-- Lets an accessory_rules row require the customer to have enabled one of a
-- set of desired features (Backup, ATS Externo, Microrrede, Gerador Externo,
-- Sem FV, Tarifa Branca) before it applies, in addition to the existing
-- inverter/battery/grid-topology/quantity conditions. Empty array (default)
-- keeps today's behavior: no feature condition.
alter table accessory_rules
  add column if not exists desired_features text[] not null default '{}';

alter table accessory_rules
  add constraint accessory_rules_desired_features_check
  check (
    desired_features <@ array['backup','external_ats','microgrid','external_generator','no_pv','white_tariff']::text[]
  );
