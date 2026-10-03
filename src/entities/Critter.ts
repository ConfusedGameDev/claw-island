import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { LAYOUT } from '../game/Layout';
import { PhysicsWorld, CHICKEN_GROUPS } from '../physics/PhysicsWorld';
import type { Grabbable, GrabbableUserData, GrabDef } from './Grabbable';
import type { LevelDef } from '../game/Levels';
import { clamp, randRange } from '../util/math';

/** Something to keep clear of; soft ones (loose prizes, other critters) can be shouldered past when boxed in. */
export interface Obstacle { x: number; z: number; r: number; soft?: boolean }

/** Where a critter is allowed to roam (world space). */
export interface Region {
  random(rng: () => number): { x: number; z: number };
  clamp(x: number, z: number): { x: number; z: number };
}

/** A rectangle minus some circular no-go zones. */
export class RectRegion implements Region {
  constructor(
    private cx: number, private cz: number, private hx: number, private hz: number,
    private avoid: Obstacle[] = [],
  ) {}
  random(rng: () => number): { x: number; z: number } {
    for (let i = 0; i < 16; i++) {
      const x = this.cx + randRange(rng, -this.hx, this.hx);
      const z = this.cz + randRange(rng, -this.hz, this.hz);
      if (this.avoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue;
      return { x, z };
    }
    return { x: this.cx, z: this.cz };
  }
  clamp(x: number, z: number): { x: number; z: number } {
    return { x: clamp(x, this.cx - this.hx, this.cx + this.hx), z: clamp(z, this.cz - this.hz, this.cz + this.hz) };
  }
}

export class EllipseRegion implements Region {
  constructor(private cx: number, private cz: number, private rx: number, private rz: number) {}
  random(rng: () => number): { x: number; z: number } {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng());
    return { x: this.cx + Math.cos(a) * this.rx * r, z: this.cz + Math.sin(a) * this.rz * r };
  }
  clamp(x: number, z: number): { x: number; z: number } {
    const dx = (x - this.cx) / this.rx;
    const dz = (z - this.cz) / this.rz;
    const d = Math.hypot(dx, dz);
    if (d <= 1) return { x, z };
    return { x: this.cx + (dx / d) * this.rx, z: this.cz + (dz / d) * this.rz };
  }
}

export type CritterState = 'WANDER' | 'IDLE' | 'HELD' | 'FALLING' | 'FLEE' | 'FREEZE' | 'CHARGE' | 'GONE';

export interface CritterOpts {
  kind: string;
  name: string;
  def: GrabDef;
  /** Height of the body origin above the ground. */
  bodyY: number;
  walkSpeed: number;
  fleeSpeed: number;
  radius: number;
  /** Seconds after which it wriggles free of the claw. */
  escapeAfter: number;
  idleTime: [number, number];
  isTarget?: boolean;
  /** Extra yaw between the mesh's front and its direction of travel (crabs walk sideways). */
  headingOffset?: number;
  /** Ground height under a point (world space); defaults to flat ground. */
  groundY?: (x: number, z: number) => number;
  /** Whether a descending claw makes it freeze in place (prey does, guards don't). */
  freezes?: boolean;
}

/**
 * A small kinematic creature: wanders a region, pauses, freezes under a
 * descending claw, can be picked up, wriggles free, and falls into an open
 * hole if dropped over it.
 */
export abstract class Critter implements Grabbable {
  readonly kind: string;
  readonly name: string;
  readonly def: GrabDef;
  readonly escapeAfter: number;
  readonly isTarget: boolean;
  readonly body: RAPIER.RigidBody;
  readonly mesh = new THREE.Group();
  removed = false;
  held = false;
  delivered = false;
  /** Set once it has dropped through the open hatch. */
  fellInHole = false;
  state: CritterState = 'IDLE';
  onSquawk: (() => void) | null = null;
  onChatter: (() => void) | null = null;
  /** Fired once when a charging critter reaches its target. */
  onReach: (() => void) | null = null;

