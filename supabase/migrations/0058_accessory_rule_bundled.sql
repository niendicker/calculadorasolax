-- Marks an accessory rule as representing an item that ships bundled with the
-- inverter (e.g. a WiFi dongle or CTs that come in the box) rather than a
-- separately-required/optional accessory — shown with its own "Incluso"
-- badge on the customer-facing solution card instead of Obrigatório/Opcional.
alter table accessory_rules
  add column bundled boolean not null default false;
