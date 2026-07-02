# PostgreSQL Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hybrid local-first PostgreSQL progression layer that stores definitions and player economy state, validates transactional economy actions, and adds starter Tech Tree and Crafting Mastery features.

**Architecture:** Keep the browser game loop local and responsive. Add a local Node API server backed by PostgreSQL, a browser sync client with a local event queue, and data-driven progression definitions. The server validates economy transactions atomically and returns reconciled player state versions while telemetry remains non-blocking.

**Tech Stack:** Plain JavaScript ES modules, Node built-in test runner, `pg` for PostgreSQL, native Node HTTP server, browser `fetch`, `localStorage`, existing Three.js frontend.

---

## File Structure

- Create `server/config.js`: reads server port, database URL, and default player profile settings from environment variables.
- Create `server/db/pool.js`: creates the PostgreSQL connection pool.
- Create `server/db/migrate.js`: runs SQL migrations from `server/db/migrations`.
- Create `server/db/seed.js`: inserts starter materials, recipes, tech nodes, mastery tracks, and default player state.
- Create `server/db/migrations/001_progression.sql`: database schema for definitions, player state, transactions, snapshots, and telemetry.
- Create `server/definitions/seedData.js`: canonical starter definitions used by tests and the seed script.
- Create `server/repositories/progressionRepository.js`: database reads/writes for bootstrap state and transaction application.
- Create `server/services/transactionService.js`: validates and applies transaction payloads through the repository.
- Create `server/server.js`: HTTP API routes for health, bootstrap, sync, transactions, snapshots, and telemetry upload.
- Create `server/start.js`: process entrypoint that starts the API server.
- Create `tests/runAll.test.js`: in-process test aggregator used because this sandbox rejects Node test runner worker spawn.
- Create `js/sync/SyncClient.js`: browser-side health checks, bootstrap loading, local queue persistence, replay, and telemetry upload.
- Create `js/systems/ProgressionDefinitions.js`: local fallback definitions and server definition normalization.
- Create `js/systems/TechTreeSystem.js`: local Tech Tree state, affordability checks, and purchase requests.
- Create `js/systems/CraftingMasterySystem.js`: local mastery XP, level calculation, and recipe category bonuses.
- Modify `js/systems/CraftingSystem.js`: consume data-driven recipes and emit sync events for craft start/complete.
- Modify `js/systems/InventorySystem.js`: expose serializable state helpers and support definition-driven material metadata.
- Modify `js/systems/DroneSystem.js`: emit sync events for assignment and upgrades.
- Modify `js/systems/SaveSystem.js`: include tech tree, mastery, sync metadata, and compatibility snapshots.
- Modify `js/TelemetrySystem.js`: track sync, transaction, tech tree, and mastery telemetry.
- Modify `js/ui/HUD.js`: add Tech Tree, Mastery, and Sync panels/indicators.
- Modify `js/main.js`: wire the new systems and sync client into boot and game events.
- Modify `index.html`: add panel containers and buttons for Tech Tree, Mastery, and sync status.
- Modify `package.json`: add server scripts and dependencies.
- Create backend tests under `tests/server`.
- Create frontend sync/progression tests under `tests/sync` and `tests/systems`.

This workspace is not currently a git repository. Commit steps are intentionally omitted. If the workspace is initialized as git before execution, commit at the end of each task with a focused message.

---

### Task 1: Package Scripts And Backend Skeleton

**Files:**
- Modify: `package.json`
- Create: `server/config.js`
- Create: `server/server.js`
- Create: `server/start.js`
- Create: `tests/runAll.test.js`
- Test: `tests/server/health.test.js`

- [ ] **Step 1: Replace the package scripts and add dependencies**

Update `package.json` to:

```json
{
  "type": "module",
  "scripts": {
    "test": "node tests/runAll.test.js",
    "server": "node server/start.js",
    "db:migrate": "node server/db/migrate.js",
    "db:seed": "node server/db/seed.js"
  },
  "dependencies": {
    "pg": "^8.13.1"
  }
}
```

- [ ] **Step 2: Install package dependencies**

Run: `npm.cmd install`

Expected: `node_modules` is created and `package-lock.json` records `pg`.

- [ ] **Step 3: Add the in-process test aggregator**

Create `tests/runAll.test.js`:

```js
import './touchInput.test.js';
import './server/health.test.js';
```

- [ ] **Step 4: Write the failing health route test**

Create `tests/server/health.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiServer } from '../../server/server.js';

test('GET /api/health returns backend and database status', async () => {
  const server = createApiServer({
    db: {
      async health() {
        return { ok: true };
      }
    }
  });

  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      database: true,
      mode: 'hybrid-local-first'
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
```

- [ ] **Step 5: Run the test and verify it fails**

Run: `npm.cmd test`

Expected: FAIL with an import error for `server/server.js`.

- [ ] **Step 6: Add backend config**

Create `server/config.js`:

```js
export function readConfig(env = process.env) {
  return {
    port: Number(env.PORT || 3000),
    databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/processing_power',
    defaultPlayerId: env.DEFAULT_PLAYER_ID || 'local-player',
    defaultPlayerName: env.DEFAULT_PLAYER_NAME || 'Local Player'
  };
}
```

- [ ] **Step 7: Add the API server skeleton**

Create `server/server.js`:

```js
import http from 'node:http';

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(body);
}

export function createApiServer({ db, transactionService, telemetryService } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/health') {
        const database = db ? await db.health() : { ok: false };
        sendJson(res, 200, {
          ok: true,
          database: !!database.ok,
          mode: 'hybrid-local-first'
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
        const playerId = url.searchParams.get('playerId') || 'local-player';
        const state = await db.getBootstrap(playerId);
        sendJson(res, 200, state);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/transactions') {
        const tx = await readJson(req);
        const result = await transactionService.applyOne(tx);
        sendJson(res, result.ok ? 200 : 409, result);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/sync') {
        const body = await readJson(req);
        const result = await transactionService.applyBatch(body.playerId, body.transactions || []);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/save-snapshot') {
        const snapshot = await readJson(req);
        const result = await db.saveSnapshot(snapshot);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/save-snapshot/')) {
        const playerId = decodeURIComponent(url.pathname.split('/').pop());
        const snapshot = await db.getLatestSnapshot(playerId);
        sendJson(res, snapshot ? 200 : 404, snapshot || { ok: false, reason: 'not_found' });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/telemetry/sessions') {
        const report = await readJson(req);
        const result = await telemetryService.saveSession(report);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/telemetry/events') {
        const event = await readJson(req);
        const result = await telemetryService.saveEvent(event);
        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 404, { ok: false, reason: 'not_found' });
    } catch (error) {
      sendJson(res, 500, { ok: false, reason: 'server_error', message: error.message });
    }
  });
}
```

- [ ] **Step 8: Add the server process entrypoint**

Create `server/start.js`:

```js
import { readConfig } from './config.js';
import { createApiServer } from './server.js';
import { createProgressionRepository } from './repositories/progressionRepository.js';
import { createTransactionService } from './services/transactionService.js';

const config = readConfig();
const db = createProgressionRepository(config);
const transactionService = createTransactionService(db);
const telemetryService = {
  saveSession: report => db.saveTelemetrySession(report),
  saveEvent: event => db.saveTelemetryEvent(event)
};

const server = createApiServer({ db, transactionService, telemetryService });

server.listen(config.port, () => {
  console.log(`Processing Power API listening on http://localhost:${config.port}`);
});
```

- [ ] **Step 9: Run the health test and verify it passes**

Run: `npm.cmd test`

Expected: PASS for `GET /api/health returns backend and database status`.

---

### Task 2: PostgreSQL Schema And Seed Data

**Files:**
- Create: `server/db/pool.js`
- Create: `server/db/migrate.js`
- Create: `server/db/seed.js`
- Create: `server/db/migrations/001_progression.sql`
- Create: `server/definitions/seedData.js`
- Test: `tests/server/seedData.test.js`

- [ ] **Step 1: Write seed data tests**

Create `tests/server/seedData.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MATERIALS,
  MASTERY_TRACKS,
  RECIPES,
  TECH_NODES
} from '../../server/definitions/seedData.js';

test('starter definitions include current materials and progression tracks', () => {
  assert.ok(MATERIALS.some(m => m.id === 'copper'));
  assert.ok(MATERIALS.some(m => m.id === 'timber'));
  assert.ok(MATERIALS.some(m => m.id === 'logicChip'));
  assert.deepEqual(MASTERY_TRACKS.map(t => t.id), ['survival', 'tooling', 'combat', 'energy']);
});

test('starter recipes are categorized for mastery', () => {
  const ration = RECIPES.find(r => r.id === 'ration');
  const terrainCutter = RECIPES.find(r => r.id === 'terrainCutter');
  const basicBlade = RECIPES.find(r => r.id === 'basicBlade');

  assert.equal(ration.category, 'survival');
  assert.equal(terrainCutter.category, 'tooling');
  assert.equal(basicBlade.category, 'combat');
  assert.deepEqual(ration.costs, { timber: 2, fiber: 1 });
});

test('tech tree starts with four branches', () => {
  assert.deepEqual(
    TECH_NODES.map(n => n.id),
    ['fieldFabrication', 'droneLogistics', 'terrainControl', 'biomeAccess']
  );
});
```

- [ ] **Step 2: Run the seed data tests and verify they fail**

Run: `npm test`

Expected: FAIL with an import error for `server/definitions/seedData.js`.

- [ ] **Step 3: Add canonical seed definitions**

Create `server/definitions/seedData.js`:

```js
export const MATERIALS = [
  'copper', 'timber', 'stone', 'iron', 'carbon', 'quartz', 'silica',
  'fiber', 'silver', 'gold', 'titanium', 'tungsten', 'resin', 'epoxy',
  'elastomer', 'magnet', 'glass', 'lumber', 'seed',
  'circuitWire', 'ironSpike', 'powerCore', 'armorPlate', 'burstCapacitor', 'logicChip'
].map(id => ({
  id,
  label: id.replace(/[A-Z]/g, m => ` ${m}`).replace(/^./, c => c.toUpperCase()),
  stackLimit: 99,
  rarity: ['gold', 'silver', 'titanium', 'tungsten', 'powerCore', 'logicChip'].includes(id) ? 'rare' : 'common',
  droneGatherable: !['seed', 'lumber'].includes(id)
}));

export const MASTERY_TRACKS = [
  { id: 'survival', label: 'Survival Fabrication', xpPerLevel: 100 },
  { id: 'tooling', label: 'Tooling Mastery', xpPerLevel: 120 },
  { id: 'combat', label: 'Combat Engineering', xpPerLevel: 140 },
  { id: 'energy', label: 'Energy Systems', xpPerLevel: 120 }
];

