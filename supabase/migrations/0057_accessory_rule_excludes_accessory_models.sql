-- Lets an accessory rule declare that, when it matches, one or more other
-- accessory models should be dropped from the solution's final accessory
-- list even if their own rule also matched — for cases where two different
-- accessories cover the same physical need and only one should win (e.g. an
-- ATS-bundled enclosure making a separate paralleling bracket redundant).
alter table accessory_rules
  add column excludes_accessory_models text[] null;
