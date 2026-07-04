-- ── Definition tables ────────────────────────────────────────────────────────
-- Seeded from server/definitions/systemsData.js
-- Future content additions are seed operations, not code changes.

create table if not exists achievements (
  id           text    primary key,
  label        text    not null,
  description  text    not null,
  icon         text    not null default '',
  reward_pp    integer not null default 0,
  reward_items jsonb   not null default '{}'::jsonb
);

create table if not exists augmentations (
  id           text    primary key,
  label        text    not null,
  category     text    not null,
  description  text    not null,
  cost_pp      integer not null,
  stat_effects jsonb   not null default '{}'::jsonb
);

create table if not exists codex_entries (
  id       text primary key,
  category text not null,
  label    text not null,
  flavor   text not null
);

create table if not exists zones (
  id            text    primary key,
  label         text    not null,
  pp_unlock     integer not null default 0,
  display_order integer not null default 0
);

create table if not exists stat_definitions (
  id            text    primary key,
  label         text    not null,
  display_order integer not null default 0
);

-- ── Player character build ────────────────────────────────────────────────────

create table if not exists player_stats (
  player_id  text     not null references players(id) on delete cascade,
  stat_id    text     not null references stat_definitions(id),
  level      integer  not null default 1,
  exp        numeric  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (player_id, stat_id)
);

create table if not exists player_ascension (
  player_id          text    primary key references players(id) on delete cascade,
  ascension_count    integer not null default 0,
  ascension_points   integer not null default 0,
  pp_multiplier      numeric not null default 1.0,
  combat_multiplier  numeric not null default 1.0,
  gather_multiplier  numeric not null default 1.0,
  drone_multiplier   numeric not null default 1.0,
  upgrade_counts     jsonb   not null default '{}'::jsonb,
  updated_at         timestamptz not null default now()
);

-- ── Player meta-progression ───────────────────────────────────────────────────

create table if not exists player_achievements (
  player_id      text not null references players(id) on delete cascade,
  achievement_id text not null references achievements(id),
  unlocked_at    timestamptz not null default now(),
  primary key (player_id, achievement_id)
);

create table if not exists player_augmentations (
  player_id   text not null references players(id) on delete cascade,
  augment_id  text not null references augmentations(id),
  purchased_at timestamptz not null default now(),
  primary key (player_id, augment_id)
);

create table if not exists player_codex (
  player_id    text not null references players(id) on delete cascade,
  entry_id     text not null references codex_entries(id),
  discovered_at timestamptz not null default now(),
  primary key (player_id, entry_id)
);

-- ── Game statistics ───────────────────────────────────────────────────────────
-- Counters are append-only maximums — never decremented server-side.

create table if not exists player_statistics (
  player_id            text    primary key references players(id) on delete cascade,
  enemies_defeated     integer not null default 0,
  defeats              integer not null default 0,
  highest_hit          integer not null default 0,
  resources_gathered   integer not null default 0,
  mining_actions       integer not null default 0,
  total_actions        integer not null default 0,
  energy_depleted_count integer not null default 0,
  perfect_hits         integer not null default 0,
  zones_with_kills     text[]  not null default '{}',
  updated_at           timestamptz not null default now()
);

create table if not exists player_zone_visits (
  player_id       text not null references players(id) on delete cascade,
  zone_id         text not null,
  first_visited_at timestamptz not null default now(),
  visit_count     integer not null default 1,
  primary key (player_id, zone_id)
);

-- ── Equipment bag ─────────────────────────────────────────────────────────────
-- Tracks unequipped items in the equipment bag (player_equipment tracks equipped slots).

create table if not exists player_equipment_bag (
  id          bigserial primary key,
  player_id   text not null references players(id) on delete cascade,
  item_key    text not null,
  slot_type   text not null,
  acquired_at timestamptz not null default now()
);

-- ── Player preferences ────────────────────────────────────────────────────────

create table if not exists player_preferences (
  player_id          text    primary key references players(id) on delete cascade,
  autocombat_enabled boolean not null default false,
  preferences        jsonb   not null default '{}'::jsonb,
  updated_at         timestamptz not null default now()
);