export const RECIPES = [
  { id: 'ration', label: 'Ration', type: 'consumable', outputKey: 'ration', outputQty: 1, category: 'survival', baseTime: 3, minCraftingLevel: 1, requiredTechNode: null, costs: { timber: 2, fiber: 1 } },
  { id: 'ironPatch', label: 'Iron Patch', type: 'consumable', outputKey: 'ironPatch', outputQty: 1, category: 'survival', baseTime: 4, minCraftingLevel: 1, requiredTechNode: null, costs: { iron: 2 } },
  { id: 'signalFlare', label: 'Signal Flare', type: 'consumable', outputKey: 'signalFlare', outputQty: 1, category: 'energy', baseTime: 4, minCraftingLevel: 1, requiredTechNode: null, costs: { carbon: 1, quartz: 1 } },
  { id: 'firstAid', label: 'First Aid', type: 'consumable', outputKey: 'firstAid', outputQty: 1, category: 'survival', baseTime: 5, minCraftingLevel: 2, requiredTechNode: 'fieldFabrication', costs: { copper: 2, fiber: 2 } },
  { id: 'repairKit', label: 'Repair Kit', type: 'consumable', outputKey: 'repairKit', outputQty: 1, category: 'survival', baseTime: 8, minCraftingLevel: 4, requiredTechNode: 'fieldFabrication', costs: { iron: 3, copper: 2, resin: 1 } },
  { id: 'antidote', label: 'Antidote', type: 'consumable', outputKey: 'antidote', outputQty: 1, category: 'survival', baseTime: 6, minCraftingLevel: 3, requiredTechNode: 'fieldFabrication', costs: { fiber: 3, quartz: 1 } },
  { id: 'terrainCutter', label: 'Terrain Cutter', type: 'tool', outputKey: 'terrainCutter', outputQty: 1, category: 'tooling', baseTime: 8, minCraftingLevel: 2, requiredTechNode: 'terrainControl', costs: { copper: 3, iron: 2, carbon: 1 } },
  { id: 'basicBlade', label: 'Basic Blade', type: 'equipment', outputKey: 'basicBlade', outputQty: 1, category: 'combat', baseTime: 10, minCraftingLevel: 2, requiredTechNode: null, slot: 'weapon', tier: 'Basic', statBonuses: { strength: 2 }, costs: { iron: 4, timber: 2 } },
  { id: 'basicShield', label: 'Basic Shield', type: 'equipment', outputKey: 'basicShield', outputQty: 1, category: 'combat', baseTime: 10, minCraftingLevel: 2, requiredTechNode: null, slot: 'offhand', tier: 'Basic', statBonuses: { defense: 2 }, costs: { iron: 3, timber: 3 } },
  { id: 'basicArmor', label: 'Basic Armor', type: 'equipment', outputKey: 'basicArmor', outputQty: 1, category: 'combat', baseTime: 12, minCraftingLevel: 3, requiredTechNode: null, slot: 'body', tier: 'Basic', statBonuses: { defense: 3, health: 1 }, costs: { iron: 5, fiber: 3 } },
  { id: 'copperRing', label: 'Copper Ring', type: 'equipment', outputKey: 'copperRing', outputQty: 1, category: 'energy', baseTime: 6, minCraftingLevel: 1, requiredTechNode: null, slot: 'accessory', tier: 'Basic', statBonuses: { focusRate: 1 }, costs: { copper: 4 } },
  { id: 'energyCell', label: 'Energy Cell', type: 'consumable', outputKey: 'energyCell', outputQty: 1, category: 'energy', baseTime: 5, minCraftingLevel: 1, requiredTechNode: null, costs: { copper: 2, quartz: 1 } },
  { id: 'storageContainer', label: 'Storage Container', type: 'tool', outputKey: 'storageContainer', outputQty: 1, category: 'tooling', baseTime: 25, minCraftingLevel: 2, requiredTechNode: 'fieldFabrication', costs: { iron: 6, timber: 4, stone: 3, copper: 3, resin: 2 } }
];

export const TECH_NODES = [
  { id: 'fieldFabrication', branch: 'fabrication', label: 'Field Fabrication', description: 'Unlocks advanced survival recipes and storage fabrication.', costType: 'pp', costAmount: 150, displayOrder: 1, prerequisites: [] },
  { id: 'droneLogistics', branch: 'drones', label: 'Drone Logistics', description: 'Unlocks broader drone assignment support.', costType: 'pp', costAmount: 250, displayOrder: 2, prerequisites: [] },
  { id: 'terrainControl', branch: 'tools', label: 'Terrain Control', description: 'Unlocks terrain manipulation tooling.', costType: 'materials', costAmount: 1, materialCosts: { copper: 3, iron: 2 }, displayOrder: 3, prerequisites: ['fieldFabrication'] },
  { id: 'biomeAccess', branch: 'exploration', label: 'Biome Access', description: 'Centralizes biome access progression.', costType: 'steps', costAmount: 1000, displayOrder: 4, prerequisites: [] }
];
```

- [ ] **Step 4: Add the migration SQL**

Create `server/db/migrations/001_progression.sql`:

```sql
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
```

- [ ] **Step 5: Add the database pool**

Create `server/db/pool.js`:

```js
import pg from 'pg';

const { Pool } = pg;

export function createPool(databaseUrl) {
  return new Pool({ connectionString: databaseUrl });
}
```

- [ ] **Step 6: Add the migration runner**

Create `server/db/migrate.js`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../config.js';
import { createPool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(pool) {
  const dir = path.join(__dirname, 'migrations');
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    const applied = await pool.query('select 1 from schema_migrations where id = $1', [id]).catch(() => ({ rowCount: 0 }));
    if (applied.rowCount > 0) continue;

    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    await pool.query('begin');
    try {
      await pool.query(sql);
      await pool.query('insert into schema_migrations (id) values ($1) on conflict do nothing', [id]);
      await pool.query('commit');
      console.log(`Applied migration ${id}`);
    } catch (error) {
      await pool.query('rollback');
      throw error;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = readConfig();
  const pool = createPool(config.databaseUrl);
  runMigrations(pool).finally(() => pool.end());
}
```

- [ ] **Step 7: Add the seed runner**

Create `server/db/seed.js`:

```js
import { readConfig } from '../config.js';
import { createPool } from './pool.js';
import { MATERIALS, MASTERY_TRACKS, RECIPES, TECH_NODES } from '../definitions/seedData.js';

export async function seedDefinitions(pool, config = readConfig()) {
  for (const mat of MATERIALS) {
    await pool.query(
      `insert into materials (id, label, stack_limit, rarity, drone_gatherable)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do update set
         label = excluded.label,
         stack_limit = excluded.stack_limit,
         rarity = excluded.rarity,
         drone_gatherable = excluded.drone_gatherable`,
      [mat.id, mat.label, mat.stackLimit, mat.rarity, mat.droneGatherable]
    );
  }

  for (const track of MASTERY_TRACKS) {
    await pool.query(
      `insert into mastery_tracks (id, label, xp_per_level)
       values ($1, $2, $3)
       on conflict (id) do update set label = excluded.label, xp_per_level = excluded.xp_per_level`,
      [track.id, track.label, track.xpPerLevel]
    );
  }

  for (const node of TECH_NODES) {
    await pool.query(
      `insert into tech_nodes (id, branch, label, description, cost_type, cost_amount, material_costs, display_order)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       on conflict (id) do update set
         branch = excluded.branch,
         label = excluded.label,
         description = excluded.description,
         cost_type = excluded.cost_type,
         cost_amount = excluded.cost_amount,
         material_costs = excluded.material_costs,
         display_order = excluded.display_order`,
      [node.id, node.branch, node.label, node.description, node.costType, node.costAmount, JSON.stringify(node.materialCosts || {}), node.displayOrder]
    );

    await pool.query('delete from tech_node_prerequisites where tech_node_id = $1', [node.id]);
    for (const prerequisite of node.prerequisites) {
      await pool.query(
        `insert into tech_node_prerequisites (tech_node_id, prerequisite_id)
         values ($1, $2)
         on conflict do nothing`,
        [node.id, prerequisite]
      );
    }
  }

  for (const recipe of RECIPES) {
    await pool.query(
      `insert into recipes
        (id, label, recipe_type, output_key, output_qty, category, base_time, min_crafting_level, required_tech_node, slot, tier, stat_bonuses)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
       on conflict (id) do update set
         label = excluded.label,
         recipe_type = excluded.recipe_type,
         output_key = excluded.output_key,
         output_qty = excluded.output_qty,
         category = excluded.category,
         base_time = excluded.base_time,
         min_crafting_level = excluded.min_crafting_level,
         required_tech_node = excluded.required_tech_node,
         slot = excluded.slot,
         tier = excluded.tier,
         stat_bonuses = excluded.stat_bonuses`,
      [
        recipe.id, recipe.label, recipe.type, recipe.outputKey, recipe.outputQty,
        recipe.category, recipe.baseTime, recipe.minCraftingLevel, recipe.requiredTechNode,
        recipe.slot || null, recipe.tier || null, JSON.stringify(recipe.statBonuses || {})
      ]
    );

    await pool.query('delete from recipe_costs where recipe_id = $1', [recipe.id]);
    for (const [materialId, qty] of Object.entries(recipe.costs)) {
      await pool.query(
        `insert into recipe_costs (recipe_id, material_id, qty)
         values ($1, $2, $3)
         on conflict (recipe_id, material_id) do update set qty = excluded.qty`,
        [recipe.id, materialId, qty]
      );
    }
  }

  await pool.query(
    `insert into players (id, display_name)
     values ($1, $2)
     on conflict (id) do nothing`,
    [config.defaultPlayerId, config.defaultPlayerName]
  );

  await pool.query(
    `insert into player_wallets (player_id, pp, pp_rate, steps, state_version)
     values ($1, 0, 1, 0, 0)
     on conflict (player_id) do nothing`,
    [config.defaultPlayerId]
  );

  await pool.query(
    `insert into player_inventory (player_id, item_key, bucket, qty)
     values ($1, 'ration', 'consumable', 3), ($1, 'energyCell', 'consumable', 3)
     on conflict (player_id, item_key, bucket) do nothing`,
    [config.defaultPlayerId]
  );

  await pool.query(
    `insert into player_drones (player_id, drone_id, name, assigned_material, efficiency, gather_timer)
     values ($1, 1, 'Drone Alpha', null, 1, 0)
     on conflict (player_id, drone_id) do nothing`,
    [config.defaultPlayerId]
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = readConfig();
  const pool = createPool(config.databaseUrl);
  seedDefinitions(pool, config).finally(() => pool.end());
}
```

- [ ] **Step 8: Run tests and verify seed data passes**

Run: `npm test`

Expected: PASS for seed data tests and health test.

