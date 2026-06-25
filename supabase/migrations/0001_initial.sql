-- Load catalog (replaces local SQLite catalog)
create table if not exists load_catalog (
  id uuid primary key default gen_random_uuid(),
  name_pt text not null,
  name_en text not null,
  name_zh text not null,
  power_w int not null,
  category text not null,
  created_at timestamptz default now()
);

-- Inverter models
create table if not exists inverters (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  power_kw numeric not null,
  phases int not null check (phases in (1, 3)),
  topology text not null check (topology in ('HV', 'LV', 'BOTH')),
  grid_types text[] not null default '{}',
  max_battery_qty int not null default 4,
  created_at timestamptz default now()
);

-- Battery models
create table if not exists batteries (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  capacity_kwh numeric not null,
  topology text not null check (topology in ('HV', 'LV')),
  created_at timestamptz default now()
);

-- Enable RLS
alter table load_catalog enable row level security;
alter table inverters enable row level security;
alter table batteries enable row level security;

-- Public read access
create policy "public read load_catalog" on load_catalog for select using (true);
create policy "public read inverters" on inverters for select using (true);
create policy "public read batteries" on batteries for select using (true);

-- ================================================================
-- Seed: Load catalog
-- ================================================================
insert into load_catalog (name_pt, name_en, name_zh, power_w, category) values
  ('Ar-condicionado 9000 BTU', 'Air conditioner 9000 BTU', '空调 9000 BTU', 900, 'Climatização'),
  ('Ar-condicionado 12000 BTU', 'Air conditioner 12000 BTU', '空调 12000 BTU', 1200, 'Climatização'),
  ('Ar-condicionado 18000 BTU', 'Air conditioner 18000 BTU', '空调 18000 BTU', 1800, 'Climatização'),
  ('Bomba d''água 1/2 CV', 'Water pump 1/2 HP', '水泵 1/2 HP', 370, 'Bombeamento'),
  ('Bomba d''água 1 CV', 'Water pump 1 HP', '水泵 1 HP', 750, 'Bombeamento'),
  ('Chuveiro elétrico', 'Electric shower', '电热水器', 5500, 'Aquecimento'),
  ('Freezer horizontal', 'Chest freezer', '卧式冷柜', 150, 'Refrigeração'),
  ('Geladeira duplex', 'Duplex refrigerator', '双门冰箱', 200, 'Refrigeração'),
  ('Iluminação LED (por lâmpada)', 'LED light (per bulb)', 'LED灯（每个）', 9, 'Iluminação'),
  ('Microondas', 'Microwave', '微波炉', 1200, 'Eletrodomésticos'),
  ('Televisão 32"', '32" TV', '32寸电视', 60, 'Eletrônicos'),
  ('Televisão 55"', '55" TV', '55寸电视', 120, 'Eletrônicos'),
  ('Computador desktop', 'Desktop computer', '台式电脑', 200, 'Eletrônicos'),
  ('Notebook', 'Laptop', '笔记本电脑', 60, 'Eletrônicos'),
  ('Roteador Wi-Fi', 'Wi-Fi router', 'Wi-Fi路由器', 15, 'Eletrônicos'),
  ('Lavadora de roupas', 'Washing machine', '洗衣机', 1000, 'Eletrodomésticos'),
  ('Secadora de roupas', 'Clothes dryer', '烘干机', 1500, 'Eletrodomésticos'),
  ('Máquina de lavar louça', 'Dishwasher', '洗碗机', 1800, 'Eletrodomésticos'),
  ('Cafeteira elétrica', 'Coffee maker', '咖啡机', 1000, 'Eletrodomésticos'),
  ('Forno elétrico', 'Electric oven', '电烤箱', 2000, 'Eletrodomésticos');

-- ================================================================
-- Seed: Inverters
-- ================================================================
insert into inverters (model, power_kw, phases, topology, grid_types, max_battery_qty) values
  ('X1-Hybrid-3.7T', 3.7,  1, 'HV', ARRAY['singlePhase_220'], 3),
  ('X1-Hybrid-5.0T', 5.0,  1, 'HV', ARRAY['singlePhase_220'], 3),
  ('X1-Hybrid-6.0T', 6.0,  1, 'HV', ARRAY['singlePhase_220'], 3),
  ('X1-Hybrid-7.5T', 7.5,  1, 'HV', ARRAY['singlePhase_220'], 3),
  ('X1-Hybrid-3.0D', 3.0,  1, 'LV', ARRAY['singlePhase_220', 'splitPhase_220'], 4),
  ('X1-Hybrid-3.7D', 3.7,  1, 'LV', ARRAY['singlePhase_220', 'splitPhase_220'], 4),
  ('X3-Hybrid-5.0D', 5.0,  3, 'LV', ARRAY['threePhase_220', 'threePhase_380'], 4),
  ('X3-Hybrid-8.0D', 8.0,  3, 'LV', ARRAY['threePhase_220', 'threePhase_380'], 4),
  ('X3-Hybrid-10.0T', 10.0, 3, 'HV', ARRAY['threePhase_220', 'threePhase_380'], 3),
  ('X3-Hybrid-12.0T', 12.0, 3, 'HV', ARRAY['threePhase_220', 'threePhase_380'], 3),
  ('X3-Hybrid-15.0T', 15.0, 3, 'HV', ARRAY['threePhase_220', 'threePhase_380'], 3);

-- ================================================================
-- Seed: Batteries
-- ================================================================
insert into batteries (model, capacity_kwh, topology) values
  ('HS36', 6.3, 'HV'),
  ('HS36B', 6.3, 'HV'),
  ('T-BAT SYS HV 11.6', 11.6, 'HV'),
  ('T-BAT SYS HV 17.4', 17.4, 'HV'),
  ('LD53', 5.3, 'LV'),
  ('T-BAT LV 5.8', 5.8, 'LV'),
  ('T-BAT LV 11.6', 11.6, 'LV');
