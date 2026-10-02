import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { LAYOUT } from '../game/Layout';
import { PhysicsWorld, CHICKEN_GROUPS } from '../physics/PhysicsWorld';
import type { Grabbable, GrabbableUserData, GrabDef } from './Grabbable';
import type { LevelDef } from '../game/Levels';
import { clamp, randRange } from '../util/math';

export interface Obstacle { x: number; z: number; r: number }

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

export type CritterState = 'WANDER' | 'IDLE' | 'HELD' | 'FALLING' | 'FLEE' | 'FREEZE' | 'GONE';

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

  protected pos = new THREE.Vector3();
  protected heading = 0;
  protected walkPhase = 0;
  protected stateT = 0;
  private target = { x: 0, z: 0 };
  private stateDur = 1;
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
    if (s === 'WANDER') this.pickTarget();
  }

  private get holeX(): number { return this.level.origin.x + LAYOUT.HOLE.x; }
  private get holeZ(): number { return this.level.origin.z + LAYOUT.HOLE.z; }

  private inHoleZone(x: number, z: number, pad: number): boolean {
    const { HOLE } = LAYOUT;
    return Math.abs(x - this.holeX) < HOLE.half + pad && Math.abs(z - this.holeZ) < HOLE.half + pad;
  }

  private pickTarget(): void {
    for (let i = 0; i < 12; i++) {
      const p = this.region.random(this.rng);
      if (this.inHoleZone(p.x, p.z, 0.55)) continue;
      const mid = { x: (p.x + this.pos.x) / 2, z: (p.z + this.pos.z) / 2 };
      if (this.inHoleZone(mid.x, mid.z, 0.3)) continue;
      this.target = p;
      return;
    }
    this.target = { x: this.pos.x, z: this.pos.z };
  }

  /** Physics substep: drives the kinematic body. */
  step(dt: number, obstacles: Obstacle[], clawXZ: { x: number; z: number }, clawDescending: boolean, holeOpen: boolean): void {
    if (this.removed || this.state === 'HELD' || this.state === 'GONE') return;
    this.stateT += dt;
    const o = this.opts;

    const clawDist = Math.hypot(this.pos.x - clawXZ.x, this.pos.z - clawXZ.z);
    if (clawDescending && clawDist < 0.7 && this.state !== 'FALLING' && this.state !== 'FREEZE') this.enter('FREEZE');

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
          dx = this.fleeDir.x;
          dz = this.fleeDir.y;
          if (this.stateT >= this.stateDur) { this.enter('IDLE'); break; }
        } else {
          dx = this.target.x - this.pos.x;
          dz = this.target.z - this.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.12) { this.enter('IDLE'); break; }
          dx /= dist;
          dz /= dist;
        }
        const want = Math.atan2(dx, dz);
        let diff = want - this.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.heading += clamp(diff, -6 * dt, 6 * dt);
        this.pos.x += Math.sin(this.heading) * speed * dt;
        this.pos.z += Math.cos(this.heading) * speed * dt;
        this.walkPhase += speed * dt * 14;
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

    if (this.state === 'WANDER' || this.state === 'FLEE' || this.state === 'IDLE' || this.state === 'FREEZE') {
      for (const ob of obstacles) {
        const ox = this.pos.x - ob.x;
        const oz = this.pos.z - ob.z;
        const d = Math.hypot(ox, oz);
        if (d < ob.r && d > 1e-4) {
          const push = ob.r - d;
          this.pos.x += (ox / d) * push;
          this.pos.z += (oz / d) * push;
          if (this.state === 'WANDER' && this.stateT > 0.5) this.pickTarget();
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

    this.body.setNextKinematicTranslation(this.pos);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading + (o.headingOffset ?? 0));
    this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  }
}