---

### Task 3: Repository Bootstrap Reads

**Files:**
- Create: `server/repositories/progressionRepository.js`
- Test: `tests/server/progressionRepository.test.js`

- [ ] **Step 1: Write repository tests with a fake query client**

Create `tests/server/progressionRepository.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProgressionRepositoryFromPool } from '../../server/repositories/progressionRepository.js';

function fakePool(rowsBySql) {
  return {
    queries: [],
    async query(sql, params = []) {
      this.queries.push({ sql, params });
      const key = Object.keys(rowsBySql).find(k => sql.includes(k));
      return { rows: key ? rowsBySql[key] : [], rowCount: key ? rowsBySql[key].length : 0 };
    }
  };
}

test('getBootstrap returns definitions and player state', async () => {
  const pool = fakePool({
    'from materials': [{ id: 'copper', label: 'Copper', stack_limit: 99, rarity: 'common', drone_gatherable: true }],
    'from mastery_tracks': [{ id: 'survival', label: 'Survival Fabrication', xp_per_level: 100 }],
    'from tech_nodes': [{ id: 'fieldFabrication', branch: 'fabrication', label: 'Field Fabrication', description: 'Unlocks recipes', cost_type: 'pp', cost_amount: 150, material_costs: {}, display_order: 1 }],
    'from tech_node_prerequisites': [],
    'from recipes': [{ id: 'ration', label: 'Ration', recipe_type: 'consumable', output_key: 'ration', output_qty: 1, category: 'survival', base_time: '3', min_crafting_level: 1, required_tech_node: null, slot: null, tier: null, stat_bonuses: {} }],
    'from recipe_costs': [{ recipe_id: 'ration', material_id: 'copper', qty: 1 }],
    'from player_wallets': [{ player_id: 'local-player', pp: '25', pp_rate: '1', prestige_bonus: '0', prestige_count: 0, steps: 10, state_version: 2 }],
    'from player_inventory': [{ item_key: 'copper', bucket: 'inventory', qty: 4 }],
    'from player_tools': [],
    'from player_tech_unlocks': [],
    'from player_mastery': [{ track_id: 'survival', xp: 20, level: 1 }],
    'from player_drones': [{ drone_id: 1, name: 'Drone Alpha', assigned_material: null, efficiency: 1, gather_timer: '0' }],
    'from player_crafting_jobs': []
  });
  const repo = createProgressionRepositoryFromPool(pool);

  const bootstrap = await repo.getBootstrap('local-player');

  assert.equal(bootstrap.definitions.materials[0].id, 'copper');
  assert.equal(bootstrap.definitions.recipes[0].costs.copper, 1);
  assert.equal(bootstrap.player.wallet.pp, 25);
  assert.equal(bootstrap.player.inventory.inventory.copper, 4);
  assert.equal(bootstrap.player.version, 2);
});
```

- [ ] **Step 2: Run the repository test and verify it fails**

Run: `npm test`

Expected: FAIL with an import error for `progressionRepository.js`.

- [ ] **Step 3: Implement the repository bootstrap reads**

Create `server/repositories/progressionRepository.js`:

```js
import { readConfig } from '../config.js';
import { createPool } from '../db/pool.js';

function number(value) {
  return Number(value || 0);
}

function groupInventory(rows) {
  const buckets = {};
  for (const row of rows) {
    buckets[row.bucket] ||= {};
    buckets[row.bucket][row.item_key] = row.qty;
  }
  return buckets;
}

function attachRecipeCosts(recipes, costs) {
  const byRecipe = new Map(recipes.map(r => [r.id, { ...r, costs: {} }]));
  for (const cost of costs) {
    const recipe = byRecipe.get(cost.recipe_id);
    if (recipe) recipe.costs[cost.material_id] = cost.qty;
  }
  return [...byRecipe.values()];
}

export function createProgressionRepository(config = readConfig()) {
  return createProgressionRepositoryFromPool(createPool(config.databaseUrl), config);
}

export function createProgressionRepositoryFromPool(pool, config = readConfig()) {
  return {
    async health() {
      await pool.query('select 1');
      return { ok: true };
    },

    async getBootstrap(playerId = config.defaultPlayerId) {
      const [
        materials,
        masteryTracks,
        techNodes,
        prerequisites,
        recipes,
        recipeCosts,
        wallet,
        inventory,
        tools,
        techUnlocks,
        mastery,
        drones,
        jobs
      ] = await Promise.all([
        pool.query('select * from materials order by id'),
        pool.query('select * from mastery_tracks order by id'),
        pool.query('select * from tech_nodes where enabled = true order by display_order'),
        pool.query('select * from tech_node_prerequisites order by tech_node_id, prerequisite_id'),
        pool.query('select * from recipes where enabled = true order by id'),
        pool.query('select * from recipe_costs order by recipe_id, material_id'),
        pool.query('select * from player_wallets where player_id = $1', [playerId]),
        pool.query('select * from player_inventory where player_id = $1', [playerId]),
        pool.query('select * from player_tools where player_id = $1', [playerId]),
        pool.query('select * from player_tech_unlocks where player_id = $1', [playerId]),
        pool.query('select * from player_mastery where player_id = $1', [playerId]),
        pool.query('select * from player_drones where player_id = $1 order by drone_id', [playerId]),
        pool.query('select * from player_crafting_jobs where player_id = $1 and status in ($2, $3) order by id', [playerId, 'active', 'queued'])
      ]);

      const recipeDefs = attachRecipeCosts(recipes.rows.map(r => ({
        id: r.id,
        label: r.label,
        type: r.recipe_type,
        outputKey: r.output_key,
        outputQty: r.output_qty,
        category: r.category,
        baseTime: number(r.base_time),
        minCraftingLevel: r.min_crafting_level,
        requiredTechNode: r.required_tech_node,
        slot: r.slot,
        tier: r.tier,
        statBonuses: r.stat_bonuses || {}
      })), recipeCosts.rows);

      const walletRow = wallet.rows[0] || {
        pp: 0,
        pp_rate: 1,
        prestige_bonus: 0,
        prestige_count: 0,
        steps: 0,
        state_version: 0
      };

      return {
        definitions: {
          version: 'starter-1',
          materials: materials.rows.map(r => ({ id: r.id, label: r.label, stackLimit: r.stack_limit, rarity: r.rarity, droneGatherable: r.drone_gatherable })),
          masteryTracks: masteryTracks.rows.map(r => ({ id: r.id, label: r.label, xpPerLevel: r.xp_per_level })),
          techNodes: techNodes.rows.map(r => ({
            id: r.id,
            branch: r.branch,
            label: r.label,
            description: r.description,
            costType: r.cost_type,
            costAmount: r.cost_amount,
            materialCosts: r.material_costs || {},
            displayOrder: r.display_order,
            prerequisites: prerequisites.rows.filter(p => p.tech_node_id === r.id).map(p => p.prerequisite_id)
          })),
          recipes: recipeDefs
        },
        player: {
          id: playerId,
          version: walletRow.state_version,
          wallet: {
            pp: number(walletRow.pp),
            ppRate: number(walletRow.pp_rate),
            prestigeBonus: number(walletRow.prestige_bonus),
            prestigeCount: walletRow.prestige_count,
            steps: walletRow.steps
          },
          inventory: groupInventory(inventory.rows),
          tools: tools.rows.map(r => r.tool_key),
          techUnlocks: techUnlocks.rows.map(r => r.tech_node_id),
          mastery: mastery.rows.map(r => ({ trackId: r.track_id, xp: r.xp, level: r.level })),
          drones: drones.rows.map(r => ({ id: r.drone_id, name: r.name, assignedMaterial: r.assigned_material, efficiency: r.efficiency, gatherTimer: number(r.gather_timer) })),
          craftingJobs: jobs.rows.map(r => ({ id: r.local_job_id, recipeId: r.recipe_id, status: r.status, startedAt: r.started_at, finishesAt: r.finishes_at }))
        }
      };
    },

    async saveSnapshot(snapshot) {
      await pool.query(
        'insert into player_save_snapshots (player_id, snapshot) values ($1, $2::jsonb)',
        [snapshot.playerId, JSON.stringify(snapshot)]
      );
      return { ok: true };
    },

    async getLatestSnapshot(playerId) {
      const result = await pool.query(
        'select snapshot from player_save_snapshots where player_id = $1 order by created_at desc limit 1',
        [playerId]
      );
      return result.rows[0]?.snapshot || null;
    },

    async saveTelemetrySession(report) {
      await pool.query(
        'insert into telemetry_sessions (player_id, session_id, report) values ($1, $2, $3::jsonb)',
        [report.playerId || null, report.meta?.sessionId || report.session?.sessionId || 'unknown', JSON.stringify(report)]
      );
      return { ok: true };
    },

    async saveTelemetryEvent(event) {
      await pool.query(
        'insert into telemetry_events (player_id, session_id, event_id, event_type, payload) values ($1, $2, $3, $4, $5::jsonb)',
        [event.playerId || null, event.sessionId || null, event.eventId || null, event.type, JSON.stringify(event.payload || {})]
      );
      return { ok: true };
    },

    pool
  };
}
```

- [ ] **Step 4: Run tests and verify repository bootstrap passes**

Run: `npm test`

Expected: PASS for health, seed data, and repository bootstrap tests.

---

### Task 4: Transaction Service

**Files:**
- Create: `server/services/transactionService.js`
- Test: `tests/server/transactionService.test.js`
- Modify: `server/repositories/progressionRepository.js`

- [ ] **Step 1: Write transaction service tests**

