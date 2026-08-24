-- Persistent, per-supplier quote requests. The request table is deliberately
-- separate from project_events: events are an append-only timeline, while
-- these rows are the durable state machine used for cooldown, quota and
-- idempotent claiming before an external email is sent.

alter table public.app_settings
  add column if not exists max_quote_suppliers integer not null default 2 check (max_quote_suppliers between 1 and 2),
  add column if not exists max_quote_sends_24h integer not null default 20 check (max_quote_sends_24h > 0),
  add column if not exists quote_cooldown_hours integer not null default 24 check (quote_cooldown_hours > 0);

create table if not exists public.supplier_quote_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  idempotency_key uuid not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_sent_at timestamptz,
  last_attempt_at timestamptz not null default now(),
  send_count integer not null default 0 check (send_count >= 0),
  error_message text,
  attempt_started_at timestamptz,
  claim_token uuid,
  unique (user_id, idempotency_key, supplier_id)
);

create index if not exists supplier_quote_requests_project_supplier_idx
  on public.supplier_quote_requests (project_id, supplier_id, created_at desc);
create index if not exists supplier_quote_requests_user_created_idx
  on public.supplier_quote_requests (user_id, created_at desc);

alter table public.supplier_quote_requests enable row level security;

drop policy if exists "users read own supplier quote requests" on public.supplier_quote_requests;
create policy "users read own supplier quote requests"
  on public.supplier_quote_requests for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- All writes happen through the claim function or the server-side service
-- client after Resend returns. There is intentionally no client INSERT,
-- UPDATE or DELETE policy.

create or replace function public.claim_supplier_quote_requests(
  p_project_id uuid,
  p_supplier_ids uuid[],
  p_idempotency_key uuid
)
returns table (
  request_id uuid,
  supplier_id uuid,
  status text,
  claimed boolean,
  retry_at timestamptz,
  claim_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  max_suppliers integer;
  max_sends integer;
  cooldown_hours integer;
  selected_count integer;
  valid_count integer;
  used_sends integer;
  claimed_count integer := 0;
  supplier uuid;
  existing public.supplier_quote_requests%rowtype;
  active_request public.supplier_quote_requests%rowtype;
  recent_sent public.supplier_quote_requests%rowtype;
  new_claim_token uuid;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_project_id is null or p_idempotency_key is null then
    raise exception 'invalid_request_identity' using errcode = '22023';
  end if;

  select max_quote_suppliers, max_quote_sends_24h, quote_cooldown_hours
    into max_suppliers, max_sends, cooldown_hours
    from public.app_settings
   where id = true;

  selected_count := coalesce(array_length(p_supplier_ids, 1), 0);
  if selected_count = 0 then
    raise exception 'no_suppliers' using errcode = '22023';
  end if;
  select count(distinct value)::integer into selected_count
    from unnest(p_supplier_ids) as input(value);
  if selected_count > max_suppliers then
    raise exception 'supplier_limit' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.projects p
     where p.id = p_project_id and p.user_id = current_user_id
  ) then
    raise exception 'project_access_denied' using errcode = '42501';
  end if;

  select count(distinct s.id)::integer into valid_count
    from public.suppliers s
   where s.id = any(p_supplier_ids)
     and s.active
     and s.ordering_enabled
     and (s.is_default_for_all or exists (
       select 1 from public.user_supplier_preferences usp
        where usp.user_id = current_user_id and usp.supplier_id = s.id
     ));
  if valid_count <> selected_count then
    raise exception 'supplier_not_allowed' using errcode = '42501';
  end if;

  -- Serialize all requests for this user's project. This closes the
  -- check-then-insert race between two browser tabs/retries.
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':' || p_project_id::text, 0));

  select coalesce(sum(r.send_count), 0)::integer into used_sends
    from public.supplier_quote_requests r
   where r.user_id = current_user_id
     and r.last_attempt_at >= now() - interval '24 hours';

  foreach supplier in array p_supplier_ids loop
    select * into existing
      from public.supplier_quote_requests r
     where r.user_id = current_user_id
       and r.project_id = p_project_id
       and r.supplier_id = supplier
       and r.idempotency_key = p_idempotency_key
     for update;

    if existing.id is not null then
      if existing.status = 'sent' then
        request_id := existing.id; supplier_id := supplier; status := 'sent';
        claimed := false; retry_at := existing.sent_at + make_interval(hours => cooldown_hours);
        claim_token := null; return next; continue;
      elsif existing.status in ('pending', 'sending') then
        request_id := existing.id; supplier_id := supplier; status := existing.status;
        claimed := false; retry_at := null; claim_token := null; return next; continue;
      end if;
    end if;

    -- A new idempotency key must not bypass an in-flight request after a
    -- browser timeout or a retry from another tab. Keeping the row in
    -- sending until the original worker records its result favors the
    -- safety property (no duplicate external email) over blind retries.
    select * into active_request
      from public.supplier_quote_requests r
     where r.user_id = current_user_id
       and r.project_id = p_project_id
       and r.supplier_id = supplier
       and r.status in ('pending', 'sending')
     order by r.created_at desc
     limit 1
     for update;
    if active_request.id is not null then
      request_id := active_request.id; supplier_id := supplier; status := active_request.status;
      claimed := false; retry_at := null; claim_token := null; return next; continue;
    end if;

    select * into recent_sent
      from public.supplier_quote_requests r
     where r.user_id = current_user_id
       and r.project_id = p_project_id
       and r.supplier_id = supplier
       and r.status = 'sent'
       and coalesce(r.sent_at, r.last_sent_at, r.created_at) >= now() - make_interval(hours => cooldown_hours)
     order by coalesce(r.sent_at, r.last_sent_at, r.created_at) desc
     limit 1;
    if recent_sent.id is not null then
      request_id := recent_sent.id; supplier_id := supplier; status := 'cooldown';
      claimed := false; retry_at := recent_sent.sent_at + make_interval(hours => cooldown_hours);
      claim_token := null; return next; continue;
    end if;

    if used_sends + claimed_count >= max_sends then
      raise exception 'daily_quote_quota' using errcode = '22023';
    end if;

    new_claim_token := gen_random_uuid();
    if existing.id is null then
      insert into public.supplier_quote_requests (
        user_id, project_id, supplier_id, idempotency_key, status,
        send_count, attempt_started_at, last_attempt_at, claim_token
      ) values (
        current_user_id, p_project_id, supplier, p_idempotency_key, 'sending',
        1, now(), now(), new_claim_token
      ) returning id into request_id;
    else
      update public.supplier_quote_requests r
         set status = 'sending', send_count = r.send_count + 1,
             error_message = null, attempt_started_at = now(), last_attempt_at = now(), claim_token = new_claim_token
       where r.id = existing.id
      returning r.id into request_id;
    end if;
    claimed_count := claimed_count + 1;
    supplier_id := supplier; status := 'sending'; claimed := true;
    retry_at := null; claim_token := new_claim_token; return next;
  end loop;
end;
$$;

revoke all on function public.claim_supplier_quote_requests(uuid, uuid[], uuid) from public;
grant execute on function public.claim_supplier_quote_requests(uuid, uuid[], uuid) to authenticated;
