-- Tracks a project's quotation lifecycle (Projeto tab) — draft while still
-- being configured, sent once shared with the client, then accepted or
-- rejected once the client responds. Lets the project list surface what
-- still needs following up instead of every project looking the same.
alter table projects
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'rejected'));
