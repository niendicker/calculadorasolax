-- Some battery lines require a "Master" unit plus electrically-identical
-- "Slave"/expansion units to grow capacity (e.g. "T58 V2 Master" + "T58
-- Slave"). This is display-only metadata: energy/power math already treats
-- battery_quantity as N identical units, which holds true for these lines
-- too. expansion_model, set on the Master row, names the model to show for
-- units 2..N instead of repeating the Master's model.
alter table batteries add column if not exists expansion_model text;
