-- Restrict admin_activity_logs to admins only. The public policies allowed
-- any authenticated (or anon, depending on key exposure) user to read
-- admin history or write arbitrary log rows.
drop policy if exists "public read admin_activity_logs" on admin_activity_logs;
drop policy if exists "public write admin_activity_logs" on admin_activity_logs;

create policy "admin read admin_activity_logs"
  on admin_activity_logs for select
  using (public.is_admin());

create policy "admin write admin_activity_logs"
  on admin_activity_logs for insert
  with check (public.is_admin());

-- Reject zero/negative values for the admin-configured max power per phase;
-- null (no override) stays allowed.
alter table inverters
  add constraint inverters_max_power_per_phase_w_positive
  check (max_power_per_phase_w is null or max_power_per_phase_w > 0);
