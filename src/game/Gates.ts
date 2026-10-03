import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { plastic } from '../scene/Materials';
import { LAYOUT } from './Layout';
import type { GateSpec, LevelDef } from './Levels';
import { PhysicsWorld, FLOOR_GROUPS, SENSOR_GROUPS } from '../physics/PhysicsWorld';
import { Button } from '../entities/Button';
import { Collectible, collectibleOf } from '../entities/Collectible';
import type { Critter } from '../entities/Critter';
import { RectRegion } from '../entities/Critter';
import { Frankenstein } from '../entities/Frankenstein';
import type { Claw } from '../entities/Claw';
import type { Sfx } from '../audio/Sfx';
import { boneBetween, boneMat, skullMesh } from '../scene/Bones';
import { damp } from '../util/math';

/**
 * Gates: the different ways an island's hatch is opened. Each gate builds its
 * own static station once, spawns the items it needs every time the island
 * is set up, and reports when it is solved. The hatch opens once every gate
 * on the island is solved.
 */

/** What a gate may use from the game while it runs. */
export interface GateEnv {
  rng: () => number;
  claw: Claw;
  sfx: Sfx;
  /** Spawn an item at an island-local spot (or a free random spot when x/z are omitted). */
  spawn: (kind: string, x?: number, z?: number, y?: number) => Collectible;
  addCritter: (c: Critter) => void;
  /** Remove a collectible (eaten by the cauldron, etc.). */
  consume: (c: Collectible) => void;
  toast: (text: string, cls?: string) => void;
  /** Non-target kinds that lie around this island (cauldron recipes use them). */
  decoyKinds: string[];
  /** Picture of a kind (data URL), for in-world signs. */
  icon: (kind: string) => string | undefined;
}

/** A line in the HUD's "open the hatch" list. */
export interface GoalCard { key: string; label: string; kind?: string; icon?: string; done: boolean }

const BEAM_Y = 0.38;

export abstract class Gate {
  solved = false;
  /** Its goal list is shown from the start (no puzzle in finding out what it wants). */
  revealGoals = false;
  /** Heading for its goals when an island has more than one gate. */
  station = 'Hatch';
  onSolved: (() => void) | null = null;
  /** Something visible changed in the goal list. */
  onGoalsChanged: (() => void) | null = null;
  readonly group = new THREE.Group();
  protected readonly origin: THREE.Vector3;

  constructor(protected scene: THREE.Scene, protected phys: PhysicsWorld, protected level: LevelDef) {
    this.origin = new THREE.Vector3(level.origin.x, 0, level.origin.z);
    scene.add(this.group);
  }

  /** Banner instruction while the hatch is shut. */
  abstract get instruction(): string;
  /** Lines for the HUD goal panel. */
  abstract goals(): GoalCard[];

  /** Called every time the island is set up (fresh run, restart, replay). */
  spawn(_env: GateEnv): void {}
  reset(): void { this.solved = false; }
  /** The island just became active: show sequences, start patrols. */
  activate(_env: GateEnv): void {}
  step(_dt: number, _env: GateEnv): void {}
  poll(_dt: number, _env: GateEnv): void {}
  update(_dt: number, _t: number): void {}
  onClawBottom(_x: number, _z: number, _env: GateEnv): void {}
  /** Loose items this gate still needs on the island (refilled by the game if they go missing). */
  requiredKinds(): string[] { return []; }

  /** Debug: count this gate as solved right away. */
  forceSolve(): void { this.solve(); }

  protected solve(): void {
    if (this.solved) return;
    this.solved = true;
    this.onGoalsChanged?.();
    this.onSolved?.();
  }

  protected world(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(this.origin.x + x, 0, this.origin.z + z);
  }

  /** A static box collider (floor group) in world space. */
  protected staticBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, rotY = 0): RAPIER.Collider {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    const body = this.phys.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    return this.phys.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setCollisionGroups(FLOOR_GROUPS).setFriction(0.9), body);
  }

  protected staticCylinder(x: number, y: number, z: number, hh: number, r: number): RAPIER.Collider {
    const body = this.phys.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    return this.phys.world.createCollider(RAPIER.ColliderDesc.cylinder(hh, r).setCollisionGroups(FLOOR_GROUPS).setFriction(0.9), body);
  }

  protected sensorCylinder(x: number, y: number, z: number, hh: number, r: number): RAPIER.Collider {
    const body = this.phys.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    return this.phys.world.createCollider(RAPIER.ColliderDesc.cylinder(hh, r).setSensor(true).setCollisionGroups(SENSOR_GROUPS), body);
  }

  protected mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.group): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
}

const glow = (hex: number, i = 1.2) => plastic(hex, { emissive: hex, emissiveIntensity: i, roughness: 0.35 });

// ------------------------------------------------------------------ weight
/** The original: rest the heavy weight on the big button. */
export class WeightGate extends Gate {
  readonly button: Button;
  constructor(scene: THREE.Scene, phys: PhysicsWorld, level: LevelDef, spec: Extract<GateSpec, { kind: 'weight' }>) {
    super(scene, phys, level);
    this.station = 'Button';
    this.button = new Button(scene, phys, level.origin, { x: spec.x, z: spec.z });
    this.button.onPressed = () => this.solve();
    this.group.add(this.button.group);
  }
  get instruction(): string { return 'Rest the weight on the big button'; }
  goals(): GoalCard[] { return [{ key: 'weight', label: 'Weigh down the button', kind: 'weight', done: this.solved }]; }
  spawn(env: GateEnv): void { env.spawn('weight', this.level.weight.x, this.level.weight.z, LAYOUT.WEIGHT.y); }
  reset(): void { super.reset(); this.button.reset(); }
  step(dt: number): void { this.button.step(dt); }
  poll(dt: number): void { this.button.poll(dt); }
  update(): void { this.button.update(); }
}

// ------------------------------------------------------------------- laser
/**
 * A skull lantern shoots a beam across the island. Standing mirrors bounce
 * it; aim them by turning the claw while you hold one (the beam previews off
 * a held mirror). Light the crystal to power the hatch.
 */
