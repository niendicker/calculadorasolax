-- The admin UI no longer offers a required/optional choice when configuring
-- an accessory rule — every rule-applied accessory is now always required
-- (see RulesEditor.tsx). Backfill existing rows so nothing already saved as
-- 'optional' silently keeps the old behavior with no way to edit it back.
update accessory_rules set inclusion = 'required' where inclusion <> 'required';
