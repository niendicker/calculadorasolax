-- Load presets: bundles of loads users can add to a project in one click,
-- previously hardcoded in components/wizard/LoadSelector.tsx. Moving them
-- into the database lets admins edit name, description, and loads without
-- a code deploy.

create table if not exists load_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  loads jsonb not null default '[]'::jsonb,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table load_presets enable row level security;

create policy "public read load_presets" on load_presets for select using (true);
create policy "admin write load_presets"
  on load_presets for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Let the admin activity log record edits to presets.
alter table admin_activity_logs
  drop constraint if exists admin_activity_logs_entity_type_check;

alter table admin_activity_logs
  add constraint admin_activity_logs_entity_type_check
  check (entity_type in ('inverter', 'battery', 'accessory', 'solution', 'rule', 'load_catalog_item', 'load_preset'));

-- Seed with the presets that used to be hardcoded, so existing behavior is
-- preserved and admins can now edit them from the admin panel.
insert into load_presets (name, description, loads, display_order) values
  (
    'Residencial essencial',
    'Cargas básicas para simulação rápida de uma residência pequena.',
    '[
      {"name": "Geladeira", "powerW": 180, "hoursPerDay": 12, "qty": 1, "ipInRatio": 3},
      {"name": "Iluminação LED", "powerW": 12, "hoursPerDay": 5, "qty": 8, "ipInRatio": 1},
      {"name": "Televisão", "powerW": 120, "hoursPerDay": 4, "qty": 1, "ipInRatio": 1},
      {"name": "Roteador", "powerW": 15, "hoursPerDay": 24, "qty": 1, "ipInRatio": 1},
      {"name": "Ventilador", "powerW": 80, "hoursPerDay": 6, "qty": 2, "ipInRatio": 1}
    ]'::jsonb,
    0
  ),
  (
    'Residencial médio',
    'Perfil comum com cozinha, lavanderia, iluminação e eletrônicos.',
    '[
      {"name": "Geladeira", "powerW": 180, "hoursPerDay": 12, "qty": 1, "ipInRatio": 3},
      {"name": "Freezer", "powerW": 220, "hoursPerDay": 10, "qty": 1, "ipInRatio": 3},
      {"name": "Iluminação LED", "powerW": 12, "hoursPerDay": 5, "qty": 12, "ipInRatio": 1},
      {"name": "Televisão", "powerW": 120, "hoursPerDay": 5, "qty": 2, "ipInRatio": 1},
      {"name": "Roteador", "powerW": 15, "hoursPerDay": 24, "qty": 1, "ipInRatio": 1},
      {"name": "Máquina de lavar", "powerW": 600, "hoursPerDay": 1, "qty": 1, "ipInRatio": 2},
      {"name": "Micro-ondas", "powerW": 1200, "hoursPerDay": 0.5, "qty": 1, "ipInRatio": 1}
    ]'::jsonb,
    1
  ),
  (
    'Home office + conforto',
    'Inclui estação de trabalho, ar-condicionado e cargas de uso prolongado.',
    '[
      {"name": "Geladeira", "powerW": 180, "hoursPerDay": 12, "qty": 1, "ipInRatio": 3},
      {"name": "Iluminação LED", "powerW": 12, "hoursPerDay": 6, "qty": 10, "ipInRatio": 1},
      {"name": "Roteador", "powerW": 15, "hoursPerDay": 24, "qty": 1, "ipInRatio": 1},
      {"name": "Notebook", "powerW": 90, "hoursPerDay": 8, "qty": 2, "ipInRatio": 1},
      {"name": "Monitor", "powerW": 45, "hoursPerDay": 8, "qty": 2, "ipInRatio": 1},
      {"name": "Ar-condicionado 9.000 BTU", "powerW": 900, "hoursPerDay": 6, "qty": 1, "ipInRatio": 3},
      {"name": "Televisão", "powerW": 120, "hoursPerDay": 4, "qty": 1, "ipInRatio": 1}
    ]'::jsonb,
    2
  );