export class LaserGate extends Gate {
  private mirrors: Collectible[] = [];
  private segs: THREE.Mesh[] = [];
  private crystal: THREE.Mesh;
  private crystalMat: THREE.MeshStandardMaterial;
  private charge = 0;
  private emitterPos: THREE.Vector2;
  private emitterDir: THREE.Vector2;
  private receptor: THREE.Vector2;
  private bounds: { minX: number; maxX: number; minZ: number; maxZ: number };

  constructor(scene: THREE.Scene, phys: PhysicsWorld, level: LevelDef, private spec: Extract<GateSpec, { kind: 'laser' }>) {
    super(scene, phys, level);
    this.station = 'Crystal';
    const { FENCE } = LAYOUT;
    const e = this.world(spec.emitter.x, spec.emitter.z);
    this.emitterPos = new THREE.Vector2(e.x, e.z);
    this.emitterDir = new THREE.Vector2(Math.cos(spec.emitter.dir), Math.sin(spec.emitter.dir));
    const r = this.world(spec.x, spec.z);
    this.receptor = new THREE.Vector2(r.x, r.z);
    this.bounds = { minX: this.origin.x - FENCE.hx, maxX: this.origin.x + FENCE.hx, minZ: this.origin.z - FENCE.hz, maxZ: this.origin.z + FENCE.hz };

    // Emitter: a bone post with a skull lantern, its eye glowing.
    const post = this.mesh(new THREE.CylinderGeometry(0.06, 0.08, BEAM_Y, 10), boneMat(), e.x, BEAM_Y / 2, e.z);
    post.castShadow = true;
    const skull = skullMesh(0.32, glow(0xff5577, 1.6));
    skull.position.set(e.x, BEAM_Y + 0.02, e.z);
    skull.rotation.y = Math.PI / 2 - spec.emitter.dir;
    this.group.add(skull);
    this.staticCylinder(e.x, 0.25, e.z, 0.25, 0.14);

    // Receptor: a crystal on a stone plinth.
    this.mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.24, 8), plastic(0x6b6488, { roughness: 0.8, flat: true }), r.x, 0.12, r.z);
    this.crystalMat = plastic(0xb48cff, { emissive: 0xb48cff, emissiveIntensity: 0.25, roughness: 0.15, flat: true });
    this.crystal = this.mesh(new THREE.OctahedronGeometry(0.17, 0), this.crystalMat, r.x, BEAM_Y + 0.02, r.z);
    this.crystal.scale.y = 1.5;
    this.staticCylinder(r.x, 0.25, r.z, 0.25, 0.22);

    // Beam: a pool of glowing segments.
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff6b8b, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 6), beamMat);
      s.geometry.rotateZ(Math.PI / 2);
      s.visible = false;
      this.group.add(s);
      this.segs.push(s);
    }
  }

  get instruction(): string { return 'Bounce the laser into the crystal'; }
  goals(): GoalCard[] { return [{ key: 'laser', label: `Aim ${this.spec.mirrors > 1 ? 'mirrors' : 'the mirror'} at the crystal`, kind: 'mirror', done: this.solved }]; }

  spawn(env: GateEnv): void {
    this.mirrors = [];
    for (let i = 0; i < this.spec.mirrors; i++) this.mirrors.push(env.spawn('mirror'));
  }

  reset(): void {
    super.reset();
    this.charge = 0;
  }

  /** Trace the beam through the mirrors. Returns the polyline and whether the crystal was hit (by grounded mirrors only). */
  private trace(): { pts: THREE.Vector2[]; hit: boolean; viaHeld: boolean } {
    const pts = [this.emitterPos.clone()];
    let p = this.emitterPos.clone();
    let d = this.emitterDir.clone();
    let viaHeld = false;
    let lastMirror: Collectible | null = null;
    for (let bounce = 0; bounce < 6; bounce++) {
      let bestT = this.exitT(p, d);
      let hitMirror: { c: Collectible; n: THREE.Vector2 } | null = null;
      for (const m of this.mirrors) {
        if (m.removed || m === lastMirror) continue;
        const pos = m.body.translation();
        // On the ground near beam height, or held (a live aiming preview).
        if (!m.held && Math.abs(pos.y + 0.1 - BEAM_Y) > 0.3) continue;
        const q = m.body.rotation();
        const n3 = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
        if (Math.abs(n3.y) > 0.5) continue; // tipped over
        const n = new THREE.Vector2(n3.x, n3.z).normalize();
        const tan = new THREE.Vector2(-n.y, n.x);
        const den = d.x * tan.y - d.y * tan.x;
        if (Math.abs(den) < 1e-6) continue;
        const cx = pos.x - p.x;
        const cz = pos.z - p.y;
        const t = (cx * tan.y - cz * tan.x) / den;
        const s = (cx * d.y - cz * d.x) / den;
        if (t > 1e-3 && t < bestT && Math.abs(s) < 0.2) { bestT = t; hitMirror = { c: m, n }; }
      }
      // Crystal.
      const toR = this.receptor.clone().sub(p);
      const along = toR.dot(d);
      if (along > 0 && along < bestT && toR.lengthSq() - along * along < 0.2 * 0.2) {
        pts.push(p.clone().addScaledVector(d, along));
        return { pts, hit: !viaHeld, viaHeld };
      }
      p = p.clone().addScaledVector(d, bestT);
      pts.push(p.clone());
      if (!hitMirror) break;
      if (hitMirror.c.held) viaHeld = true;
      lastMirror = hitMirror.c;
      const dn = d.dot(hitMirror.n);
      d = d.clone().addScaledVector(hitMirror.n, -2 * dn).normalize();
    }
    return { pts, hit: false, viaHeld };
  }

  private exitT(p: THREE.Vector2, d: THREE.Vector2): number {
    const b = this.bounds;
    let t = 50;
    if (d.x > 1e-6) t = Math.min(t, (b.maxX - p.x) / d.x);
    if (d.x < -1e-6) t = Math.min(t, (b.minX - p.x) / d.x);
    if (d.y > 1e-6) t = Math.min(t, (b.maxZ - p.y) / d.y);
    if (d.y < -1e-6) t = Math.min(t, (b.minZ - p.y) / d.y);
    return Math.max(0.01, t);
  }

  poll(dt: number, env: GateEnv): void {
    if (this.solved) return;
    const { hit } = this.trace();
    this.charge = hit ? this.charge + dt : Math.max(0, this.charge - dt * 2);
    if (this.charge > 0.5) {
      env.sfx.tone(880, 0.4, 'sine', 0.12, 1320);
      this.solve();
    }
  }

  update(dt: number, t: number): void {
    const { pts } = this.trace();
    this.segs.forEach((s, i) => {
      const a = pts[i];
      const b = pts[i + 1];
      s.visible = Boolean(a && b);
      if (!a || !b) return;
      const len = a.distanceTo(b);
      s.position.set((a.x + b.x) / 2, BEAM_Y, (a.y + b.y) / 2);
      s.scale.set(len, 1, 1);
      s.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
    });
    const target = this.solved ? 2.2 : 0.25 + this.charge * 2.5;
    this.crystalMat.emissiveIntensity = damp(this.crystalMat.emissiveIntensity, target, 8, dt);
    this.crystal.rotation.y = t * (this.solved ? 2.5 : 0.6);
  }
}

