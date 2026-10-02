import * as THREE from 'three';
import { plastic } from '../scene/Materials';
import { Critter, type Region } from './Critter';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { LevelDef } from '../game/Levels';
import { damp } from '../util/math';
import { lagoonProfile } from '../game/Levels';

export type CrabVariant = 'red' | 'diamond';

/**
 * A beach crab that scuttles sideways and snaps its claws. The diamond
 * variant is a treasure: faceted crystal shell, slower, and it holds on to
 * the claw long enough to be carried to the hatch.
 */
export class Crab extends Critter {
  private claws: THREE.Group[] = [];
  private pincers: THREE.Mesh[] = [];
  private legs: THREE.Group[] = [];
  private eyes: THREE.Group[] = [];
  private shell!: THREE.Group;
  private snapT = 0;
  private wave = 0;

  constructor(
    scene: THREE.Scene, phys: PhysicsWorld, start: { x: number; z: number }, rng: () => number, level: LevelDef, region: Region,
    readonly variant: CrabVariant = 'red',
  ) {
    const L = level.lagoon;
    const groundY = L
      ? (x: number, z: number) => lagoonProfile(Math.hypot((x - level.origin.x - L.x) / L.rx, (z - level.origin.z - L.z) / L.rz))
      : undefined;
    super(scene, phys, start, rng, level, region, variant === 'diamond'
      ? {
        kind: 'diamondcrab', name: 'Diamond Crab', def: { top: 0.2, bottom: 0.13, grip: 0.75 },
        bodyY: 0.13, walkSpeed: 0.3, fleeSpeed: 0.9, radius: 0.2, escapeAfter: 4.5, idleTime: [1.0, 2.5], isTarget: true, headingOffset: Math.PI / 2, groundY,
      }
      : {
        kind: 'crab', name: 'Crab', def: { top: 0.18, bottom: 0.13, grip: 0.6 },
        bodyY: 0.13, walkSpeed: 0.7, fleeSpeed: 1.9, radius: 0.18, escapeAfter: 2.2, idleTime: [0.6, 2.0], headingOffset: Math.PI / 2,
      });
    this.attachMesh();
  }

  /** Build geometry for the HUD icon without a physics body. */
  static buildIconMesh(variant: CrabVariant): THREE.Group {
    const g = new THREE.Group();
    const proto = Object.create(Crab.prototype) as Crab;
    (proto as unknown as { variant: CrabVariant }).variant = variant;
    g.add(proto.buildMesh());
    return g;
  }

  protected buildMesh(): THREE.Object3D {
    const diamond = this.variant === 'diamond';
    const shellMat = diamond
      ? plastic(0xf2fdff, { roughness: 0.1, metalness: 0.1, emissive: 0x5fdcff, emissiveIntensity: 0.5, flat: true })
      : plastic(0xff5a3c, { roughness: 0.45 });
    const limbMat = diamond ? plastic(0xbff3ff, { roughness: 0.15, emissive: 0x3fc6f0, emissiveIntensity: 0.45 }) : plastic(0xe8472c, { roughness: 0.5 });
    const black = plastic(0x222233, { roughness: 0.4 });
    const root = new THREE.Group();
    this.shell = new THREE.Group();
    const body = diamond
      ? new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), shellMat)
      : new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), shellMat);
    body.scale.set(1.35, 0.6, 1.0);
    body.castShadow = true;
    this.shell.add(body);
    // Eye stalks at the front (+Z)
    this.eyes = [];
    for (const side of [-1, 1]) {
      const stalk = new THREE.Group();
      stalk.position.set(side * 0.07, 0.07, 0.12);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.09, 6), limbMat);
      stem.position.y = 0.04;
      stalk.add(stem);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), black);
      eye.position.y = 0.09;
      stalk.add(eye);
      this.shell.add(stalk);
      this.eyes.push(stalk);
    }
    // Claws at front-left / front-right
    this.claws = [];
    this.pincers = [];
    for (const side of [-1, 1]) {
      const claw = new THREE.Group();
      claw.position.set(side * 0.17, 0.0, 0.1);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.1, 3, 8), limbMat);
      arm.rotation.z = side * 0.6;
      arm.rotation.x = -0.9;
      arm.position.set(side * 0.04, 0.0, 0.05);
      claw.add(arm);
      const pincer = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), shellMat);
      pincer.scale.set(1.0, 0.7, 1.3);
      pincer.position.set(side * 0.08, 0.02, 0.13);
      pincer.castShadow = true;
      claw.add(pincer);
      const thumb = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 6), shellMat);
      thumb.rotation.x = Math.PI / 2;
      thumb.position.set(side * 0.1, 0.05, 0.18);
      claw.add(thumb);
      root.add(claw);
      this.claws.push(claw);
      this.pincers.push(pincer);
    }
    // Three legs per side
    this.legs = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const leg = new THREE.Group();
        leg.position.set(side * 0.16, -0.02, 0.05 - i * 0.07);
        const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.1, 3, 6), limbMat);
        seg.rotation.z = side * 1.1;
        seg.position.set(side * 0.05, -0.02, 0);
        leg.add(seg);
        const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.07, 3, 6), limbMat);
        tip.position.set(side * 0.1, -0.08, 0);
        tip.rotation.z = side * 0.25;
        leg.add(tip);
        root.add(leg);
        this.legs.push(leg);
      }
    }
    root.add(this.shell);
    return root;
  }

  animate(dt: number, t: number): void {
    if (this.removed) return;
    const walking = this.state === 'WANDER' || this.state === 'FLEE';
    const held = this.state === 'HELD';
    const scuttle = walking ? Math.sin(this.walkPhase * 1.4) : held ? Math.sin(t * 24) : 0;
    this.legs.forEach((leg, i) => {
      const phase = i % 2 === 0 ? scuttle : -scuttle;
      leg.rotation.z = phase * 0.35;
      leg.rotation.x = phase * 0.15;
    });
    this.shell.position.y = walking ? Math.abs(Math.sin(this.walkPhase * 1.4)) * 0.015 : 0;
    // Claw snapping while idle, waving when carried or frozen.
    this.snapT += dt;
    const idle = this.state === 'IDLE';
    this.wave = damp(this.wave, held || this.state === 'FREEZE' ? 1 : 0, 8, dt);
    this.claws.forEach((claw, i) => {
      const s = i === 0 ? -1 : 1;
      const snap = idle ? Math.max(0, Math.sin(this.snapT * 6 + i * 1.3)) : 0;
      const waveA = Math.sin(t * 18 + i * 2) * 0.6 * this.wave;
      claw.rotation.x = -snap * 0.5 - this.wave * 0.9 + waveA * 0.3;
      claw.rotation.z = s * waveA;
      this.pincers[i].scale.y = 0.7 + snap * 0.25;
    });
    if (idle && Math.random() < 0.004) this.onChatter?.();
    const look = held ? 0.5 : this.state === 'FREEZE' ? -0.5 : 0;
    for (const e of this.eyes) e.rotation.x = damp(e.rotation.x, look, 8, dt);
  }
}
