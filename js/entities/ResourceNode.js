import * as THREE from 'three';
import { createToonMaterial, addOutline } from '../scene/ToonMaterials.js';

const NODE_VISUALS = {
  copper:   { color: 0xcc7733, shape: 'rock',    height: 0.6 },
  timber:   { color: 0x6b4226, shape: 'stump',   height: 0.5 },
  stone:    { color: 0x888888, shape: 'rock',    height: 0.5 },
  iron:     { color: 0x556677, shape: 'rock',    height: 0.55 },
  fiber:    { color: 0x44aa44, shape: 'plant',   height: 0.5 },
  quartz:   { color: 0xddccff, shape: 'crystal', height: 0.7 },
  silica:   { color: 0xeeddaa, shape: 'rock',    height: 0.4 },
  carbon:   { color: 0x333333, shape: 'rock',    height: 0.45 },
  gold:     { color: 0xffcc44, shape: 'crystal', height: 0.65 },
  silver:   { color: 0xccddee, shape: 'crystal', height: 0.6 },
  titanium: { color: 0x88aacc, shape: 'rock',    height: 0.6 },
  tungsten: { color: 0x445566, shape: 'rock',    height: 0.55 },
  resin:        { color: 0xaa7722, shape: 'plant',   height: 0.45 },
  ferrous_ore:  { color: 0x8b3a1a, shape: 'rock',    height: 0.55 },
  silica_sand:  { color: 0xe8d89a, shape: 'rock',    height: 0.35 },
  carbon_biomass: { color: 0x2a3d1a, shape: 'plant', height: 0.5  },
};

let nodeIdCounter = 0;

export class ResourceNode {
  constructor(scene, x, z, materialType) {
    this.id = ++nodeIdCounter;
    this.scene = scene;
    this.position = new THREE.Vector3(x, 0, z);
    this.materialType = materialType;
    this.gatherTime = 2.0; // seconds base
    this.respawnTime = 30; // seconds
    this.yieldAmount = 1;
    this.interactRadius = 2.0;
    this.collisionR = 0.3;

    this.maxRichness = 1;
    this._richness = 1;
    this._depleted = false;
    this._respawnTimer = 0;
    this._visible = true;
    this.requiredTool = null;

    this.group = new THREE.Group();
    this._buildMesh();
    scene.add(this.group);
    this.group.position.copy(this.position);
  }

  _buildMesh() {
    const visual = NODE_VISUALS[this.materialType] || NODE_VISUALS.stone;
    const mat = createToonMaterial(visual.color);
    let mesh;

    switch (visual.shape) {
      case 'crystal': {
        const geo = new THREE.OctahedronGeometry(0.35, 0);
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = visual.height;
        mesh.rotation.y = Math.random() * Math.PI;
        break;
      }
      case 'stump': {
        const geo = new THREE.CylinderGeometry(0.3, 0.35, visual.height, 8);
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = visual.height / 2;
        break;
      }
      case 'plant': {
        const geo = new THREE.ConeGeometry(0.3, visual.height, 6);
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = visual.height / 2;
        break;
      }
      default: { // rock
        const geo = new THREE.DodecahedronGeometry(0.3, 0);
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = visual.height;
        mesh.rotation.set(Math.random(), Math.random(), 0);
        break;
      }
    }

    mesh.castShadow = true;
    addOutline(mesh, 0.05);
    this.group.add(mesh);

    // Floating label indicator
    const indicatorGeo = new THREE.SphereGeometry(0.08, 6, 4);
    const indicatorMat = createToonMaterial(0x00ffcc);
    const indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
    indicator.position.y = visual.height + 0.6;
    this.group.add(indicator);
    this._indicator = indicator;
    this._baseIndicatorY = indicator.position.y;
  }

  update(delta) {
    if (this._depleted) {
      this._respawnTimer -= delta;
      if (this._respawnTimer <= 0) {
        this._depleted = false;
        this._richness = this.maxRichness;
        this.group.visible = true;
      }
      return;
    }

    // Bob the indicator
    if (this._indicator) {
      this._indicator.position.y = this._baseIndicatorY + Math.sin(Date.now() * 0.003) * 0.1;
    }
  }

  isInRange(playerPos) {
    return !this._depleted && this.position.distanceTo(playerPos) < this.interactRadius;
  }

  gather() {
    if (this._depleted) return null;
    this._richness--;
    // Show depletion visually by fading the mesh scale
    if (this._richness > 0) {
      const scale = 0.6 + 0.4 * (this._richness / this.maxRichness);
      this.group.scale.setScalar(scale);
    } else {
      this._depleted = true;
      this._respawnTimer = this.respawnTime;
      this.group.visible = false;
      this.group.scale.setScalar(1);
    }
    return { material: this.materialType, amount: this.yieldAmount };
  }

  get isDepleted() { return this._depleted; }
}