// --------------------------------------------------------------------- key
/** Carry the key to the lock while Frankenstein lumbers after the claw. */
export class KeyGate extends Gate {
  private key: Collectible | null = null;
  private frank: Frankenstein | null = null;
  /** Seconds he has loitered next to the lock while not chasing. */
  private campT = 0;
  private napped = false;
  private lockPos: THREE.Vector3;
  private shackle: THREE.Mesh;

  constructor(scene: THREE.Scene, phys: PhysicsWorld, level: LevelDef, private spec: Extract<GateSpec, { kind: 'key' }>) {
    super(scene, phys, level);
    this.station = 'Padlock';
    this.lockPos = this.world(spec.x, spec.z);
    const p = this.lockPos;
    const stone = plastic(0x6b6488, { roughness: 0.8 });
    this.mesh(new RoundedBoxGeometry(0.6, 0.3, 0.6, 3, 0.05), stone, p.x, 0.15, p.z);
    const gold = plastic(0xffcf4a, { roughness: 0.3, metalness: 0.5 });
    this.mesh(new RoundedBoxGeometry(0.34, 0.28, 0.16, 3, 0.04), gold, p.x, 0.44, p.z);
    this.shackle = this.mesh(new THREE.TorusGeometry(0.11, 0.03, 10, 24, Math.PI), plastic(0xc0c6d4, { roughness: 0.3, metalness: 0.6 }), p.x, 0.58, p.z);
    this.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), plastic(0x231a2b), p.x, 0.46, p.z + 0.08).rotation.x = Math.PI / 2;
    this.staticBox(p.x, 0.15, p.z, 0.3, 0.15, 0.3);
  }

  get instruction(): string { return 'Bring the key to the lock'; }
  goals(): GoalCard[] { return [{ key: 'key', label: 'Unlock the padlock', kind: 'gatekey', done: this.solved }]; }

  spawn(env: GateEnv): void {
    this.key = env.spawn('gatekey', this.spec.key.x, this.spec.key.z, 0.6);
    const o = this.level.origin;
    const { FENCE } = LAYOUT;
    // He roams the whole pen but never picks a stroll that ends by the lock,
    // so he can't camp it (he still walks past, and chases anywhere).
    const region = new RectRegion(o.x, o.z, FENCE.hx - 0.45, FENCE.hz - 0.45, [{ x: this.lockPos.x, z: this.lockPos.z, r: 1.5 }]);
    const tx = o.x - this.lockPos.x;
    const tz = o.z - this.lockPos.z;
    const tl = Math.hypot(tx, tz) || 1;
    const start = { x: this.lockPos.x + (tx / tl) * 2, z: this.lockPos.z + (tz / tl) * 2 };
    this.frank = new Frankenstein(this.scene, this.phys, start, env.rng, this.level, region);
    this.frank.onReach = () => this.onFrankReach(env);
    this.frank.onNap = () => {
      env.sfx.tone(90, 0.6, 'sine', 0.08, 70);
      if (!this.napped) env.toast('Frankenstein dozed off…');
      this.napped = true;
    };
    this.campT = 0;
    this.napped = false;
    env.addCritter(this.frank);
  }

  reset(): void {
    super.reset();
    this.shackle.position.y = 0.58;
    this.shackle.rotation.y = 0;
  }

  private onFrankReach(env: GateEnv): void {
    const f = this.frank;
    if (!f) return;
    if (env.claw.held === this.key) {
      env.claw.knockOff();
      env.toast('Frankenstein snatched the key!', 'bad');
      env.sfx.tone(110, 0.4, 'sawtooth', 0.14, 70);
      f.dizzy = 3;
      // Stagger well away so the dropped key isn't left under his nose.
      f.stopCharge(2.6);
      return;
    }
    f.stopCharge();
  }

  step(dt: number, env: GateEnv): void {
    const f = this.frank;
    if (!f || f.removed || this.solved) return;
    const carrying = env.claw.held !== null && env.claw.held === this.key;
    if (carrying && !f.charging && f.dizzy <= 0 && f.asleep <= 0) f.chargeAt(() => env.claw.pos, 1.25);
    else if (!carrying && f.charging) f.stopCharge();
    // Never let him park by the lock: after a few seconds there, send him off.
    const p = f.position;
    const near = Math.hypot(p.x - this.lockPos.x, p.z - this.lockPos.z) < 1.2;
    this.campT = near && !f.charging && f.asleep <= 0 ? this.campT + dt : 0;
    if (this.campT > 3) {
      this.campT = 0;
      f.wander();
    }
  }

  poll(_dt: number, env: GateEnv): void {
    const k = this.key;
    if (this.solved || !k || k.removed || k.held) return;
    const p = k.body.translation();
    if (Math.hypot(p.x - this.lockPos.x, p.z - this.lockPos.z) < 0.5 && p.y < 1.0) {
      env.consume(k);
      env.sfx.tone(660, 0.12, 'square', 0.1, 990);
      env.sfx.tone(990, 0.2, 'triangle', 0.1, 1320, 0.12);
      this.frank?.dispose();
      this.solve();
    }
  }

  update(dt: number): void {
    if (this.solved) {
      this.shackle.position.y = damp(this.shackle.position.y, 0.7, 6, dt);
      this.shackle.rotation.y = damp(this.shackle.rotation.y, 1.2, 6, dt);
    }
  }
}