  protected pos = new THREE.Vector3();
  protected heading = 0;
  protected walkPhase = 0;
  protected stateT = 0;
  private target = { x: 0, z: 0 };
  private stateDur = 1;
  private lastObstacles: Obstacle[] = [];
  private chargeTarget: (() => { x: number; z: number }) | null = null;
  private chargeSpeed = 2.5;
  private reached = false;
  private progressT = 0;
  private progressPos = new THREE.Vector2();
  private stuckStrikes = 0;
  /** Seconds left of shoving through soft obstacles after getting boxed in. */
  private bargeT = 0;
  private bestDist = Infinity;
  private bestT = 0;
  private fallVel = new THREE.Vector3();
  private fleeDir = new THREE.Vector2(1, 0);
  private readonly opts: CritterOpts;

  constructor(
    scene: THREE.Scene,
    private phys: PhysicsWorld,
    start: { x: number; z: number },
    protected rng: () => number,
    protected level: LevelDef,
    private region: Region,
    opts: CritterOpts,
  ) {
    this.opts = opts;
    this.kind = opts.kind;
    this.name = opts.name;
    this.def = opts.def;
    this.escapeAfter = opts.escapeAfter;
    this.isTarget = opts.isTarget ?? false;
    this.pos.set(start.x, this.groundAt(start.x, start.z), start.z);
    this.heading = rng() * Math.PI * 2;

    scene.add(this.mesh);

    this.body = phys.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y, this.pos.z),
    );
    phys.world.createCollider(RAPIER.ColliderDesc.ball(opts.radius).setCollisionGroups(CHICKEN_GROUPS), this.body);
    this.body.userData = { grabbable: this } satisfies GrabbableUserData;
    phys.register(this.body, this.mesh);
    this.enter('IDLE');
  }

  /** Body origin height when standing at a point. */
  private groundAt(x: number, z: number): number {
    return (this.opts.groundY?.(x, z) ?? 0) + this.opts.bodyY;
  }

  /** Build the visual parts (origin at the body center). */
  protected abstract buildMesh(): THREE.Object3D;

  /**
   * Subclasses call this at the end of their constructor: class fields are
   * initialised only after the base constructor, so the mesh is built here.
   */
  protected attachMesh(): void {
    this.mesh.add(this.buildMesh());
  }
  /** Per-frame animation. */
  abstract animate(dt: number, t: number): void;

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  onGrab(): void {
    this.held = true;
    this.enter('HELD');
    this.onSquawk?.();
  }

  onRelease(vel: THREE.Vector3Like): void {
    this.held = false;
    const p = this.body.translation();
    this.pos.set(p.x, p.y, p.z);
    this.fallVel.set(vel.x, 0.5, vel.z);
    this.enter('FALLING');
  }

  /** Run at a moving target (e.g. the claw) until stopCharge() or the target is reached. */
  chargeAt(target: () => { x: number; z: number }, speed = 2.5): void {
    if (this.state === 'HELD' || this.state === 'FALLING' || this.state === 'GONE') return;
    this.chargeTarget = target;
    this.chargeSpeed = speed;
    this.reached = false;
    this.enter('CHARGE');
    this.onSquawk?.();
  }

  /** Break off: run away from the target (for `fleeSeconds`, if given), then go back to patrolling. */
  stopCharge(fleeSeconds?: number): void {
    if (this.state !== 'CHARGE') return;
    const t = this.chargeTarget?.();
    this.chargeTarget = null;
    if (t) {
      const fx = this.pos.x - t.x;
      const fz = this.pos.z - t.z;
      const l = Math.hypot(fx, fz) || 1;
      this.fleeDir.set(fx / l, fz / l);
    }
    this.enter('FLEE');
    if (fleeSeconds !== undefined) this.stateDur = fleeSeconds;
  }

  /** Stand still for a set time (a nap, a breather). */
  rest(seconds: number): void {
    if (this.state === 'HELD' || this.state === 'FALLING' || this.state === 'GONE') return;
    this.enter('IDLE');
    this.stateDur = seconds;
  }

  /** Head off to a fresh spot in the region now. */
  wander(): void {
    if (this.state === 'IDLE' || this.state === 'WANDER') this.enter('WANDER');
  }

  get charging(): boolean {
    return this.state === 'CHARGE';
  }

  dispose(): void {
    if (this.removed) return;
    this.removed = true;
    this.phys.removeBody(this.body);
    this.mesh.parent?.remove(this.mesh);
  }

  protected enter(s: CritterState): void {
    this.state = s;
    this.stateT = 0;
    if (s === 'IDLE') this.stateDur = randRange(this.rng, this.opts.idleTime[0], this.opts.idleTime[1]);
    if (s === 'FLEE') this.stateDur = randRange(this.rng, 1.0, 1.6);
    if (s === 'WANDER') {
      this.pickTarget();
      this.bestDist = Infinity;
      this.bestT = 0;
    }
    this.onEnter(s);
  }

  /** Subclass hook: a state was just entered. */
  protected onEnter(_s: CritterState): void {}

  private get holeX(): number { return this.level.origin.x + LAYOUT.HOLE.x; }
  private get holeZ(): number { return this.level.origin.z + LAYOUT.HOLE.z; }

  private inHoleZone(x: number, z: number, pad: number): boolean {
    const { HOLE } = LAYOUT;
    return Math.abs(x - this.holeX) < HOLE.half + pad && Math.abs(z - this.holeZ) < HOLE.half + pad;
  }

  private pickTarget(): void {
    // Prefer a spot reachable in a straight line; settle for any free spot.
    let fallback: { x: number; z: number } | null = null;
    for (let i = 0; i < 24; i++) {
      const p = this.region.random(this.rng);
      if (this.inHoleZone(p.x, p.z, 0.55)) continue;
      const mid = { x: (p.x + this.pos.x) / 2, z: (p.z + this.pos.z) / 2 };
      if (this.inHoleZone(mid.x, mid.z, 0.3)) continue;
      // Don't aim at a spot that is currently occupied.
      if (this.lastObstacles.some((o) => Math.hypot(p.x - o.x, p.z - o.z) < o.r + 0.1)) continue;
      if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 0.4) continue;
      if (this.pathClear(p.x, p.z)) { this.target = p; return; }
      fallback ??= p;
    }
    this.target = fallback ?? { x: this.pos.x, z: this.pos.z };
  }

  /** Obstacle radius as this critter currently sees it (soft ones shrink while barging through). */
  private radiusOf(ob: Obstacle): number {
    return ob.soft && this.bargeT > 0 ? ob.r * 0.65 : ob.r;
  }

  /** Whether the straight walk to a point misses every obstacle (ones it already stands in are ignored). */
  private pathClear(tx: number, tz: number): boolean {
    const vx = tx - this.pos.x;
    const vz = tz - this.pos.z;
    const len2 = vx * vx + vz * vz || 1;
    for (const ob of this.lastObstacles) {
      const r = this.radiusOf(ob);
      const ox = ob.x - this.pos.x;
      const oz = ob.z - this.pos.z;
      if (Math.hypot(ox, oz) < r) continue;
      const t = clamp((ox * vx + oz * vz) / len2, 0, 1);
      if (Math.hypot(ox - vx * t, oz - vz * t) < r + 0.05) return false;
    }
    return true;
  }

  /**
   * Context steering: score a fan of headings by how well they serve the
   * wanted direction and how much they run into obstacles, walls or the open
   * hatch over a short look-ahead, and return the best one. Unlike nudging the
   * wanted direction, this always finds the gap around a cluster of
   * obstacles and slides along walls instead of pushing into them.
   */
  private steer(wx: number, wz: number, obstacles: Obstacle[], look: number): { x: number; z: number } {
    const N = 16;
    let bestScore = -Infinity;
    let bx = wx;
    let bz = wz;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const cx = Math.sin(a);
      const cz = Math.cos(a);
      let danger = 0;
      for (const ob of obstacles) {
        const r = this.radiusOf(ob);
        const ox = ob.x - this.pos.x;
        const oz = ob.z - this.pos.z;
        const d = Math.hypot(ox, oz);
        if (d > r + look + 0.2) continue;
        const proj = ox * cx + oz * cz;
        if (proj <= 0) continue;
        const t = Math.min(proj, look);
        const clearance = Math.hypot(ox - cx * t, oz - cz * t) - r;
        if (clearance >= 0.18) continue;
        // Close-by blockers matter more than ones at the edge of the look-ahead.
        const near = 1 - 0.5 * (t / look);
        danger = Math.max(danger, (1 - Math.max(0, clearance) / 0.18) * near);
      }
      // Walls (the region edge) and the hatch, probed at two distances.
      for (const [f, w] of [[0.35, 1], [1, 0.6]] as const) {
        const px = this.pos.x + cx * look * f;
        const pz = this.pos.z + cz * look * f;
        const c = this.region.clamp(px, pz);
        if (Math.abs(c.x - px) + Math.abs(c.z - pz) > 0.01 || this.inHoleZone(px, pz, 0.3)) danger = Math.max(danger, w);
      }
      const interest = cx * wx + cz * wz;
      const keep = Math.cos(a - this.heading) * 0.15;
      const score = interest + keep - danger * 2.2;
      if (score > bestScore) { bestScore = score; bx = cx; bz = cz; }
    }
    return { x: bx, z: bz };
  }

  /** Turn toward a direction (rad/s limited) and walk along the heading. */
  private moveToward(dx: number, dz: number, speed: number, turn: number, dt: number): void {
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += clamp(diff, -turn * dt, turn * dt);
    // Slow down while turning hard so it doesn't plough into what it is avoiding.
    const pace = speed * (0.45 + 0.55 * Math.max(0, Math.cos(diff)));
    this.pos.x += Math.sin(this.heading) * pace * dt;
    this.pos.z += Math.cos(this.heading) * pace * dt;
    this.walkPhase += pace * dt * 14;
  }

  /** Give up on the current walk when no ground is being covered. */
  private checkProgress(dt: number): void {
    const moving = this.state === 'WANDER' || this.state === 'FLEE';
    if (!moving) { this.progressT = 0; this.progressPos.set(this.pos.x, this.pos.z); return; }
    this.progressT += dt;
    if (this.progressT < 0.8) return;
    const moved = Math.hypot(this.pos.x - this.progressPos.x, this.pos.z - this.progressPos.y);
    this.progressT = 0;
    this.progressPos.set(this.pos.x, this.pos.z);
    const expected = (this.state === 'FLEE' ? this.opts.fleeSpeed : this.opts.walkSpeed) * 0.8;
    if (moved < Math.min(0.1, expected * 0.3)) {
      this.stuckStrikes++;
      // Head somewhere new (pickTarget prefers a clear straight path); after
      // repeated strikes it is boxed in, so shoulder past loose prizes for a bit.
      if (this.stuckStrikes >= 3) {
        this.stuckStrikes = 0;
        this.unwedge();
      }
      this.enter('WANDER');
    } else if (moved > expected * 0.6) {
      // Only a real stretch of walking clears the record, not a shuffle in place.
      this.stuckStrikes = 0;
    }
  }

  /** Step straight out of a tight spot: toward the side with the most room. */
  private unwedge(): void {
    this.bargeT = 2.5;
    const dir = this.steer(0, 0, this.lastObstacles, 0.6);
    this.heading = Math.atan2(dir.x, dir.z);
    this.pos.x += dir.x * 0.08;
    this.pos.z += dir.z * 0.08;
  }

  /** Physics substep: drives the kinematic body. */
  step(dt: number, obstacles: Obstacle[], clawXZ: { x: number; z: number }, clawDescending: boolean, holeOpen: boolean): void {
    if (this.removed || this.state === 'HELD' || this.state === 'GONE') return;
    this.stateT += dt;
    this.bargeT = Math.max(0, this.bargeT - dt);
    const o = this.opts;
    this.lastObstacles = obstacles;

    const clawDist = Math.hypot(this.pos.x - clawXZ.x, this.pos.z - clawXZ.z);
    if ((o.freezes ?? true) && clawDescending && clawDist < 0.7 && this.state !== 'FALLING' && this.state !== 'FREEZE' && this.state !== 'CHARGE') this.enter('FREEZE');

    switch (this.state) {
      case 'IDLE':
        if (this.stateT >= this.stateDur) this.enter('WANDER');
        break;
      case 'FREEZE':
        if (!clawDescending && this.stateT > 0.3) {
          const fx = this.pos.x - clawXZ.x;
          const fz = this.pos.z - clawXZ.z;
          const l = Math.hypot(fx, fz) || 1;
          this.fleeDir.set(fx / l, fz / l);
          this.enter('FLEE');
        }
        break;
      case 'WANDER':
      case 'FLEE': {
        const speed = this.state === 'FLEE' ? o.fleeSpeed : o.walkSpeed;
        let dx: number;
        let dz: number;
        if (this.state === 'FLEE') {
          if (this.stateT >= this.stateDur) { this.enter('IDLE'); break; }
          dx = this.fleeDir.x;
          dz = this.fleeDir.y;
        } else {
          dx = this.target.x - this.pos.x;
          dz = this.target.z - this.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.12 || this.stateT > 7) { this.enter('IDLE'); break; }
          // Walking but not getting any closer (circling a blocked spot): choose again.
          if (dist < this.bestDist - 0.15) { this.bestDist = dist; this.bestT = this.stateT; }
          else if (this.stateT - this.bestT > 2.5) { this.enter('WANDER'); break; }
          dx /= dist;
          dz /= dist;
        }
        const dir = this.steer(dx, dz, obstacles, 0.35 + speed * 0.35);
        if (this.state === 'FLEE') {
          // Keep running the way that is actually open rather than back into a wall.
          const k = Math.min(1, dt * 4);
          this.fleeDir.set(this.fleeDir.x + (dir.x - this.fleeDir.x) * k, this.fleeDir.y + (dir.z - this.fleeDir.y) * k).normalize();
        }
        this.moveToward(dir.x, dir.z, speed, 7, dt);
        break;
      }
      case 'CHARGE': {
        const t = this.chargeTarget?.();
        if (!t) { this.enter('IDLE'); break; }
        let dx = t.x - this.pos.x;
        let dz = t.z - this.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.42) {
          if (!this.reached) { this.reached = true; this.onReach?.(); }
          break;
        }
        dx /= dist;
        dz /= dist;
        // Close in directly at the end; route around things on the way.
        const dir = dist < 0.8 ? { x: dx, z: dz } : this.steer(dx, dz, obstacles, Math.min(dist, 0.5 + this.chargeSpeed * 0.25));
        this.moveToward(dir.x, dir.z, this.chargeSpeed, 10, dt);
        break;
      }
      case 'FALLING': {
        this.fallVel.y -= 9.81 * dt;
        this.pos.addScaledVector(this.fallVel, dt);
        const overPit = holeOpen && this.inHoleZone(this.pos.x, this.pos.z, -0.08);
        if (overPit) {
          if (this.pos.y < -0.9) {
            this.fellInHole = true;
            this.enter('GONE');
          }
        } else if (this.pos.y <= this.groundAt(this.pos.x, this.pos.z)) {
          this.pos.y = this.groundAt(this.pos.x, this.pos.z);
          const fx = this.pos.x - clawXZ.x;
          const fz = this.pos.z - clawXZ.z;
          const l = Math.hypot(fx, fz) || 1;
          this.fleeDir.set(fx / l, fz / l);
          this.enter('FLEE');
          this.onSquawk?.();
        }
        break;
      }
      default:
        break;
    }

    if (this.state === 'WANDER' || this.state === 'FLEE' || this.state === 'IDLE' || this.state === 'FREEZE' || this.state === 'CHARGE') {
      for (const ob of obstacles) {
        const ox = this.pos.x - ob.x;
        const oz = this.pos.z - ob.z;
        const d = Math.hypot(ox, oz);
        const r = this.radiusOf(ob);
        if (d < r && d > 1e-4) {
          const push = r - d;
          this.pos.x += (ox / d) * push;
          this.pos.z += (oz / d) * push;
        }
      }
      if (this.inHoleZone(this.pos.x, this.pos.z, 0.35)) {
        const ox = this.pos.x - this.holeX;
        const oz = this.pos.z - this.holeZ;
        const d = Math.hypot(ox, oz) || 1;
        this.pos.x += (ox / d) * 2.4 * dt;
        this.pos.z += (oz / d) * 2.4 * dt;
        if (this.state !== 'FLEE') { this.fleeDir.set(ox / d, oz / d); this.enter('FLEE'); }
      }
      const c = this.region.clamp(this.pos.x, this.pos.z);
      this.pos.x = c.x;
      this.pos.z = c.z;
      this.pos.y = this.groundAt(this.pos.x, this.pos.z);
    }

    this.checkProgress(dt);
    this.body.setNextKinematicTranslation(this.pos);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading + (o.headingOffset ?? 0));
    this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  }
}
