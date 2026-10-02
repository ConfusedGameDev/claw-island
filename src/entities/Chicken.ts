import * as THREE from 'three';
import { plastic } from '../scene/Materials';
import { Critter, type Region } from './Critter';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { LevelDef } from '../game/Levels';
import { damp } from '../util/math';

const COL = { white: 0xfff8f0, orange: 0xff9b2f, red: 0xff3b3b, black: 0x222233, feather: 0x2b2b35, featherDark: 0x1a1a22, eyeRed: 0xff3030 };

export type ChickenVariant = 'white' | 'black';

/** A cucco: wanders, pecks, freezes under the claw, flaps when carried. */
export class Chicken extends Critter {
  private head!: THREE.Group;
  private wings: THREE.Mesh[] = [];
  private legs: THREE.Group[] = [];
  private bodyMesh!: THREE.Group;
  private flap = 0;
  private peckT = 0;

  constructor(
    scene: THREE.Scene, phys: PhysicsWorld, start: { x: number; z: number }, rng: () => number, level: LevelDef, region: Region,
    readonly variant: ChickenVariant = 'white',
  ) {
    super(scene, phys, start, rng, level, region, variant === 'black'
      ? {
        kind: 'blackchicken', name: 'Black Cucco', def: { top: 0.22, bottom: 0.2, grip: 0.5 },
        bodyY: 0.2, walkSpeed: 0.9, fleeSpeed: 2.2, radius: 0.18, escapeAfter: 1.2, idleTime: [0.4, 1.2], freezes: false,
      }
      : {
        kind: 'chicken', name: 'Cucco', def: { top: 0.22, bottom: 0.2, grip: 0.6 },
        bodyY: 0.2, walkSpeed: 0.55, fleeSpeed: 1.7, radius: 0.18, escapeAfter: 2.2, idleTime: [0.8, 2.4],
      });
    this.attachMesh();
  }

  protected buildMesh(): THREE.Object3D {
    const dark = this.variant === 'black';
    const white = plastic(dark ? COL.feather : COL.white, { roughness: 0.6 });
    const orange = plastic(COL.orange, { roughness: 0.5 });
    const red = plastic(COL.red, { roughness: 0.5 });
    const black = dark ? plastic(COL.eyeRed, { roughness: 0.3, emissive: COL.eyeRed, emissiveIntensity: 0.6 }) : plastic(COL.black, { roughness: 0.4 });
    const root = new THREE.Group();

    this.bodyMesh = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), white);
    torso.scale.set(1, 0.85, 1.25);
    torso.castShadow = true;
    this.bodyMesh.add(torso);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), white);
    tail.position.set(0, 0.08, -0.2);
    tail.scale.set(0.6, 1.2, 1);
    tail.castShadow = true;
    this.bodyMesh.add(tail);
    this.wings = [];
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), white);
      wing.geometry.translate(0, -0.08, 0);
      wing.scale.set(0.35, 1, 1.1);
      wing.position.set(side * 0.13, 0.06, 0);
      wing.castShadow = true;
      this.bodyMesh.add(wing);
      this.wings.push(wing);
    }
    this.head = new THREE.Group();
    this.head.position.set(0, 0.14, 0.14);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), white);
    skull.castShadow = true;
    this.head.add(skull);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 8), orange);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.01, 0.12);
    this.head.add(beak);
    const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), red);
    wattle.position.set(0, -0.06, 0.08);
    this.head.add(wattle);
    for (const [y, z] of [[0.1, 0.02], [0.11, -0.03], [0.09, -0.07]]) {
      const comb = new THREE.Mesh(new THREE.SphereGeometry(dark ? 0.04 : 0.03, 8, 6), red);
      comb.position.set(0, y, z);
      this.head.add(comb);
    }
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), black);
      eye.position.set(side * 0.06, 0.02, 0.075);
      this.head.add(eye);
    }
    this.bodyMesh.add(this.head);
    root.add(this.bodyMesh);
    this.legs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.05, -0.1, 0);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6), orange);
      shin.position.y = -0.05;
      leg.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.08), orange);
      foot.position.set(0, -0.105, 0.02);
      leg.add(foot);
      root.add(leg);
      this.legs.push(leg);
    }
    return root;
  }

  animate(dt: number, t: number): void {
    if (this.removed) return;
    const walking = this.state === 'WANDER' || this.state === 'FLEE' || this.state === 'CHARGE';
    const held = this.state === 'HELD';
    const legSwing = walking ? Math.sin(this.walkPhase) * 0.7 : held ? Math.sin(t * 20) * 0.5 : 0;
    this.legs[0].rotation.x = legSwing;
    this.legs[1].rotation.x = -legSwing;
    const bob = walking ? Math.abs(Math.sin(this.walkPhase)) * 0.025 : 0;
    this.bodyMesh.position.y = bob;
    this.bodyMesh.rotation.x = walking ? Math.sin(this.walkPhase * 2) * 0.03 : 0;
    if (this.state === 'IDLE') {
      this.peckT += dt;
      const dip = Math.max(0, Math.sin(this.peckT * 9)) * 0.45;
      this.head.rotation.x = dip;
      this.head.position.y = 0.14 - dip * 0.12;
      if (dip > 0.4 && Math.random() < 0.08) this.onChatter?.();
    } else {
      const look = held ? -0.3 : this.state === 'FREEZE' ? -0.6 : this.state === 'CHARGE' ? 0.35 : 0;
      this.head.rotation.x = damp(this.head.rotation.x, look, 10, dt);
      this.head.position.y = damp(this.head.position.y, 0.14, 10, dt);
    }
    const targetFlap = held || this.state === 'FALLING' || this.state === 'CHARGE' ? 1 : 0;
    this.flap = damp(this.flap, targetFlap, 8, dt);
    const flapA = Math.sin(t * 28) * 0.9 * this.flap;
    this.wings[0].rotation.z = 0.15 + flapA;
    this.wings[1].rotation.z = -0.15 - flapA;
  }
}