// ---------------------------------------------------------------- cauldron
/** Drop the recipe's ingredients into the cauldron; anything else gets spat out. */
export class CauldronGate extends Gate {
  private recipe: string[] = [];
  private added = new Set<string>();
  private sensor: RAPIER.Collider;
  private brewMat: THREE.MeshStandardMaterial;
  private bubbles: THREE.Mesh[] = [];
  private spitCooldown = new Map<number, number>();
  private pos: THREE.Vector3;
  private readonly R = 0.44;
  private readonly TOP = 0.62;
  /** The recipe, floating over the pot as a speech bubble of ingredient pictures. */
  private sign: THREE.Sprite;
  private signCanvas = document.createElement('canvas');
  private signTex: THREE.CanvasTexture;
  private signIcons: (HTMLImageElement | null)[] = [];

  constructor(scene: THREE.Scene, phys: PhysicsWorld, level: LevelDef, spec: Extract<GateSpec, { kind: 'cauldron' }>) {
    super(scene, phys, level);
    this.station = 'Cauldron';
    this.pos = this.world(spec.x, spec.z);
    const p = this.pos;
    const iron = plastic(0x2a2433, { roughness: 0.45, metalness: 0.3 });
    const pot = this.mesh(new THREE.SphereGeometry(this.R + 0.06, 24, 16, 0, Math.PI * 2, Math.PI * 0.22, Math.PI * 0.78), iron, p.x, 0.38, p.z);
    pot.scale.y = 0.85;
    const rim = this.mesh(new THREE.TorusGeometry(this.R - 0.02, 0.06, 10, 32), iron, p.x, this.TOP, p.z);
    rim.rotation.x = Math.PI / 2;
    this.brewMat = plastic(0x8ff0c0, { emissive: 0x3fbf8a, emissiveIntensity: 0.9, roughness: 0.3 });
    const brew = this.mesh(new THREE.CircleGeometry(this.R - 0.05, 28), this.brewMat, p.x, this.TOP - 0.03, p.z);
    brew.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      this.mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.16, 8), iron, p.x + Math.cos(a) * 0.3, 0.06, p.z + Math.sin(a) * 0.3);
    }
    const fire = glow(0xff9a3c, 1.4);
    for (let i = 0; i < 5; i++) this.mesh(new THREE.ConeGeometry(0.06, 0.16, 6), fire, p.x - 0.2 + i * 0.1, 0.08, p.z + 0.32 - (i % 2) * 0.06);
    const bubbleMat = glow(0xd9fff0, 0.8);
    for (let i = 0; i < 5; i++) {
      const b = this.mesh(new THREE.SphereGeometry(0.04 + (i % 3) * 0.015, 10, 8), bubbleMat, p.x, this.TOP, p.z);
      this.bubbles.push(b);
    }
    // Solid body; the sensor sits on the brew so anything dropped in is judged.
    this.staticCylinder(p.x, this.TOP / 2 - 0.02, p.z, this.TOP / 2 - 0.02, this.R);
    this.sensor = this.sensorCylinder(p.x, this.TOP + 0.22, p.z, 0.22, this.R - 0.04);
    this.revealGoals = true;
    this.signTex = new THREE.CanvasTexture(this.signCanvas);
    this.signTex.colorSpace = THREE.SRGBColorSpace;
    this.sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.signTex, transparent: true, toneMapped: false, fog: false }));
    this.sign.renderOrder = 5;
    this.sign.visible = false;
    this.group.add(this.sign);
  }

  /** Redraw the recipe bubble: one picture per ingredient, ticked once it is in the pot. */
  private drawSign(): void {
    const n = this.recipe.length;
    if (n === 0) { this.sign.visible = false; return; }
    const cell = 112;
    const pad = 22;
    const w = pad * 2 + n * cell + (n - 1) * 10;
    const h = cell + pad * 2 + 26;
    const cv = this.signCanvas;
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d')!;
    const bh = h - 26;
    // Bubble with a little tail pointing down at the pot.
    g.fillStyle = '#fbf6ff';
    g.strokeStyle = '#3b2a4a';
    g.lineWidth = 7;
    g.beginPath();
    g.roundRect(4, 4, w - 8, bh - 8, 34);
    g.moveTo(w / 2 - 20, bh - 5);
    g.lineTo(w / 2, h - 4);
    g.lineTo(w / 2 + 20, bh - 5);
    g.fill();
    g.stroke();
    g.fillStyle = '#fbf6ff';
    g.fillRect(w / 2 - 17, bh - 12, 34, 9);
    this.recipe.forEach((kind, i) => {
      const x = pad + i * (cell + 10);
      const y = pad - 4;
      const done = this.added.has(kind);
      g.fillStyle = done ? '#d6f5df' : '#efe6ff';
      g.beginPath();
      g.roundRect(x, y, cell, cell, 22);
      g.fill();
      const img = this.signIcons[i];
      g.globalAlpha = done ? 0.35 : 1;
      if (img && img.complete && img.naturalWidth) g.drawImage(img, x + 6, y + 6, cell - 12, cell - 12);
      g.globalAlpha = 1;
      if (done) {
        g.fillStyle = '#4caf6a';
        g.beginPath();
        g.arc(x + cell - 24, y + cell - 24, 22, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#fff';
        g.lineWidth = 7;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x + cell - 34, y + cell - 24);
        g.lineTo(x + cell - 26, y + cell - 16);
        g.lineTo(x + cell - 13, y + cell - 32);
        g.stroke();
      }
    });
    this.signTex.needsUpdate = true;
    const height = 1.0;
    this.sign.scale.set((height * w) / h, height, 1);
    this.sign.visible = !this.solved;
  }

  get instruction(): string { return 'Brew the potion: drop in the ingredients'; }
  requiredKinds(): string[] { return this.solved ? [] : this.recipe.filter((k) => !this.added.has(k)); }
  goals(): GoalCard[] {
    return this.recipe.map((k) => ({ key: `cauldron:${k}`, label: k, kind: k, done: this.added.has(k) }));
  }

  spawn(env: GateEnv): void {
    // A cauldron in the cauldron would be confusing: leave the little pickup out of recipes.
    const pool = env.decoyKinds.filter((k) => k !== 'cauldron');
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(env.rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.recipe = pool.slice(0, Math.min(3, pool.length));
    this.added.clear();
    this.signIcons = this.recipe.map((k) => {
      const src = env.icon(k);
      if (!src) return null;
      const img = new Image();
      img.onload = () => this.drawSign();
      img.src = src;
      return img;
    });
    this.drawSign();
  }

  reset(): void {
    super.reset();
    this.added.clear();
    this.spitCooldown.clear();
    this.drawSign();
  }

  poll(_dt: number, env: GateEnv): void {
    const now = performance.now();
    this.phys.world.intersectionPairsWith(this.sensor, (other) => {
      const c = collectibleOf(other.parent());
      if (!c || c.removed || c.held) return;
      if (!this.solved && this.recipe.includes(c.kind) && !this.added.has(c.kind)) {
        this.added.add(c.kind);
        env.consume(c);
        env.sfx.tone(300, 0.25, 'sine', 0.14, 600);
        env.sfx.tone(500, 0.2, 'sine', 0.1, 900, 0.1);
        env.toast(`${c.def.name} in the pot!`, 'good');
        this.drawSign();
        this.onGoalsChanged?.();
        if (this.added.size >= this.recipe.length) this.solve();
        return;
      }
      // Not on the recipe, already in, or the potion is done: BLURP, out it goes.
      const handle = c.body.handle;
      if ((this.spitCooldown.get(handle) ?? 0) > now) return;
      this.spitCooldown.set(handle, now + 800);
      const p = c.body.translation();
      const dx = p.x - this.pos.x || 0.3;
      const dz = p.z - this.pos.z || 0.3;
      const l = Math.hypot(dx, dz) || 1;
      c.body.setLinvel({ x: (dx / l) * 2.2, y: 3.2, z: (dz / l) * 2.2 + 0.6 }, true);
      env.sfx.tone(140, 0.25, 'sawtooth', 0.12, 80);
      env.toast(GOURDS.includes(c.kind) ? 'Pumpkins go on the scale! Blurp.' : this.solved ? 'The potion is done! Blurp.' : 'Not in the recipe! Blurp.', 'bad');
    });
  }

  update(dt: number, t: number): void {
    this.bubbles.forEach((b, i) => {
      const ph = (t * (0.6 + i * 0.13) + i * 0.37) % 1;
      const a = i * 2.4 + t * 0.3;
      b.position.set(this.pos.x + Math.cos(a) * 0.22 * (i % 2 ? 1 : 0.5), this.TOP + ph * (this.solved ? 0.8 : 0.3), this.pos.z + Math.sin(a) * 0.22);
      b.scale.setScalar(1 - ph * 0.6);
    });
    if (this.sign.visible) {
      // Over the pot, nudged toward the middle of the island so it stays on screen.
      const o = this.origin;
      this.sign.position.set(this.pos.x + (o.x - this.pos.x) * 0.15, 1.8 + Math.sin(t * 1.8) * 0.05, this.pos.z + (o.z - this.pos.z) * 0.15);
      if (this.solved) {
        const k = Math.max(0, this.sign.material.opacity - dt * 2);
        this.sign.material.opacity = k;
        if (k === 0) this.sign.visible = false;
      } else this.sign.material.opacity = 1;
    }
    const target = this.solved ? 0xffcf4a : [0x8ff0c0, 0xb48cff, 0xff7fb0, 0xffcf4a][this.added.size] ?? 0x8ff0c0;
    this.brewMat.color.lerp(new THREE.Color(target), 1 - Math.exp(-dt * 3));
    this.brewMat.emissive.lerp(new THREE.Color(target).multiplyScalar(0.6), 1 - Math.exp(-dt * 3));
  }
}