Create `tests/server/transactionService.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTransactionService } from '../../server/services/transactionService.js';

function fakeRepo() {
  const accepted = new Set();
  return {
    state: {
      version: 0,
      inventory: { inventory: { copper: 5, iron: 3, timber: 2 }, consumable: {} },
      techUnlocks: [],
      mastery: [],
      wallet: { pp: 200, steps: 1200 }
    },
    definitions: {
      recipes: [
        { id: 'ration', type: 'consumable', outputKey: 'ration', outputQty: 1, category: 'survival', baseTime: 3, minCraftingLevel: 1, requiredTechNode: null, costs: { timber: 2 } }
      ],
      techNodes: [
        { id: 'fieldFabrication', costType: 'pp', costAmount: 150, materialCosts: {}, prerequisites: [] }
      ],
      masteryTracks: [{ id: 'survival', xpPerLevel: 100 }]
    },
    async hasAcceptedEvent(eventId) {
      return accepted.has(eventId);
    },
    async getTransactionContext() {
      return this;
    },
    async recordAccepted(event, result) {
      accepted.add(event.eventId);
      this.state.version = result.version;
    },
    async recordRejected() {},
    async applyInventoryDelta(playerId, itemKey, bucket, delta) {
      this.state.inventory[bucket] ||= {};
      this.state.inventory[bucket][itemKey] = (this.state.inventory[bucket][itemKey] || 0) + delta;
    },
    async updateWalletDelta(playerId, delta) {
      this.state.wallet.pp += delta.pp || 0;
      this.state.wallet.steps += delta.steps || 0;
    },
    async insertCraftingJob() {},
    async completeCraftingJob() {},
    async unlockTech(playerId, techNodeId) {
      this.state.techUnlocks.push(techNodeId);
    },
    async awardMastery(playerId, trackId, xp) {
      const existing = this.state.mastery.find(m => m.trackId === trackId);
      if (existing) existing.xp += xp;
      else this.state.mastery.push({ trackId, xp, level: 1 });
    },
    async getBootstrap(playerId) {
      return { player: { id: playerId, version: this.state.version, ...this.state }, definitions: this.definitions };
    }
  };
}

test('crafting.start consumes materials and accepts event', async () => {
  const repo = fakeRepo();
  const service = createTransactionService(repo);

  const result = await service.applyOne({
    eventId: 'evt-1',
    playerId: 'local-player',
    type: 'crafting.start',
    expectedVersion: 0,
    payload: { localJobId: 'job-1', recipeId: 'ration', startedAt: '2026-04-19T00:00:00.000Z' }
  });

  assert.equal(result.ok, true);
  assert.equal(repo.state.inventory.inventory.timber, 0);
  assert.equal(result.version, 1);
});

test('duplicate event is idempotent', async () => {
  const repo = fakeRepo();
  const service = createTransactionService(repo);
  const event = {
    eventId: 'evt-duplicate',
    playerId: 'local-player',
    type: 'tech.purchase',
    expectedVersion: 0,
    payload: { techNodeId: 'fieldFabrication' }
  };

  const first = await service.applyOne(event);
  const second = await service.applyOne(event);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(repo.state.wallet.pp, 50);
});

test('locked or unaffordable actions are rejected', async () => {
  const repo = fakeRepo();
  repo.state.inventory.inventory.timber = 1;
  const service = createTransactionService(repo);

  const result = await service.applyOne({
    eventId: 'evt-reject',
    playerId: 'local-player',
    type: 'crafting.start',
    expectedVersion: 0,
    payload: { localJobId: 'job-1', recipeId: 'ration', startedAt: '2026-04-19T00:00:00.000Z' }
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient_materials');
});
```

- [ ] **Step 2: Run transaction service tests and verify they fail**

Run: `npm test`

Expected: FAIL with an import error for `transactionService.js`.

- [ ] **Step 3: Implement transaction validation and application**

Create `server/services/transactionService.js`:

```js
function hasMaterials(inventory, costs) {
  const bucket = inventory.inventory || {};
  return Object.entries(costs).every(([key, qty]) => (bucket[key] || 0) >= qty);
}

function masteryLevelForXp(xp, xpPerLevel) {
  return 1 + Math.floor(xp / xpPerLevel);
}

function requireEvent(event) {
  if (!event || !event.eventId || !event.playerId || !event.type) {
    return { ok: false, reason: 'malformed_payload' };
  }
  return null;
}

export function createTransactionService(repo) {
  async function applyOne(event) {
    const malformed = requireEvent(event);
    if (malformed) return malformed;

    if (await repo.hasAcceptedEvent(event.eventId)) {
      const bootstrap = await repo.getBootstrap(event.playerId);
      return { ok: true, duplicate: true, version: bootstrap.player.version, player: bootstrap.player };
    }

    const ctx = await repo.getTransactionContext(event.playerId);
    const currentVersion = ctx.state.version || 0;
    if (event.expectedVersion !== undefined && event.expectedVersion < currentVersion - 25) {
      await repo.recordRejected(event, 'stale_version');
      return { ok: false, reason: 'stale_version', version: currentVersion };
    }

    let result;
    switch (event.type) {
      case 'inventory.addMaterial':
        result = await applyInventoryAdd(repo, ctx, event);
        break;
      case 'crafting.start':
        result = await applyCraftingStart(repo, ctx, event);
        break;
      case 'crafting.complete':
        result = await applyCraftingComplete(repo, ctx, event);
        break;
      case 'tech.purchase':
        result = await applyTechPurchase(repo, ctx, event);
        break;
      case 'mastery.awardCraftXp':
        result = await applyMasteryAward(repo, ctx, event);
        break;
      case 'drone.assign':
      case 'drone.upgrade':
      case 'offline.applyGains':
      case 'snapshot.save':
        result = { ok: true };
        break;
      default:
        result = { ok: false, reason: 'unknown_transaction_type' };
    }

    if (!result.ok) {
      await repo.recordRejected(event, result.reason);
      return result;
    }

    const version = currentVersion + 1;
    await repo.recordAccepted(event, { version });
    const bootstrap = await repo.getBootstrap(event.playerId);
    return { ok: true, version, player: bootstrap.player };
  }

  async function applyBatch(playerId, transactions) {
    const results = [];
    for (const tx of transactions) {
      results.push(await applyOne({ ...tx, playerId: tx.playerId || playerId }));
    }
    const bootstrap = await repo.getBootstrap(playerId);
    return { ok: true, results, player: bootstrap.player };
  }

  return { applyOne, applyBatch };
}

async function applyInventoryAdd(repo, _ctx, event) {
  const { itemKey, bucket = 'inventory', qty } = event.payload || {};
  if (!itemKey || !Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'malformed_payload' };
  await repo.applyInventoryDelta(event.playerId, itemKey, bucket, qty);
  return { ok: true };
}

async function applyCraftingStart(repo, ctx, event) {
  const { localJobId, recipeId, startedAt } = event.payload || {};
  const recipe = ctx.definitions.recipes.find(r => r.id === recipeId);
  if (!localJobId || !recipe || !startedAt) return { ok: false, reason: 'malformed_payload' };
  if (recipe.requiredTechNode && !ctx.state.techUnlocks.includes(recipe.requiredTechNode)) return { ok: false, reason: 'locked_recipe' };
  if (!hasMaterials(ctx.state.inventory, recipe.costs)) return { ok: false, reason: 'insufficient_materials' };

  for (const [materialId, qty] of Object.entries(recipe.costs)) {
    await repo.applyInventoryDelta(event.playerId, materialId, 'inventory', -qty);
  }
  const start = new Date(startedAt);
  const finish = new Date(start.getTime() + recipe.baseTime * 1000);
  await repo.insertCraftingJob(event.playerId, localJobId, recipeId, start, finish, recipe.costs);
  return { ok: true };
}

async function applyCraftingComplete(repo, ctx, event) {
  const { localJobId, recipeId } = event.payload || {};
  const recipe = ctx.definitions.recipes.find(r => r.id === recipeId);
  if (!localJobId || !recipe) return { ok: false, reason: 'malformed_payload' };

  const bucket = recipe.type === 'consumable' ? 'consumable' : recipe.type === 'tool' ? 'tool' : 'equipment';
  await repo.applyInventoryDelta(event.playerId, recipe.outputKey, bucket, recipe.outputQty || 1);
  await repo.completeCraftingJob(event.playerId, localJobId);
  await repo.awardMastery(event.playerId, recipe.category, 25);
  return { ok: true };
}

async function applyTechPurchase(repo, ctx, event) {
  const { techNodeId } = event.payload || {};
  const node = ctx.definitions.techNodes.find(n => n.id === techNodeId);
  if (!node) return { ok: false, reason: 'malformed_payload' };
  if (ctx.state.techUnlocks.includes(techNodeId)) return { ok: true };
  if (!node.prerequisites.every(id => ctx.state.techUnlocks.includes(id))) return { ok: false, reason: 'unmet_prerequisite' };

  if (node.costType === 'pp') {
    if (ctx.state.wallet.pp < node.costAmount) return { ok: false, reason: 'insufficient_pp' };
    await repo.updateWalletDelta(event.playerId, { pp: -node.costAmount });
  } else if (node.costType === 'steps') {
    if (ctx.state.wallet.steps < node.costAmount) return { ok: false, reason: 'insufficient_steps' };
    await repo.updateWalletDelta(event.playerId, { steps: -node.costAmount });
  } else if (node.costType === 'materials') {
    if (!hasMaterials(ctx.state.inventory, node.materialCosts || {})) return { ok: false, reason: 'insufficient_materials' };
    for (const [materialId, qty] of Object.entries(node.materialCosts || {})) {
      await repo.applyInventoryDelta(event.playerId, materialId, 'inventory', -qty);
    }
  }

  await repo.unlockTech(event.playerId, techNodeId);
  return { ok: true };
}

async function applyMasteryAward(repo, ctx, event) {
  const { trackId, xp } = event.payload || {};
  const track = ctx.definitions.masteryTracks.find(t => t.id === trackId);
  if (!track || !Number.isFinite(xp) || xp <= 0) return { ok: false, reason: 'malformed_payload' };
  await repo.awardMastery(event.playerId, trackId, xp, masteryLevelForXp);
  return { ok: true };
}
```

- [ ] **Step 4: Add repository transaction methods**

Append these methods inside the object returned by `createProgressionRepositoryFromPool`:

