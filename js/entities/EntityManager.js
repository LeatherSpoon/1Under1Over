import { Enemy } from './Enemy.js';
import { ResourceNode } from './ResourceNode.js';

export class EntityManager {
  constructor(scene, onAggro) {
    this.scene = scene;
    this.onAggro = onAggro;
    this.enemies = [];
    this.resourceNodes = [];
    this._inCombat = false;
    this._spawnTimer = 0;
    this._spawnInterval = 15;
    this._gracePeriod = 3;
    this._spawnPositions = []; // { x, z, archetype }
  }

  spawnForZone(enemySpawns, nodeSpawns) {
    this._inCombat = false;
    for (const e of this.enemies) {
      if (e.group.parent) this.scene.remove(e.group);
    }
    for (const n of this.resourceNodes) {
      if (n.group.parent) this.scene.remove(n.group);
    }
    this.enemies = [];
    this.resourceNodes = [];
    this._gracePeriod = 3;
    this._spawnTimer = 0;

    // Store spawn configs (with archetype) for respawning
    this._spawnPositions = enemySpawns.map(s => ({
      x: s.x, z: s.z, archetype: s.archetype || 'rusher'
    }));

    for (const s of enemySpawns) {
      this.enemies.push(new Enemy(this.scene, s.x, s.z, s.archetype || 'rusher'));
    }
    for (const s of nodeSpawns) {
      const node = new ResourceNode(this.scene, s.x, s.z, s.type);
      if (s.richness && s.richness > 1) {
        node.maxRichness = s.richness;
        node._richness = s.richness;
      }
      if (s.requiredTool) node.requiredTool = s.requiredTool;
      this.resourceNodes.push(node);
    }
  }

  update(delta, playerPos, collisionCircles = null, collisionBoxes = null) {
    for (const node of this.resourceNodes) node.update(delta);

    if (this._inCombat) return;

    if (this._gracePeriod > 0) {
      this._gracePeriod -= delta;
      for (const enemy of this.enemies) enemy.update(delta, playerPos, true, collisionCircles, collisionBoxes);
      return;
    }

    for (const enemy of this.enemies) {
      const triggered = enemy.update(delta, playerPos, false, collisionCircles, collisionBoxes);
      if (triggered) {
        this._inCombat = true;
        this.onAggro(enemy);
        return;
      }
    }

    // Respawn
    this._spawnTimer += delta;
    if (this._spawnTimer >= this._spawnInterval && this._spawnPositions.length > 0) {
      this._spawnTimer = 0;
      const maxEnemies = Math.min(this._spawnPositions.length, 3);
      if (this.enemies.length < maxEnemies) {
        const spawn = this._spawnPositions[Math.floor(Math.random() * this._spawnPositions.length)];
        this.enemies.push(new Enemy(this.scene, spawn.x, spawn.z, spawn.archetype));
      }
    }
  }

  combatEnded() {
    this._inCombat = false;
    this.enemies = this.enemies.filter(e => {
      if (e._state === 'dead') {
        if (e.group.parent) this.scene.remove(e.group);
        return false;
      }
      return true;
    });
  }

  getNodeCollisionCircles() {
    return this.resourceNodes
      .filter(n => !n.isDepleted)
      .map(n => ({ x: n.position.x, z: n.position.z, r: n.collisionR }));
  }

  findNearestNode(playerPos) {
    let best = null, bestDist = Infinity;
    for (const node of this.resourceNodes) {
      if (node.isDepleted) continue;
      const d = node.position.distanceTo(playerPos);
      if (d < node.interactRadius && d < bestDist) {
        best = node;
        bestDist = d;
      }
    }
    return best;
  }
}