// ------------------------------------------------------------------- scale
const GOURDS = ['gourd1', 'gourd2', 'gourd3'];

/** How much bigger the scale is than its original sculpt (room for a couple of big pumpkins). */
const SCALE_SIZE = 1.5;

/**
 * Load the pan with two pumpkins whose pips add up to the counterweight's.
 * Once balanced it has done its job: it vanishes in a puff of smoke and
 * leaves the pumpkins behind.
 */
export class ScaleGate extends Gate {
  private target = 4;
  private load = 0;
  private stable = 0;
  /** Everything visible of the scale, built at the original size and scaled up. */
  private rig = new THREE.Group();
  private beam: THREE.Group;
  private pips: THREE.Mesh[] = [];
  private sensor: RAPIER.Collider;
  private solids: RAPIER.Collider[] = [];
  private leftPan: THREE.Group;
  private rightPan: THREE.Group;
  private needleMat: THREE.MeshStandardMaterial;
  private pos: THREE.Vector3;
  private sfx: Sfx | null = null;
  /** Seconds until it goes poof (after being balanced); negative when not pending. */
  private vanishT = -1;
  private puffs: { m: THREE.Mesh; mat: THREE.MeshStandardMaterial; v: THREE.Vector3; life: number }[] = [];

  constructor(scene: THREE.Scene, phys: PhysicsWorld, level: LevelDef, spec: Extract<GateSpec, { kind: 'scale' }>) {
    super(scene, phys, level);
    this.station = 'Scale';
    this.pos = this.world(spec.x, spec.z);
    const p = this.pos;
    const S = SCALE_SIZE;
    this.rig.position.copy(p);
    this.rig.scale.setScalar(S);
    this.group.add(this.rig);
    const r = this.rig;
    const wood = plastic(0x5a3f6e, { roughness: 0.7 });
    const brass = plastic(0xffcf4a, { roughness: 0.3, metalness: 0.5 });
    this.mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.1, 16), wood, 0, 0.05, 0, r);
    this.mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 10), wood, 0, 0.45, 0, r);
    this.beam = new THREE.Group();
    this.beam.position.set(0, 0.85, 0);
    this.mesh(new THREE.BoxGeometry(1.0, 0.06, 0.08), brass, 0, 0, 0, this.beam);
    this.needleMat = glow(0xff5577, 0.6);
    this.mesh(new THREE.ConeGeometry(0.035, 0.25, 8), this.needleMat, 0, 0.15, 0.05, this.beam);
    r.add(this.beam);
    // Dial behind the needle: green zone in the middle.
    this.mesh(new THREE.CircleGeometry(0.22, 24, 0, Math.PI), plastic(0xf6ecd4, { roughness: 0.6 }), 0, 0.88, -0.02, r);
    this.mesh(new THREE.CircleGeometry(0.2, 12, Math.PI / 2 - 0.18, 0.36), plastic(0x6fbf5a), 0, 0.881, -0.015, r);

    const pan = (side: number) => {
      const g = new THREE.Group();
      g.position.set(side * 0.45, 0.32, 0);
      this.mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.05, 24), brass, 0, 0, 0, g);
      const rim = this.mesh(new THREE.TorusGeometry(0.33, 0.025, 8, 28), brass, 0, 0.03, 0, g);
      rim.rotation.x = Math.PI / 2;
      for (const sx of [-1, 1]) {
        const chain = this.mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 4), plastic(0x8d93a8, { metalness: 0.6 }), sx * 0.2, 0.28, 0, g);
        chain.rotation.z = sx * 0.35;
      }
      r.add(g);
      return g;
    };
    this.leftPan = pan(-1);
    this.rightPan = pan(1);
    // Counterweight: an iron block with glowing pips showing its weight.
    this.mesh(new RoundedBoxGeometry(0.3, 0.24, 0.24, 3, 0.04), plastic(0x3a3346, { roughness: 0.4, metalness: 0.3 }), 0, 0.15, 0, this.leftPan);
    for (let i = 0; i < 6; i++) {
      const pip = this.mesh(new THREE.SphereGeometry(0.025, 8, 6), glow(0xffcf4a, 1.2), 0, 0.18, 0.125, this.leftPan);
      pip.scale.z = 0.4;
      this.pips.push(pip);
    }
    // Colliders (world space, scaled to match): post, left pan with the block, right pan plus a low rim.
    const lx = p.x - 0.45 * S;
    const rx = p.x + 0.45 * S;
    this.solids.push(
      this.staticCylinder(p.x, 0.4 * S, p.z, 0.4 * S, 0.07 * S),
      this.staticCylinder(lx, 0.32 * S, p.z, 0.04 * S, 0.34 * S),
      this.staticBox(lx, 0.47 * S, p.z, 0.15 * S, 0.12 * S, 0.12 * S),
      this.staticCylinder(rx, 0.32 * S, p.z, 0.04 * S, 0.34 * S),
    );
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.solids.push(this.staticBox(rx + Math.cos(a) * 0.34 * S, 0.4 * S, p.z + Math.sin(a) * 0.34 * S, 0.1 * S, 0.05 * S, 0.02 * S, -a + Math.PI / 2));
    }
    this.sensor = this.sensorCylinder(rx, 0.62 * S, p.z, 0.26 * S, 0.33 * S);
  }

  get instruction(): string { return 'Balance the scale with 2 pumpkins'; }
  goals(): GoalCard[] { return [{ key: 'scale', label: `2 pumpkins, ${this.target} pips`, icon: 'scale', done: this.solved }]; }

  spawn(env: GateEnv): void {
    this.sfx = env.sfx;
    // Pumpkins carry 1, 2 and 3 pips: 3..5 is always exactly two of them.
    this.target = 3 + Math.floor(env.rng() * 3);
    this.pips.forEach((pip, i) => {
      pip.visible = i < this.target;
      pip.position.x = (i - (this.target - 1) / 2) * 0.05;
    });
    for (const k of [...GOURDS, GOURDS[Math.floor(env.rng() * 2)]]) env.spawn(k);
    this.load = 0;
  }

  reset(): void {
    super.reset();
    this.stable = 0;
    this.load = 0;
    this.vanishT = -1;
    this.rig.visible = true;
    for (const c of this.solids) c.setEnabled(true);
    this.sensor.setEnabled(true);
    for (const pf of this.puffs) this.group.remove(pf.m);
    this.puffs = [];
  }

  poll(dt: number, env: GateEnv): void {
    if (this.solved) return;
    let load = 0;
    this.phys.world.intersectionPairsWith(this.sensor, (other) => {
      const c = collectibleOf(other.parent());
      if (!c || c.removed || c.held || !GOURDS.includes(c.kind)) return;
      const v = c.body.linvel();
      if (Math.hypot(v.x, v.y, v.z) < 0.5) load += c.def.mass;
    });
    this.load = load;
    this.stable = load === this.target ? this.stable + dt : 0;
    if (this.stable > 0.8) {
      env.sfx.tone(523, 0.15, 'triangle', 0.12);
      env.sfx.tone(784, 0.25, 'triangle', 0.12, undefined, 0.12);
      this.vanishT = 1.0;
      this.solve();
    }
  }

  /** Its job is done: a puff of smoke, and only the pumpkins are left. */
  private poof(): void {
    this.rig.visible = false;
    for (const c of this.solids) c.setEnabled(false);
    this.sensor.setEnabled(false);
    this.sfx?.tone(220, 0.35, 'sine', 0.12, 90);
    this.sfx?.tone(900, 0.2, 'triangle', 0.05, 300, 0.05);
    const S = SCALE_SIZE;
    for (let i = 0; i < 22; i++) {
      const mat = plastic(i % 3 ? 0xe9e2f5 : 0xc9b8ea, { roughness: 0.9 }).clone();
      mat.transparent = true;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.12 + (i % 4) * 0.04, 10, 8), mat);
      const a = (i / 22) * Math.PI * 2 + Math.random() * 0.4;
      const along = (Math.random() * 2 - 1) * 0.55 * S;
      m.position.set(this.pos.x + along, 0.25 + Math.random() * 0.7 * S, this.pos.z + Math.sin(a) * 0.25);
      m.castShadow = false;
      this.group.add(m);
      this.puffs.push({ m, mat, v: new THREE.Vector3(Math.cos(a) * 0.9, 0.5 + Math.random() * 0.6, Math.sin(a) * 0.9), life: 0 });
    }
  }

  update(dt: number): void {
    if (this.vanishT > 0) {
      this.vanishT -= dt;
      if (this.vanishT <= 0) { this.vanishT = -1; this.poof(); }
    }
    if (this.puffs.length) {
      for (const pf of this.puffs) {
        pf.life += dt;
        pf.m.position.addScaledVector(pf.v, dt);
        pf.v.multiplyScalar(1 - Math.min(1, dt * 2.5));
        pf.m.scale.setScalar(1 + pf.life * 2.2);
        pf.mat.opacity = Math.max(0, 1 - pf.life / 0.9);
      }
      this.puffs = this.puffs.filter((pf) => {
        if (pf.life < 0.9) return true;
        this.group.remove(pf.m);
        pf.m.geometry.dispose();
        pf.mat.dispose();
        return false;
      });
    }
    if (!this.rig.visible) return;
    const diff = this.solved ? 0 : this.load - this.target;
    const tilt = Math.max(-0.28, Math.min(0.28, diff * 0.09));
    this.beam.rotation.z = damp(this.beam.rotation.z, -tilt, 5, dt);
    const lift = Math.sin(this.beam.rotation.z) * 0.45;
    this.leftPan.position.y = 0.32 + lift * 0.4;
    this.rightPan.position.y = 0.32 - lift * 0.4;
    this.needleMat.emissive.setHex(this.solved || diff === 0 ? 0x6fbf5a : 0xff5577);
  }
}