```js
async hasAcceptedEvent(eventId) {
  const result = await pool.query('select 1 from player_transactions where event_id = $1 and accepted = true', [eventId]);
  return result.rowCount > 0;
},

async getTransactionContext(playerId) {
  const bootstrap = await this.getBootstrap(playerId);
  return {
    definitions: bootstrap.definitions,
    state: {
      version: bootstrap.player.version,
      wallet: bootstrap.player.wallet,
      inventory: bootstrap.player.inventory,
      techUnlocks: bootstrap.player.techUnlocks,
      mastery: bootstrap.player.mastery
    }
  };
},

async recordAccepted(event, result) {
  await pool.query(
    `insert into player_transactions (event_id, player_id, transaction_type, payload, accepted, state_version)
     values ($1, $2, $3, $4::jsonb, true, $5)
     on conflict (event_id) do nothing`,
    [event.eventId, event.playerId, event.type, JSON.stringify(event.payload || {}), result.version]
  );
  await pool.query(
    `update player_wallets
     set state_version = greatest(state_version, $2), updated_at = now()
     where player_id = $1`,
    [event.playerId, result.version]
  );
},

async recordRejected(event, reason) {
  await pool.query(
    `insert into player_transactions (event_id, player_id, transaction_type, payload, accepted, reason)
     values ($1, $2, $3, $4::jsonb, false, $5)
     on conflict (event_id) do nothing`,
    [event.eventId, event.playerId, event.type || 'unknown', JSON.stringify(event.payload || {}), reason]
  );
},

async applyInventoryDelta(playerId, itemKey, bucket, delta) {
  await pool.query(
    `insert into player_inventory (player_id, item_key, bucket, qty)
     values ($1, $2, $3, $4)
     on conflict (player_id, item_key, bucket)
     do update set qty = greatest(0, player_inventory.qty + excluded.qty)`,
    [playerId, itemKey, bucket, delta]
  );
},

async updateWalletDelta(playerId, delta) {
  await pool.query(
    `update player_wallets
     set pp = greatest(0, pp + $2),
         steps = greatest(0, steps + $3),
         updated_at = now()
     where player_id = $1`,
    [playerId, delta.pp || 0, delta.steps || 0]
  );
},

async insertCraftingJob(playerId, localJobId, recipeId, startedAt, finishesAt, consumedInputs) {
  await pool.query(
    `insert into player_crafting_jobs (player_id, local_job_id, recipe_id, status, started_at, finishes_at, consumed_inputs)
     values ($1, $2, $3, 'active', $4, $5, $6::jsonb)
     on conflict (player_id, local_job_id) do nothing`,
    [playerId, localJobId, recipeId, startedAt, finishesAt, JSON.stringify(consumedInputs)]
  );
},

async completeCraftingJob(playerId, localJobId) {
  await pool.query(
    `update player_crafting_jobs set status = 'complete' where player_id = $1 and local_job_id = $2`,
    [playerId, localJobId]
  );
},

async unlockTech(playerId, techNodeId) {
  await pool.query(
    `insert into player_tech_unlocks (player_id, tech_node_id)
     values ($1, $2)
     on conflict do nothing`,
    [playerId, techNodeId]
  );
},

async awardMastery(playerId, trackId, xp) {
  await pool.query(
    `insert into player_mastery (player_id, track_id, xp, level)
     values ($1, $2, $3, 1 + floor($3 / 100.0)::int)
     on conflict (player_id, track_id)
     do update set
       xp = player_mastery.xp + excluded.xp,
       level = 1 + floor((player_mastery.xp + excluded.xp) / 100.0)::int,
       updated_at = now()`,
    [playerId, trackId, xp]
  );
}
```

- [ ] **Step 5: Run transaction tests**

Run: `npm test`

Expected: PASS for transaction service tests plus earlier tests.

---

### Task 5: Browser Sync Client

**Files:**
- Create: `js/sync/SyncClient.js`
- Test: `tests/sync/syncClient.test.js`

- [ ] **Step 1: Write sync client tests**

Create `tests/sync/syncClient.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SyncClient } from '../../js/sync/SyncClient.js';

function storage() {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) || null; },
    setItem(key, value) { data.set(key, value); },
    removeItem(key) { data.delete(key); }
  };
}

test('sync client queues events when backend is offline', async () => {
  const client = new SyncClient({
    baseUrl: 'http://local',
    playerId: 'local-player',
    storage: storage(),
    fetchImpl: async () => { throw new Error('offline'); }
  });

  await client.recordTransaction('inventory.addMaterial', { itemKey: 'copper', qty: 1 });

  assert.equal(client.status, 'Local');
  assert.equal(client.queue.length, 1);
  assert.equal(client.queue[0].type, 'inventory.addMaterial');
});

test('sync client replays queued events and clears accepted events', async () => {
  const calls = [];
  const client = new SyncClient({
    baseUrl: 'http://local',
    playerId: 'local-player',
    storage: storage(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { ok: true, player: { version: 1 } };
        }
      };
    }
  });

  await client.recordTransaction('inventory.addMaterial', { itemKey: 'copper', qty: 1 });
  await client.flush();

  assert.equal(client.status, 'Synced');
  assert.equal(client.queue.length, 0);
  assert.equal(calls[0].url, 'http://local/api/sync');
});
```

- [ ] **Step 2: Run sync client tests and verify they fail**

Run: `npm test`

Expected: FAIL with an import error for `js/sync/SyncClient.js`.

- [ ] **Step 3: Implement the sync client**

Create `js/sync/SyncClient.js`:

