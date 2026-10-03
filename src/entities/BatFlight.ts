import * as THREE from 'three';
import type { Collectible } from './Collectible';
import { LAYOUT } from '../game/Layout';
import { randRange } from '../util/math';

type BatState = 'REST' | 'FLY' | 'HOVER';

export interface BatFlightEnv {
  origin: { x: number; z: number };
  /** Gate stations (island-local) to keep clear of. */
  zones: { x: number; z: number; r: number }[];
  clawPos: { x: number; z: number };
  /** The claw is coming down (or closing): bats near it hold still so they can be caught. */
  descending: boolean;
  /** The island's gravity multiplier, restored whenever the bat stops flying. */
  gravity: number;
}

const HOVER_Y = 0.3;
const SPEED = 0.6;
const yAxis = new THREE.Vector3(0, 1, 0);
const quat = new THREE.Quaternion();

/**
 * Makes a bat prize flutter around the pen just above the floor. It stays an
 * ordinary Collectible (scoring, the hatch and the watchdog are unchanged):
 * this only steers its body while it is loose, and hands it back to gravity
 * whenever it is grabbed, dropped or outside the pen.
 */
export class BatFlight {
  private state: BatState = 'REST';
  private t = 0;
  private dur = randRange(Math.random, 0.6, 1.5);
  private target = { x: 0, z: 0 };
  private yaw = 0;
  private wasHeld = false;
  private flap = Math.random() * 10;
  private wings: THREE.Object3D[] = [];
  private last = new THREE.Vector3();

  constructor(private bat: Collectible, private rng: () => number) {
    bat.mesh.traverse((o) => { if (o.name === 'wing') this.wings.push(o); });
    const r = bat.body.rotation();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
    this.yaw = Math.atan2(fwd.x, fwd.z);
  }

  /** Physics substep. */
  step(dt: number, env: BatFlightEnv): void {
    const b = this.bat;
    if (b.removed) return;
    if (b.held) { this.wasHeld = true; return; }
    if (this.wasHeld) {
      // Just let go: fall like any prize (maybe into the hatch), fly again after landing.
      this.wasHeld = false;
      this.land(env);
    }
    this.t += dt;
    const p = b.body.translation();
    const lx = p.x - env.origin.x;
    const lz = p.z - env.origin.z;
    const { FENCE } = LAYOUT;
    const inPen = Math.abs(lx) < FENCE.hx - 0.3 && Math.abs(lz) < FENCE.hz - 0.3 && p.y > -0.2;

    if (this.state === 'REST') {
      // Judge by how far it actually moved (a resting body can report stale velocity).
      const moved = Math.hypot(p.x - this.last.x, p.y - this.last.y, p.z - this.last.z) / Math.max(dt, 1e-4);
      this.last.set(p.x, p.y, p.z);
      const settled = moved < 0.15 && p.y < 0.5;
      if (!settled) this.t = 0;
      if (this.t >= this.dur && inPen) this.takeOff(env, lx, lz);
      return;
    }
    if (!inPen) { this.land(env); return; }

    const clawNear = env.descending && Math.hypot(p.x - env.clawPos.x, p.z - env.clawPos.z) < 0.7;
    let vx = 0;
    let vz = 0;
    if (this.state === 'FLY' && !clawNear) {
      const dx = this.target.x - lx;
      const dz = this.target.z - lz;
      const d = Math.hypot(dx, dz);
      if (d < 0.15 || this.t >= this.dur) {
        this.enter('HOVER', 1, 2);
      } else {
        vx = (dx / d) * SPEED;
        vz = (dz / d) * SPEED;
      }
    } else if (this.state === 'HOVER' && this.t >= this.dur && !clawNear) {
      this.pickTarget(env, lx, lz);
      this.enter('FLY', 3, 5);
    }
    // Never hang over the hatch.
    if (this.nearHole(lx, lz, 0.35)) {
      const ox = lx - LAYOUT.HOLE.x;
      const oz = lz - LAYOUT.HOLE.z;
      const l = Math.hypot(ox, oz) || 1;
      vx += (ox / l) * 0.8;
      vz += (oz / l) * 0.8;
    }
    if (Math.hypot(vx, vz) > 0.05) {
      const want = Math.atan2(vx, vz);
      let diff = want - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += Math.max(-5 * dt, Math.min(5 * dt, diff));
    }
    const bobY = HOVER_Y + Math.sin(this.flap * 0.35) * 0.05;
    b.body.setLinvel({ x: vx, y: (bobY - p.y) * 4, z: vz }, true);
    b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    quat.setFromAxisAngle(yAxis, this.yaw);
    b.body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
  }

  /** Per-frame wing animation. */
  animate(dt: number): void {
    const flying = this.state !== 'REST' && !this.bat.held;
    this.flap += dt * (flying ? 16 : this.bat.held ? 24 : 0);
    const a = flying || this.bat.held ? Math.sin(this.flap) * 0.6 : 0;
    for (const w of this.wings) w.rotation.z = (w.userData.side as number) * a;
  }

  private nearHole(lx: number, lz: number, pad: number): boolean {
    const { HOLE } = LAYOUT;
    return Math.abs(lx - HOLE.x) < HOLE.half + pad && Math.abs(lz - HOLE.z) < HOLE.half + pad;
  }

  private enter(s: BatState, min: number, max: number): void {
    this.state = s;
    this.t = 0;
    this.dur = randRange(this.rng, min, max);
  }

  private takeOff(env: BatFlightEnv, lx: number, lz: number): void {
    this.bat.body.setGravityScale(0, true);
    this.pickTarget(env, lx, lz);
    this.enter('FLY', 3, 5);
  }

  private land(env: BatFlightEnv): void {
    if (this.state !== 'REST') this.bat.body.setGravityScale(env.gravity, true);
    this.enter('REST', 0.6, 1.5);
  }

  /** A spot in the pen clear of the hatch and the gate stations, and not right on top of itself. */
  private pickTarget(env: BatFlightEnv, lx: number, lz: number): void {
    const { FENCE } = LAYOUT;
    for (let i = 0; i < 20; i++) {
      const x = randRange(this.rng, -(FENCE.hx - 0.6), FENCE.hx - 0.6);
      const z = randRange(this.rng, -(FENCE.hz - 0.6), FENCE.hz - 0.6);
      if (this.nearHole(x, z, 0.5)) continue;
      if (this.nearHole((x + lx) / 2, (z + lz) / 2, 0.3)) continue;
      if (env.zones.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + 0.3)) continue;
      if (Math.hypot(x - lx, z - lz) < 0.8) continue;
      this.target = { x, z };
      return;
    }
    this.target = { x: lx, z: lz };
  }
}

/** True for prizes that fly (see BatFlight). */
export const FLYING_KINDS = new Set(['bat']);