// ------------------------------------------------------------------- bells
const BELL_NOTES = [523.25, 659.25, 783.99, 1046.5];

/** Four tombstones chime a pattern; ring their bells in the same order by touching down on them. */
export class BellsGate extends Gate {
  private seq: number[] = [];
  private progress = 0;
  private stones: {
    pos: THREE.Vector3;
    gem: THREE.MeshStandardMaterial;
    ring: THREE.MeshStandardMaterial;
    bell: THREE.Group;
    wave: THREE.Mesh;
    waveMat: THREE.MeshStandardMaterial;
  }[] = [];
  private flash: number[] = [0, 0, 0, 0];
  private show: { i: number; at: number }[] = [];
  private clock = 0;
  private idle = 0;

  constructor(scene: THREE.Scene, phys: PhysicsWorld, level: LevelDef, spec: Extract<GateSpec, { kind: 'bells' }>) {
    super(scene, phys, level);
    this.station = 'Bells';
    const stone = plastic(0xb3add0, { roughness: 0.85 });
    const carved = plastic(0x8f88b0, { roughness: 0.9 });
    const dirt = plastic(0x5a4a6e, { roughness: 0.95 });
    const bronze = plastic(0xe0ad4a, { roughness: 0.28, metalness: 0.6 });
    const bone = boneMat();
    const colours = [0xff7fb0, 0x8ff0c0, 0xffcf4a, 0xb48cff];
    // A chunky toy bell: flared lip, rounded crown.
    const bellGeo = new THREE.LatheGeometry([
      [0.001, 0.0], [0.05, -0.005], [0.085, -0.04], [0.095, -0.1], [0.11, -0.16], [0.145, -0.2], [0.15, -0.215], [0.13, -0.215], [0.001, -0.2],
    ].map(([x, y]) => new THREE.Vector2(x, y)), 28);
    for (let i = 0; i < 4; i++) {
      const o = (i - 1.5) * 0.72;
      const pos = spec.along === 'z' ? this.world(spec.x, spec.z + o) : this.world(spec.x + o, spec.z);
      const g = new THREE.Group();
      g.position.copy(pos);
      g.rotation.z = (i % 2 ? 1 : -1) * 0.04;
      this.group.add(g);
      const col = colours[i];
      // Grave mound and a glowing ring marking where to touch down.
      this.mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.06, 24), dirt, 0, 0.03, 0, g);
      const ring = glow(col, 0.35);
      this.mesh(new THREE.TorusGeometry(0.34, 0.025, 8, 36), ring, 0, 0.05, 0, g).rotation.x = Math.PI / 2;
      // Tombstone with a rounded top, a carved inset and a cross.
      const h = 0.4 + (i % 2) * 0.05;
      this.mesh(new RoundedBoxGeometry(0.38, h, 0.15, 3, 0.04), stone, 0, 0.06 + h / 2, 0, g);
      this.mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.15, 24, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), stone, 0, 0.06 + h, 0, g);
      this.mesh(new RoundedBoxGeometry(0.28, h * 0.62, 0.02, 2, 0.008), carved, 0, 0.06 + h * 0.5, 0.075, g);
      this.mesh(new THREE.BoxGeometry(0.035, 0.12, 0.02), carved, 0, 0.06 + h + 0.06, 0.076, g);
      this.mesh(new THREE.BoxGeometry(0.09, 0.03, 0.02), carved, 0, 0.06 + h + 0.08, 0.076, g);
      // Big glowing gem in the middle of the slab.
      const gem = plastic(col, { emissive: col, emissiveIntensity: 0.25, roughness: 0.2 });
      const gm = this.mesh(new THREE.OctahedronGeometry(0.075, 0), gem, 0, 0.06 + h * 0.5, 0.09, g);
      gm.scale.set(1, 1.2, 0.5);
      // Bone belfry over the stone; the bell hangs from its crossbar.
      const top = 0.06 + h + 0.48;
      for (const sx of [-1, 1]) g.add(boneBetween(new THREE.Vector3(sx * 0.24, 0.04, -0.03), new THREE.Vector3(sx * 0.21, top, -0.03), 0.03, bone));
      g.add(boneBetween(new THREE.Vector3(-0.27, top, -0.03), new THREE.Vector3(0.27, top, -0.03), 0.03, bone));
      const bell = new THREE.Group();
      bell.position.set(0, top - 0.02, 0.02);
      this.mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12), bronze, 0, 0.005, 0, bell);
      this.mesh(bellGeo, bronze, 0, -0.01, 0, bell);
      this.mesh(new THREE.SphereGeometry(0.035, 10, 8), bronze, 0, -0.205, 0, bell);
      this.mesh(new THREE.TorusGeometry(0.135, 0.012, 6, 28), glow(col, 0.5), 0, -0.185, 0, bell).rotation.x = Math.PI / 2;
      g.add(bell);
      // A ripple of sound that spreads from the bell when it rings.
      const waveMat = glow(col, 1.2);
      waveMat.transparent = true;
      waveMat.opacity = 0;
      const wave = this.mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 32), waveMat, 0, top - 0.15, 0.02, g);
      wave.castShadow = false;
      wave.rotation.x = Math.PI / 2;
      // Solid up to the crossbar, so the claw touches down on the belfry.
      this.staticBox(pos.x, top / 2, pos.z, 0.22, top / 2 + 0.03, 0.1);
      this.stones.push({ pos, gem, ring, bell, wave, waveMat });
    }
  }

  get instruction(): string { return 'Ring the bells in the order they glow'; }
  goals(): GoalCard[] {
    return [{ key: 'bells', label: `Ring the pattern (${Math.min(this.progress, this.seq.length)}/${this.seq.length})`, kind: 'candle', done: this.solved }];
  }

  spawn(env: GateEnv): void {
    this.seq = [];
    for (let i = 0; i < 4; i++) {
      let n = Math.floor(env.rng() * 4);
      if (n === this.seq[i - 1]) n = (n + 1 + Math.floor(env.rng() * 3)) % 4;
      this.seq.push(n);
    }
    this.progress = 0;
  }

  reset(): void {
    super.reset();
    this.progress = 0;
    this.show = [];
    this.flash = [0, 0, 0, 0];
  }

  activate(): void {
    this.playPattern(0.8);
  }

  private playPattern(delay: number): void {
    this.show = this.seq.map((i, k) => ({ i, at: this.clock + delay + k * 0.7 }));
    this.idle = 0;
  }

  private ring(i: number, sfx: Sfx, loud = true): void {
    this.flash[i] = 1;
    sfx.tone(BELL_NOTES[i], 0.6, 'sine', loud ? 0.16 : 0.1);
    sfx.tone(BELL_NOTES[i] * 2.76, 0.25, 'sine', 0.04);
  }

  onClawBottom(x: number, z: number, env: GateEnv): void {
    if (this.solved) return;
    const i = this.stones.findIndex((s) => Math.hypot(s.pos.x - x, s.pos.z - z) < 0.42);
    if (i < 0) return;
    this.ring(i, env.sfx);
    this.show = [];
    this.idle = 0;
    if (this.seq[this.progress] === i) {
      this.progress++;
      this.onGoalsChanged?.();
      if (this.progress >= this.seq.length) this.solve();
    } else {
      this.progress = 0;
      this.onGoalsChanged?.();
      env.sfx.tone(160, 0.3, 'square', 0.1, 110, 0.15);
      env.toast('Wrong bell! Listen again...', 'bad');
      this.playPattern(1.0);
    }
  }

  step(dt: number, env: GateEnv): void {
    this.clock += dt;
    if (this.solved) return;
    while (this.show.length && this.show[0].at <= this.clock) this.ring(this.show.shift()!.i, env.sfx, false);
    // Forgot it? It plays again after a quiet spell.
    this.idle += dt;
    if (this.idle > 12 && this.show.length === 0 && this.progress === 0) this.playPattern(0.2);
  }

  update(dt: number, t: number): void {
    this.stones.forEach((s, i) => {
      this.flash[i] = Math.max(0, this.flash[i] - dt * 1.6);
      const f = this.flash[i];
      s.gem.emissiveIntensity = (this.solved ? 1.0 : 0.25) + f * 2.4;
      s.ring.emissiveIntensity = (this.solved ? 0.9 : 0.35 + Math.sin(t * 2 + i) * 0.1) + f * 1.6;
      s.bell.rotation.z = Math.sin(t * 16) * 0.45 * f;
      s.bell.rotation.x = Math.cos(t * 13) * 0.15 * f;
      // The ripple grows outward and fades as the ring dies down.
      s.waveMat.opacity = f > 0 ? f * 0.9 : 0;
      s.wave.visible = f > 0;
      s.wave.scale.setScalar(1 + (1 - f) * 2.2);
    });
  }
}

export function createGate(scene: THREE.Scene, phys: PhysicsWorld, level: LevelDef, spec: GateSpec): Gate {
  switch (spec.kind) {
    case 'weight': return new WeightGate(scene, phys, level, spec);
    case 'laser': return new LaserGate(scene, phys, level, spec);
    case 'key': return new KeyGate(scene, phys, level, spec);
    case 'cauldron': return new CauldronGate(scene, phys, level, spec);
    case 'scale': return new ScaleGate(scene, phys, level, spec);
    case 'bells': return new BellsGate(scene, phys, level, spec);
  }
}