```js
export class SyncClient {
  constructor({
    baseUrl = 'http://localhost:3000',
    playerId = 'local-player',
    storage = globalThis.localStorage,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    onStatus = null,
    onReconciled = null,
    telemetry = null
  } = {}) {
    this.baseUrl = baseUrl;
    this.playerId = playerId;
    this.storage = storage;
    this.fetch = fetchImpl;
    this.onStatus = onStatus;
    this.onReconciled = onReconciled;
    this.telemetry = telemetry;
    this.status = 'Local';
    this.version = 0;
    this.queueKey = `pp_sync_queue_${playerId}`;
    this.queue = this._loadQueue();
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.onStatus?.(status);
    this.telemetry?.trackSyncStatus?.(status, this.queue.length);
  }

  _loadQueue() {
    try {
      return JSON.parse(this.storage.getItem(this.queueKey) || '[]');
    } catch {
      return [];
    }
  }

  _saveQueue() {
    this.storage.setItem(this.queueKey, JSON.stringify(this.queue));
  }

  _eventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  async health() {
    try {
      const response = await this.fetch(`${this.baseUrl}/api/health`);
      const body = await response.json();
      const ok = response.ok && body.ok && body.database;
      this._setStatus(ok ? 'Synced' : 'Local');
      return ok;
    } catch {
      this._setStatus('Local');
      return false;
    }
  }

  async bootstrap() {
    if (!(await this.health())) return null;
    const response = await this.fetch(`${this.baseUrl}/api/bootstrap?playerId=${encodeURIComponent(this.playerId)}`);
    if (!response.ok) {
      this._setStatus('Retry');
      return null;
    }
    const body = await response.json();
    this.version = body.player?.version || 0;
    this.onReconciled?.(body.player, body.definitions);
    this._setStatus('Synced');
    return body;
  }

  async recordTransaction(type, payload) {
    const event = {
      eventId: this._eventId(),
      playerId: this.playerId,
      type,
      createdAt: new Date().toISOString(),
      expectedVersion: this.version,
      payload
    };
    this.queue.push(event);
    this._saveQueue();
    await this.flush();
    return event;
  }

  async flush() {
    if (this.queue.length === 0) return { ok: true };
    if (!this.fetch) {
      this._setStatus('Local');
      return { ok: false };
    }

    this._setStatus('Syncing');
    const started = Date.now();
    try {
      const response = await this.fetch(`${this.baseUrl}/api/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: this.playerId, transactions: this.queue })
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        this._setStatus('Retry');
        this.telemetry?.trackSyncBatch?.(false, this.queue.length, Date.now() - started);
        return body;
      }
      this.queue = [];
      this._saveQueue();
      this.version = body.player?.version || this.version;
      this.onReconciled?.(body.player, body.definitions);
      this.telemetry?.trackSyncBatch?.(true, body.results?.length || 0, Date.now() - started);
      this._setStatus('Synced');
      return body;
    } catch {
      this._setStatus('Local');
      this.telemetry?.trackSyncBatch?.(false, this.queue.length, Date.now() - started);
      return { ok: false };
    }
  }

  async uploadTelemetrySession(report) {
    try {
      await this.fetch(`${this.baseUrl}/api/telemetry/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...report, playerId: this.playerId })
      });
    } catch {
      this._setStatus('Retry');
    }
  }
}
```

- [ ] **Step 4: Run sync tests**

Run: `npm test`

Expected: PASS for sync client tests plus earlier tests.

---

### Task 6: Data-Driven Local Definitions

**Files:**
- Create: `js/systems/ProgressionDefinitions.js`
- Modify: `js/systems/CraftingSystem.js`
- Test: `tests/systems/progressionDefinitions.test.js`

- [ ] **Step 1: Write definition normalization tests**

Create `tests/systems/progressionDefinitions.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLocalDefinitions,
  normalizeRecipesForCrafting
} from '../../js/systems/ProgressionDefinitions.js';

test('local definitions include starter recipes and tech nodes', () => {
  const defs = createLocalDefinitions();
  assert.ok(defs.recipes.some(r => r.id === 'ration'));
  assert.ok(defs.techNodes.some(n => n.id === 'fieldFabrication'));
});

test('recipes normalize to CraftingSystem map shape', () => {
  const recipes = normalizeRecipesForCrafting({
    recipes: [
      { id: 'ration', label: 'Ration', type: 'consumable', outputKey: 'ration', category: 'survival', costs: { timber: 2 }, baseTime: 3, minCraftingLevel: 1 }
    ]
  });

  assert.deepEqual(recipes.ration.materials, { timber: 2 });
  assert.equal(recipes.ration.key, 'ration');
  assert.equal(recipes.ration.masteryCategory, 'survival');
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test`

Expected: FAIL with an import error for `ProgressionDefinitions.js`.

- [ ] **Step 3: Add local definition helpers**

Create `js/systems/ProgressionDefinitions.js`:

```js
const MATERIAL_IDS = [
  'copper', 'timber', 'stone', 'iron', 'carbon', 'quartz', 'silica',
  'fiber', 'silver', 'gold', 'titanium', 'tungsten', 'resin', 'epoxy',
  'elastomer', 'magnet', 'glass', 'lumber', 'seed',
  'circuitWire', 'ironSpike', 'powerCore', 'armorPlate', 'burstCapacitor', 'logicChip'
];

export function createLocalDefinitions() {
  return {
    version: 'local-starter-1',
    materials: MATERIAL_IDS.map(id => ({ id, label: id, stackLimit: 99 })),
    masteryTracks: [
      { id: 'survival', label: 'Survival Fabrication', xpPerLevel: 100 },
      { id: 'tooling', label: 'Tooling Mastery', xpPerLevel: 120 },
      { id: 'combat', label: 'Combat Engineering', xpPerLevel: 140 },
      { id: 'energy', label: 'Energy Systems', xpPerLevel: 120 }
    ],
    techNodes: [
      { id: 'fieldFabrication', branch: 'fabrication', label: 'Field Fabrication', description: 'Unlocks advanced survival recipes and storage fabrication.', costType: 'pp', costAmount: 150, materialCosts: {}, prerequisites: [] },
      { id: 'droneLogistics', branch: 'drones', label: 'Drone Logistics', description: 'Unlocks broader drone assignment support.', costType: 'pp', costAmount: 250, materialCosts: {}, prerequisites: [] },
      { id: 'terrainControl', branch: 'tools', label: 'Terrain Control', description: 'Unlocks terrain manipulation tooling.', costType: 'materials', costAmount: 1, materialCosts: { copper: 3, iron: 2 }, prerequisites: ['fieldFabrication'] },
      { id: 'biomeAccess', branch: 'exploration', label: 'Biome Access', description: 'Centralizes biome access progression.', costType: 'steps', costAmount: 1000, materialCosts: {}, prerequisites: [] }
    ],
    recipes: [
      { id: 'ration', label: 'Ration', type: 'consumable', outputKey: 'ration', category: 'survival', costs: { timber: 2, fiber: 1 }, baseTime: 3, minCraftingLevel: 1 },
      { id: 'firstAid', label: 'First Aid', type: 'consumable', outputKey: 'firstAid', category: 'survival', costs: { copper: 2, fiber: 2 }, baseTime: 5, minCraftingLevel: 2, requiredTechNode: 'fieldFabrication' },
      { id: 'terrainCutter', label: 'Terrain Cutter', type: 'tool', outputKey: 'terrainCutter', category: 'tooling', costs: { copper: 3, iron: 2, carbon: 1 }, baseTime: 8, minCraftingLevel: 2, requiredTechNode: 'terrainControl' },
      { id: 'basicBlade', label: 'Basic Blade', type: 'equipment', outputKey: 'basicBlade', category: 'combat', costs: { iron: 4, timber: 2 }, baseTime: 10, minCraftingLevel: 2, slot: 'weapon', tier: 'Basic', statBonuses: { strength: 2 } },
      { id: 'energyCell', label: 'Energy Cell', type: 'consumable', outputKey: 'energyCell', category: 'energy', costs: { copper: 2, quartz: 1 }, baseTime: 5, minCraftingLevel: 1 }
    ]
  };
}

export function normalizeRecipesForCrafting(definitions) {
  const map = {};
  for (const recipe of definitions.recipes || []) {
    map[recipe.id] = {
      label: recipe.label,
      type: recipe.type,
      key: recipe.outputKey,
      slot: recipe.slot,
      tier: recipe.tier,
      statBonuses: recipe.statBonuses,
      materials: { ...(recipe.costs || {}) },
      baseTime: recipe.baseTime,
      minCraftingLevel: recipe.minCraftingLevel,
      requiredTechNode: recipe.requiredTechNode || null,
      masteryCategory: recipe.category
    };
  }
  return map;
}
```

- [ ] **Step 4: Modify CraftingSystem to accept definition recipes**

In `js/systems/CraftingSystem.js`, keep the existing `RECIPES` constant and change the constructor plus `static get RECIPES` use:

```js
export class CraftingSystem {
  constructor(inventorySystem, statsSystem, options = {}) {
    this.inventory = inventorySystem;
    this.stats = statsSystem;
    this.recipes = options.recipes || RECIPES;
    this.techTree = options.techTree || null;
    this.mastery = options.mastery || null;
    this.sync = options.sync || null;
    this._isCrafting = false;
    this._craftingRecipe = null;
    this._craftingProgress = 0;
    this._craftingDuration = 0;
    this._queue = [];
    this.maxQueueSize = 5;
    this.onCraftComplete = null;
    this.onCraftProgress = null;
    this.onQueueUpdate = null;
  }

  static get RECIPES() { return RECIPES; }

  setRecipes(recipes) {
    this.recipes = recipes || RECIPES;
  }
}
```

Replace each `RECIPES` lookup in methods with `this.recipes`:

```js
const recipe = this.recipes[recipeId];
```

And in `getAvailableRecipes()`:

```js
return Object.entries(this.recipes)
```

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS for progression definition tests and existing touch input tests.

---

### Task 7: Tech Tree And Mastery Systems

**Files:**
- Create: `js/systems/TechTreeSystem.js`
- Create: `js/systems/CraftingMasterySystem.js`
- Test: `tests/systems/techTreeSystem.test.js`
- Test: `tests/systems/craftingMasterySystem.test.js`

- [ ] **Step 1: Write Tech Tree tests**

Create `tests/systems/techTreeSystem.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TechTreeSystem } from '../../js/systems/TechTreeSystem.js';

test('tech tree reports affordable PP node', () => {
  const tech = new TechTreeSystem({
    nodes: [{ id: 'fieldFabrication', costType: 'pp', costAmount: 150, materialCosts: {}, prerequisites: [] }]
  });
  const state = tech.getNodeState('fieldFabrication', {
    pp: { ppTotal: 200 },
    pedometer: { totalSteps: 0 },
    inventory: { materials: {} }
  });
  assert.equal(state.affordable, true);
  assert.equal(state.owned, false);
});

test('tech tree blocks unmet prerequisites', () => {
  const tech = new TechTreeSystem({
    nodes: [{ id: 'terrainControl', costType: 'materials', costAmount: 1, materialCosts: { copper: 1 }, prerequisites: ['fieldFabrication'] }]
  });
  const state = tech.getNodeState('terrainControl', {
    pp: { ppTotal: 0 },
    pedometer: { totalSteps: 0 },
    inventory: { materials: { copper: 5 } }
  });
  assert.equal(state.locked, true);
  assert.equal(state.reason, 'Requires Field Fabrication');
});
```

- [ ] **Step 2: Write mastery tests**

Create `tests/systems/craftingMasterySystem.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CraftingMasterySystem } from '../../js/systems/CraftingMasterySystem.js';

test('mastery awards XP and increases level', () => {
  const mastery = new CraftingMasterySystem({
    tracks: [{ id: 'survival', label: 'Survival', xpPerLevel: 100 }]
  });

  const result = mastery.award('survival', 125);

  assert.equal(result.level, 2);
  assert.equal(mastery.getLevel('survival'), 2);
});

test('mastery craft speed bonus stays modest', () => {
  const mastery = new CraftingMasterySystem({
    tracks: [{ id: 'energy', label: 'Energy', xpPerLevel: 100 }]
  });
  mastery.award('energy', 350);

  assert.equal(mastery.getCraftTimeMultiplier('energy'), 0.88);
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run: `npm test`

Expected: FAIL with import errors for the two new systems.

- [ ] **Step 4: Implement TechTreeSystem**

Create `js/systems/TechTreeSystem.js`:

```js
function labelFromId(id) {
  return id.replace(/[A-Z]/g, m => ` ${m}`).replace(/^./, c => c.toUpperCase());
}

export class TechTreeSystem {
  constructor({ nodes = [], owned = [], sync = null, telemetry = null } = {}) {
    this.nodes = nodes;
    this.owned = new Set(owned);
    this.sync = sync;
    this.telemetry = telemetry;
  }

  setDefinitions(nodes) {
    this.nodes = nodes || [];
  }

  applyOwned(owned) {
    this.owned = new Set(owned || []);
  }

  getNode(id) {
    return this.nodes.find(n => n.id === id) || null;
  }

  getNodeState(id, systems) {
    const node = this.getNode(id);
    if (!node) return { exists: false, locked: true, affordable: false, owned: false, reason: 'Missing tech node' };
    const owned = this.owned.has(id);
    const missingPrereq = (node.prerequisites || []).find(req => !this.owned.has(req));
    if (missingPrereq) {
      return { exists: true, node, owned, locked: true, affordable: false, reason: `Requires ${labelFromId(missingPrereq)}` };
    }
    const affordable = this._canAfford(node, systems);
    return { exists: true, node, owned, locked: false, affordable, reason: affordable ? '' : this._costReason(node) };
  }

  _costReason(node) {
    if (node.costType === 'pp') return `${node.costAmount} PP`;
    if (node.costType === 'steps') return `${node.costAmount} steps`;
    if (node.costType === 'materials') return Object.entries(node.materialCosts || {}).map(([m, q]) => `${m} x${q}`).join(', ');
    return 'Unknown cost';
  }

  _canAfford(node, systems) {
    if (this.owned.has(node.id)) return false;
    if (node.costType === 'pp') return (systems.pp?.ppTotal || 0) >= node.costAmount;
    if (node.costType === 'steps') return (systems.pedometer?.totalSteps || 0) >= node.costAmount;
    if (node.costType === 'materials') {
      return Object.entries(node.materialCosts || {}).every(([mat, qty]) => (systems.inventory?.materials?.[mat] || 0) >= qty);
    }
    return false;
  }

  async purchase(id, systems) {
    const state = this.getNodeState(id, systems);
    this.telemetry?.trackTechNode?.('purchase_attempt', id, state);
    if (!state.exists || state.locked || !state.affordable || state.owned) return false;

    const node = state.node;
    if (node.costType === 'pp') systems.pp.ppTotal -= node.costAmount;
    if (node.costType === 'steps') systems.pedometer.totalSteps -= node.costAmount;
    if (node.costType === 'materials') {
      for (const [mat, qty] of Object.entries(node.materialCosts || {})) {
        systems.inventory.removeMaterial(mat, qty);
      }
    }

    this.owned.add(id);
    await this.sync?.recordTransaction('tech.purchase', { techNodeId: id });
    this.telemetry?.trackTechNode?.('purchased', id, state);
    return true;
  }

  serialize() {
    return { owned: [...this.owned] };
  }

  deserialize(data) {
    this.applyOwned(data?.owned || []);
  }
}
```

- [ ] **Step 5: Implement CraftingMasterySystem**

Create `js/systems/CraftingMasterySystem.js`:

```js
export class CraftingMasterySystem {
  constructor({ tracks = [], progress = [], sync = null, telemetry = null } = {}) {
    this.tracks = tracks;
    this.progress = {};
    this.sync = sync;
    this.telemetry = telemetry;
    for (const track of tracks) {
      this.progress[track.id] = { xp: 0, level: 1 };
    }
    for (const row of progress) {
      this.progress[row.trackId] = { xp: row.xp || 0, level: row.level || 1 };
    }
  }

  setDefinitions(tracks) {
    this.tracks = tracks || [];
    for (const track of this.tracks) {
      this.progress[track.id] ||= { xp: 0, level: 1 };
    }
  }

  applyProgress(progress) {
    for (const row of progress || []) {
      this.progress[row.trackId] = { xp: row.xp || 0, level: row.level || 1 };
    }
  }

  getTrack(id) {
    return this.tracks.find(t => t.id === id) || { id, label: id, xpPerLevel: 100 };
  }

  getLevel(id) {
    return this.progress[id]?.level || 1;
  }

  award(trackId, xp) {
    const track = this.getTrack(trackId);
    const current = this.progress[trackId] || { xp: 0, level: 1 };
    const nextXp = current.xp + xp;
    const nextLevel = 1 + Math.floor(nextXp / track.xpPerLevel);
    this.progress[trackId] = { xp: nextXp, level: nextLevel };
    this.telemetry?.trackMastery?.('xp_awarded', trackId, { xp, level: nextLevel });
    if (nextLevel > current.level) {
      this.telemetry?.trackMastery?.('level_gained', trackId, { level: nextLevel });
    }
    this.sync?.recordTransaction('mastery.awardCraftXp', { trackId, xp });
    return this.progress[trackId];
  }

  getCraftTimeMultiplier(trackId) {
    const level = this.getLevel(trackId);
    const reduction = Math.min(0.2, (level - 1) * 0.04);
    return Number((1 - reduction).toFixed(2));
  }

  serialize() {
    return { progress: { ...this.progress } };
  }

  deserialize(data) {
    this.progress = { ...(data?.progress || {}) };
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npm test`

Expected: PASS for Tech Tree and Crafting Mastery tests.

---

### Task 8: Wire Sync Into Economy Systems

**Files:**
- Modify: `js/systems/CraftingSystem.js`
- Modify: `js/systems/DroneSystem.js`
- Modify: `js/systems/InventorySystem.js`
- Test: `tests/systems/craftingSync.test.js`

- [ ] **Step 1: Write crafting sync tests**

Create `tests/systems/craftingSync.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CraftingSystem } from '../../js/systems/CraftingSystem.js';

test('crafting start emits sync transaction with local job id', async () => {
  const events = [];
  const inventory = {
    materials: { timber: 2 },
    hasTool: () => false,
    hasMaterials: () => true,
    removeMaterial: () => true
  };
  const stats = { stats: { crafting: { level: 1 }, craftingSpeed: { level: 1 } } };
  const crafting = new CraftingSystem(inventory, stats, {
    recipes: {
      ration: { label: 'Ration', type: 'consumable', key: 'ration', materials: { timber: 2 }, baseTime: 3, minCraftingLevel: 1, masteryCategory: 'survival' }
    },
    sync: {
      recordTransaction(type, payload) {
        events.push({ type, payload });
      }
    }
  });

  assert.equal(crafting.startCraft('ration'), true);
  assert.equal(events[0].type, 'crafting.start');
  assert.equal(events[0].payload.recipeId, 'ration');
  assert.ok(events[0].payload.localJobId);
});
```

- [ ] **Step 2: Run the crafting sync test and verify it fails**

Run: `npm test`

Expected: FAIL because `CraftingSystem` does not emit sync transactions yet.

- [ ] **Step 3: Add local job IDs and sync events to CraftingSystem**

In `js/systems/CraftingSystem.js`, add this helper inside the class:

```js
_createLocalJobId(recipeId) {
  return `craft_${recipeId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
```

In `startCraft(recipeId)`, before setting `_isCrafting`, add:

```js
const localJobId = this._createLocalJobId(recipeId);
```

Change `_craftingRecipe` assignment to:

```js
this._craftingRecipe = { id: recipeId, localJobId, ...recipe };
```

After `_craftingDuration` is set, add:

```js
this.sync?.recordTransaction('crafting.start', {
  localJobId,
  recipeId,
  startedAt: new Date().toISOString()
});
```

In `_completeCraft()`, before `this.onCraftComplete`, add:

```js
if (recipe.masteryCategory && this.mastery) {
  this.mastery.award(recipe.masteryCategory, 25);
}
this.sync?.recordTransaction('crafting.complete', {
  localJobId: recipe.localJobId,
  recipeId: recipe.id,
  completedAt: new Date().toISOString()
});
```

- [ ] **Step 4: Add serialization helpers to InventorySystem**

In `js/systems/InventorySystem.js`, add:

```js
serialize() {
  return {
    materials: { ...this.materials },
    consumables: { ...this.consumables },
    tools: { ...this.tools },
    storageItems: { ...this.storageItems },
    equipmentBag: this.equipmentBag.map(item => ({ ...item }))
  };
}

applyServerInventory(inventory) {
  const materialBucket = inventory?.inventory || {};
  const consumableBucket = inventory?.consumable || {};
  for (const key of Object.keys(this.materials)) {
    this.materials[key] = materialBucket[key] || 0;
  }
  for (const key of Object.keys(this.consumables)) {
    this.consumables[key] = consumableBucket[key] || 0;
  }
}
```

- [ ] **Step 5: Add sync hooks to DroneSystem**

Change `DroneSystem` constructor to accept options:

```js
constructor(inventorySystem, ppSystem, options = {}) {
  this.inventory = inventorySystem;
  this.pp = ppSystem;
  this.sync = options.sync || null;
```

In `assignDrone`, after assignment succeeds, add:

```js
this.sync?.recordTransaction('drone.assign', { droneId, materialType });
```

In `upgradeDroneEfficiency`, after incrementing efficiency, add:

```js
this.sync?.recordTransaction('drone.upgrade', { droneId, efficiency: drone.efficiency });
```

- [ ] **Step 6: Run tests**

Run: `npm test`

Expected: PASS for crafting sync and earlier tests.

---

### Task 9: HUD Panels And Main Wiring

**Files:**
- Modify: `index.html`
- Modify: `js/ui/HUD.js`
- Modify: `js/main.js`
- Test: `tests/systems/saveProgressionState.test.js`

- [ ] **Step 1: Write state serialization test for new systems**

Create `tests/systems/saveProgressionState.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TechTreeSystem } from '../../js/systems/TechTreeSystem.js';
import { CraftingMasterySystem } from '../../js/systems/CraftingMasterySystem.js';

test('progression systems serialize stable state', () => {
  const tech = new TechTreeSystem({ owned: ['fieldFabrication'] });
  const mastery = new CraftingMasterySystem({ tracks: [{ id: 'survival', xpPerLevel: 100 }] });
  mastery.award('survival', 125);

  assert.deepEqual(tech.serialize(), { owned: ['fieldFabrication'] });
  assert.equal(mastery.serialize().progress.survival.level, 2);
});
```

- [ ] **Step 2: Run test and verify current systems pass**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Add panel containers and HUD buttons**

In `index.html`, add buttons near the existing HUD panel buttons:

```html
<button id="btn-toggle-tech-panel" class="panel-toggle-btn" title="Tech Tree">TECH</button>
<button id="btn-toggle-mastery-panel" class="panel-toggle-btn" title="Crafting Mastery">MSTR</button>
<div id="sync-status" class="sync-status">Local</div>
```

Add panels near the existing inventory/crafting panels:

```html
<div id="tech-panel" hidden>
  <div id="tech-modal">
    <div class="panel-header">TECH TREE <button class="panel-close" onclick="document.getElementById('tech-panel').hidden=true">X</button></div>
    <div id="tech-contents" class="panel-body"></div>
  </div>
</div>

<div id="mastery-panel" hidden>
  <div id="mastery-modal">
    <div class="panel-header">CRAFTING MASTERY <button class="panel-close" onclick="document.getElementById('mastery-panel').hidden=true">X</button></div>
    <div id="mastery-contents" class="panel-body"></div>
  </div>
</div>
```

- [ ] **Step 4: Extend HUD constructor parameters**

In `js/ui/HUD.js`, extend the constructor signature to include `techTree`, `mastery`, and `syncClient`:

```js
constructor(statsSystem, ppSystem, pedometerSystem, inventorySystem, craftingSystem, droneSystem, equipmentSystem, gameStats, achievements, minigame, ascension, autoCombat, drillSystem, techTree = null, mastery = null, syncClient = null) {
```

Inside the constructor body, assign:

```js
this.techTree = techTree;
this.mastery = mastery;
this.syncClient = syncClient;
```

- [ ] **Step 5: Add panel refresh routing**

Add `tech-panel` and `mastery-panel` to every panel list in `HUD.js` and `main.js` where panel IDs are enumerated.

In `HUD._refreshPanel(panelId)`, add:

```js
case 'tech-panel': this._refreshTechTree(); break;
case 'mastery-panel': this._refreshMastery(); break;
```

- [ ] **Step 6: Add HUD Tech Tree rendering**

Add this method to `HUD`:

```js
_refreshTechTree() {
  const el = document.getElementById('tech-contents');
  if (!el || !this.techTree) return;
  el.innerHTML = '';
  const systems = { pp: this.pp, pedometer: this.pedometer, inventory: this.inventory };
  for (const node of this.techTree.nodes) {
    const state = this.techTree.getNodeState(node.id, systems);
    const row = document.createElement('div');
    row.className = 'craft-row';
    const info = document.createElement('div');
    info.className = 'craft-info';
    info.innerHTML = `<span class="craft-name">${node.label}</span><span class="craft-mats">${node.description} | ${state.owned ? 'Owned' : state.reason || 'Available'}</span>`;
    const btn = document.createElement('button');
    btn.className = 'stat-up-btn';
    btn.textContent = state.owned ? 'Owned' : 'Unlock';
    btn.disabled = state.owned || state.locked || !state.affordable;
    btn.addEventListener('click', async () => {
      await this.techTree.purchase(node.id, systems);
      this._refreshTechTree();
      this._refreshCrafting();
    });
    row.appendChild(info);
    row.appendChild(btn);
    el.appendChild(row);
  }
}
```

- [ ] **Step 7: Add HUD Mastery rendering**

Add this method to `HUD`:

```js
_refreshMastery() {
  const el = document.getElementById('mastery-contents');
  if (!el || !this.mastery) return;
  el.innerHTML = '';
  for (const track of this.mastery.tracks) {
    const progress = this.mastery.progress[track.id] || { xp: 0, level: 1 };
    const row = document.createElement('div');
    row.className = 'craft-row';
    const info = document.createElement('div');
    info.className = 'craft-info';
    const next = track.xpPerLevel * progress.level;
    info.innerHTML = `<span class="craft-name">${track.label} Lv ${progress.level}</span><span class="craft-mats">${progress.xp}/${next} XP | craft time x${this.mastery.getCraftTimeMultiplier(track.id).toFixed(2)}</span>`;
    row.appendChild(info);
    el.appendChild(row);
  }
}
```

- [ ] **Step 8: Add sync status display**

Add this method to `HUD`:

```js
setSyncStatus(status) {
  const el = document.getElementById('sync-status');
  if (el) el.textContent = status;
}
```

- [ ] **Step 9: Wire systems in main.js**

In `js/main.js`, import:

```js
import { SyncClient } from './sync/SyncClient.js';
import { createLocalDefinitions, normalizeRecipesForCrafting } from './systems/ProgressionDefinitions.js';
import { TechTreeSystem } from './systems/TechTreeSystem.js';
import { CraftingMasterySystem } from './systems/CraftingMasterySystem.js';
```

Before constructing `CraftingSystem`, add:

```js
const definitions = createLocalDefinitions();
const syncClient = new SyncClient({ playerId: 'local-player' });
const techTree = new TechTreeSystem({ nodes: definitions.techNodes, sync: syncClient });
const mastery = new CraftingMasterySystem({ tracks: definitions.masteryTracks, sync: syncClient });
```

Construct `CraftingSystem` as:

```js
const craftingSystem = new CraftingSystem(inventorySystem, statsSystem, {
  recipes: normalizeRecipesForCrafting(definitions),
  techTree,
  mastery,
  sync: syncClient
});
```

Pass `syncClient` into `DroneSystem`:

```js
const droneSystem = new DroneSystem(inventorySystem, ppSystem, { sync: syncClient });
```

Pass `techTree`, `mastery`, and `syncClient` to `HUD`.

After HUD construction, set callbacks:

```js
syncClient.onStatus = status => hud.setSyncStatus(status);
syncClient.onReconciled = (playerState, serverDefinitions) => {
  if (serverDefinitions) {
    techTree.setDefinitions(serverDefinitions.techNodes);
    mastery.setDefinitions(serverDefinitions.masteryTracks);
    craftingSystem.setRecipes(normalizeRecipesForCrafting(serverDefinitions));
  }
  if (playerState) {
    techTree.applyOwned(playerState.techUnlocks);
    mastery.applyProgress(playerState.mastery);
    inventorySystem.applyServerInventory(playerState.inventory);
  }
};
syncClient.bootstrap();
```

- [ ] **Step 10: Run tests**

Run: `npm test`

Expected: PASS for all tests.

---

### Task 10: Telemetry Integration

**Files:**
- Modify: `js/TelemetrySystem.js`
- Test: `tests/systems/telemetryProgression.test.js`

- [ ] **Step 1: Write telemetry tests**

Create `tests/systems/telemetryProgression.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TelemetrySystem } from '../../js/TelemetrySystem.js';

test('telemetry tracks sync and progression events', () => {
  global.window = { addEventListener() {}, removeEventListener() {} };
  global.localStorage = {
    getItem() { return '[]'; },
    setItem() {},
    removeItem() {}
  };

  const telemetry = new TelemetrySystem();
  telemetry.trackSyncStatus('Syncing', 3);
  telemetry.trackSyncBatch(true, 3, 42);
  telemetry.trackTechNode('purchased', 'fieldFabrication', {});
  telemetry.trackMastery('level_gained', 'survival', { level: 2 });

  assert.equal(telemetry.actions.sync_status_change, 1);
  assert.equal(telemetry.session.syncBatchesSucceeded, 1);
  assert.equal(telemetry.session.techNodesPurchased.fieldFabrication, 1);
  assert.equal(telemetry.session.masteryLevelsGained.survival, 1);

  clearInterval(telemetry._heartbeat);
});
```

- [ ] **Step 2: Run telemetry test and verify it fails**

Run: `npm test`

Expected: FAIL because the telemetry methods do not exist yet.

- [ ] **Step 3: Add telemetry counters**

In `js/TelemetrySystem.js`, add these action counters:

```js
sync_status_change: 0,
sync_batch_success: 0,
sync_batch_fail: 0,
transaction_retry: 0,
tech_node_view: 0,
tech_node_purchase_attempt: 0,
tech_node_purchased: 0,
mastery_xp_awarded: 0,
mastery_level_gained: 0,
```

Add these session fields:

```js
syncStatusChanges: [],
syncBatchesSucceeded: 0,
syncBatchesFailed: 0,
syncLatencyMs: [],
syncMaxQueueLength: 0,
techNodesPurchased: {},
masteryXpAwarded: {},
masteryLevelsGained: {},
transactionRejectReasons: {},
```

- [ ] **Step 4: Add telemetry methods**

Add these methods to `TelemetrySystem`:

```js
trackSyncStatus(status, queueLength = 0) {
  this.track('sync_status_change');
  this.session.syncStatusChanges.push({ status, queueLength, t: this._elapsed() });
  this.session.syncMaxQueueLength = Math.max(this.session.syncMaxQueueLength || 0, queueLength);
}

trackSyncBatch(ok, count, latencyMs) {
  this.session.syncLatencyMs.push(latencyMs);
  if (ok) {
    this.track('sync_batch_success');
    this.session.syncBatchesSucceeded++;
  } else {
    this.track('sync_batch_fail');
    this.session.syncBatchesFailed++;
  }
  this.session.syncMaxQueueLength = Math.max(this.session.syncMaxQueueLength || 0, count);
}

trackTransactionRejected(reason) {
  this.session.transactionRejectReasons[reason] = (this.session.transactionRejectReasons[reason] || 0) + 1;
}

trackTechNode(event, techNodeId) {
  if (event === 'view') this.track('tech_node_view');
  if (event === 'purchase_attempt') this.track('tech_node_purchase_attempt');
  if (event === 'purchased') {
    this.track('tech_node_purchased');
    this.session.techNodesPurchased[techNodeId] = (this.session.techNodesPurchased[techNodeId] || 0) + 1;
  }
}

trackMastery(event, trackId, payload = {}) {
  if (event === 'xp_awarded') {
    this.track('mastery_xp_awarded');
    this.session.masteryXpAwarded[trackId] = (this.session.masteryXpAwarded[trackId] || 0) + (payload.xp || 0);
  }
  if (event === 'level_gained') {
    this.track('mastery_level_gained');
    this.session.masteryLevelsGained[trackId] = (this.session.masteryLevelsGained[trackId] || 0) + 1;
  }
}
```

- [ ] **Step 5: Upload telemetry on finalise**

In `js/main.js`, replace the beforeunload handler:

```js
window.addEventListener('beforeunload', () => {
  const report = telemetry.finalise();
  syncClient.uploadTelemetrySession(report);
});
```

- [ ] **Step 6: Run telemetry tests**

Run: `npm test`

Expected: PASS for telemetry progression tests and all earlier tests.

---

### Task 11: Save Compatibility

**Files:**
- Modify: `js/systems/SaveSystem.js`
- Test: `tests/systems/saveSystemProgression.test.js`

- [ ] **Step 1: Write save progression test**

Create `tests/systems/saveSystemProgression.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SaveSystem } from '../../js/systems/SaveSystem.js';

test('save data includes progression systems when present', () => {
  const save = new SaveSystem({
    pp: { ppTotal: 0, prestigeBonus: 0, prestigeCount: 0, _rateModifiers: {} },
    stats: { statNames: [], stats: {}, currentHP: 10, currentFP: 0, currentEnergy: 10 },
    inventory: { materials: {}, consumables: {}, tools: {}, storageItems: {}, equipmentBag: [] },
    pedometer: { totalSteps: 0, _ppBonusPerStep: 0, _ppBonusPurchases: 0, _nextBonusCost: 0, _trackCount: 0, _nextTrackCost: 0, _pendingTracks: 0, _placedTracks: [], _statStepPurchases: {}, _totalStatPurchases: 0, _nextStatCost: 0, _unlockedZones: new Set() },
    drones: { drones: [], upgradeCost: 0 },
    equipment: { slots: {} },
    gameStats: { enemiesDefeated: 0, defeats: 0, actionsTaken: 0, highestHit: 0, totalStepsTaken: 0, resourcesGathered: 0, _visitedZones: new Set() },
    techTree: { serialize: () => ({ owned: ['fieldFabrication'] }) },
    mastery: { serialize: () => ({ progress: { survival: { xp: 25, level: 1 } } }) },
    sync: { version: 3, queue: [{ eventId: 'evt-1' }] }
  });

  const data = save._buildSaveData('landingSite', 0, 0);

  assert.deepEqual(data.techTree, { owned: ['fieldFabrication'] });
  assert.equal(data.mastery.progress.survival.xp, 25);
  assert.equal(data.sync.version, 3);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm test`

Expected: FAIL because `SaveSystem` does not include progression state.

- [ ] **Step 3: Include progression state in SaveSystem**

In `SaveSystem._buildSaveData`, destructure:

```js
const { pp, stats, inventory, pedometer, drones, equipment, gameStats, achievements, minigame, ascension, autoCombat, drill, techTree, mastery, sync } = this.systems;
```

Add to `data`:

```js
techTree: techTree ? techTree.serialize() : null,
mastery: mastery ? mastery.serialize() : null,
sync: sync ? { version: sync.version, queuedEvents: sync.queue.length } : null,
```

In `SaveSystem.apply`, destructure `techTree`, `mastery`, and `sync`, then add:

```js
if (techTree && data.techTree) techTree.deserialize(data.techTree);
if (mastery && data.mastery) mastery.deserialize(data.mastery);
if (sync && data.sync?.version !== undefined) sync.version = data.sync.version;
```

- [ ] **Step 4: Update main SaveSystem construction**

In `js/main.js`, pass the new systems:

```js
techTree,
mastery,
sync: syncClient,
```

- [ ] **Step 5: Run save compatibility tests**

Run: `npm test`

Expected: PASS for save compatibility tests and all earlier tests.

---

### Task 12: Local Server Verification

**Files:**
- Read: `docs/superpowers/specs/2026-04-19-postgresql-progression-design.md`
- Read: `docs/superpowers/plans/2026-04-19-postgresql-progression.md`

- [ ] **Step 1: Run JavaScript tests**

Run: `npm test`

Expected: all Node tests PASS.

- [ ] **Step 2: Install dependencies if needed**

Run: `npm install`

Expected: `node_modules` is created and `package-lock.json` is updated. If network access fails because of sandbox restrictions, rerun with escalated permissions.

- [ ] **Step 3: Create the local PostgreSQL database**

Run in a PostgreSQL shell outside this repo:

```sql
create database processing_power;
```

Expected: database `processing_power` exists.

- [ ] **Step 4: Run migrations**

Run: `npm run db:migrate`

Expected: console prints `Applied migration 001_progression` on first run and no error on repeat runs.

- [ ] **Step 5: Seed definitions**

Run: `npm run db:seed`

Expected: command exits with code 0.

- [ ] **Step 6: Start the API server**

Run: `npm run server`

Expected: console prints `Processing Power API listening on http://localhost:3000`.

- [ ] **Step 7: Start the static web server**

Run: `python -m http.server 8080`

Expected: game is available at `http://localhost:8080`.

- [ ] **Step 8: Manual browser verification**

Open `http://localhost:8080` and verify:

- Sync status changes from `Local` to `Synced`.
- Tech Tree panel opens and shows four starter nodes.
- Mastery panel opens and shows four mastery tracks.
- Crafting a ration removes materials, completes locally, awards survival mastery XP, and sync status returns to `Synced`.
- Unlocking `Field Fabrication` spends PP and changes the node to `Owned`.
- Stopping the API server changes status to `Local` or `Retry` after a sync attempt.
- Gathering or crafting while the API is stopped queues events.
- Restarting the API server flushes queued events and returns status to `Synced`.
- Existing JSON save export still downloads a save file.
- Browser console does not show uncaught errors during the flow.

- [ ] **Step 9: Spec coverage check**

Open `docs/superpowers/specs/2026-04-19-postgresql-progression-design.md` and confirm each approved item maps to implemented behavior:

- PostgreSQL definitions exist.
- Player state tables exist.
- Economy transaction routes exist.
- Local-first play works without backend.
- Tech Tree panel exists.
- Crafting Mastery panel exists.
- Sync indicator exists.
- Telemetry upload endpoints exist.
- Existing save compatibility remains.
