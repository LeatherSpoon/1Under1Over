create table if not exists schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists materials (
  id text primary key,
  label text not null,
  stack_limit integer not null,
  rarity text not null,
  drone_gatherable boolean not null default true
);

create table if not exists mastery_tracks (
  id text primary key,
  label text not null,
  xp_per_level integer not null
);

create table if not exists tech_nodes (
  id text primary key,
  branch text not null,
  label text not null,
  description text not null,
  cost_type text not null,
  cost_amount integer not null,
  material_costs jsonb not null default '{}'::jsonb,
  display_order integer not null,
  enabled boolean not null default true
);

create table if not exists tech_node_prerequisites (
  tech_node_id text not null references tech_nodes(id) on delete cascade,
  prerequisite_id text not null references tech_nodes(id) on delete cascade,
  primary key (tech_node_id, prerequisite_id)
);

create table if not exists recipes (
  id text primary key,
  label text not null,
  recipe_type text not null,
  output_key text not null,
  output_qty integer not null,
  category text not null references mastery_tracks(id),
  base_time numeric not null,
  min_crafting_level integer not null,
  required_tech_node text references tech_nodes(id),
  slot text,
  tier text,
  stat_bonuses jsonb not null default '{}'::jsonb,
  enabled boolean not null default true
);

create table if not exists recipe_costs (
  recipe_id text not null references recipes(id) on delete cascade,
  material_id text not null references materials(id),
  qty integer not null,
  primary key (recipe_id, material_id)
);

create table if not exists players (
  id text primary key,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists player_wallets (
  player_id text primary key references players(id) on delete cascade,
  pp numeric not null default 0,
  pp_rate numeric not null default 1,
  prestige_bonus numeric not null default 0,
  prestige_count integer not null default 0,
  steps integer not null default 0,
  state_version integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists player_inventory (
  player_id text not null references players(id) on delete cascade,
  item_key text not null,
  bucket text not null default 'inventory',
  qty integer not null default 0,
  primary key (player_id, item_key, bucket)
);

create table if not exists player_tools (
  player_id text not null references players(id) on delete cascade,
  tool_key text not null,
  created_at timestamptz not null default now(),
  primary key (player_id, tool_key)
);

create table if not exists player_equipment (
  player_id text not null references players(id) on delete cascade,
  slot text not null,
  item jsonb,
  primary key (player_id, slot)
);

create table if not exists player_crafting_jobs (
  id bigserial primary key,
  player_id text not null references players(id) on delete cascade,
  local_job_id text not null,
  recipe_id text not null references recipes(id),
  status text not null,
  started_at timestamptz not null,
  finishes_at timestamptz not null,
  consumed_inputs jsonb not null default '{}'::jsonb,
  unique (player_id, local_job_id)
);

create table if not exists player_tech_unlocks (
  player_id text not null references players(id) on delete cascade,
  tech_node_id text not null references tech_nodes(id),
  unlocked_at timestamptz not null default now(),
  primary key (player_id, tech_node_id)
);

create table if not exists player_mastery (
  player_id text not null references players(id) on delete cascade,
  track_id text not null references mastery_tracks(id),
  xp integer not null default 0,
  level integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (player_id, track_id)
);

create table if not exists player_drones (
  player_id text not null references players(id) on delete cascade,
  drone_id integer not null,
  name text not null,
  assigned_material text,
  efficiency integer not null default 1,
  gather_timer numeric not null default 0,
  primary key (player_id, drone_id)
);

create table if not exists player_transactions (
  event_id text primary key,
  player_id text not null references players(id) on delete cascade,
  transaction_type text not null,
  payload jsonb not null,
  accepted boolean not null,
  reason text,
  state_version integer,
  created_at timestamptz not null default now()
);

create table if not exists player_save_snapshots (
  id bigserial primary key,
  player_id text not null references players(id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists telemetry_sessions (
  id bigserial primary key,
  player_id text,
  session_id text not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists telemetry_events (
  id bigserial primary key,
  player_id text,
  session_id text,
  event_id text,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
