import * as THREE from 'three';
import { plastic } from '../scene/Materials';
import { Critter, type Region } from './Critter';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { LevelDef } from '../game/Levels';
import { damp } from '../util/math';

export type GhostVariant = 'plain' | 'crown';

/**
 * A little sheet ghost that drifts over the haunted island. The crowned
 * Ghost King is a treasure: it holds on long enough to be carried.
 */
export class Ghost extends Critter {
  private figure!: THREE.Group;
  private arms: THREE.Mesh[] = [];
  private sheetMat!: THREE.MeshStandardMaterial;
  private phase = Math.random() * 10;

  constructor(
    scene: THREE.Scene, phys: PhysicsWorld, start: { x: number; z: number }, rng: () => number, level: LevelDef, region: Region,
    readonly variant: GhostVariant = 'plain',
  ) {
    super(scene, phys, start, rng, level, region, variant === 'crown'
      ? {
        kind: 'crownghost', name: 'Ghost King', def: { top: 0.26, bottom: 0.2, grip: 0.7 },
        bodyY: 0.32, walkSpeed: 0.35, fleeSpeed: 1.1, radius: 0.2, escapeAfter: 4.5, idleTime: [1.0, 2.2], isTarget: true,
      }
      : {
        kind: 'ghost', name: 'Ghost', def: { top: 0.22, bottom: 0.2, grip: 0.6 },
        bodyY: 0.32, walkSpeed: 0.5, fleeSpeed: 1.6, radius: 0.18, escapeAfter: 2.0, idleTime: [0.6, 1.8],
      });
    this.attachMesh();
  }

  static buildIconMesh(variant: GhostVariant): THREE.Group {
    const proto = Object.create(Ghost.prototype) as Ghost;
    (proto as unknown as { variant: GhostVariant }).variant = variant;
    (proto as unknown as { arms: THREE.Mesh[] }).arms = [];
    const g = new THREE.Group();
    g.add(proto.buildMesh());
    return g;
  }

  protected buildMesh(): THREE.Object3D {
    const crown = this.variant === 'crown';
    this.sheetMat = new THREE.MeshStandardMaterial({
      color: crown ? 0xfff8e0 : 0xf4f6ff, roughness: 0.35, transparent: true, opacity: 0.88,
      emissive: crown ? 0x6a5a20 : 0x3a4a7a, emissiveIntensity: 0.35,
    });
    const s = crown ? 1.15 : 1;
    this.figure = new THREE.Group();
    // Rounded head + skirt with a wavy hem, as one lathe profile.
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.sin(a) * 0.15, 0.08 + Math.cos(a) * 0.15));
    }
    pts.reverse();
    pts.push(new THREE.Vector2(0.16, -0.05), new THREE.Vector2(0.17, -0.16), new THREE.Vector2(0.0, -0.16));
    const sheet = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), this.sheetMat);
    sheet.castShadow = true;
    this.figure.add(sheet);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), this.sheetMat);
      tail.position.set(Math.cos(a) * 0.13, -0.17, Math.sin(a) * 0.13);
      tail.scale.y = 0.8;
      this.figure.add(tail);
    }
    const dark = plastic(0x1a1a22, { roughness: 0.3 });
    for (const x of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), dark);
      eye.position.set(x * 0.055, 0.12, 0.135);
      eye.scale.y = 1.4;
      this.figure.add(eye);
    }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), dark);
    mouth.position.set(0, 0.05, 0.145);
    mouth.scale.set(1, 1.3, 0.6);
    this.figure.add(mouth);
    this.arms = [];
    for (const x of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.07, 3, 8), this.sheetMat);
      arm.position.set(x * 0.17, 0.0, 0.02);
      arm.rotation.z = x * 0.9;
      this.figure.add(arm);
      this.arms.push(arm);
    }
    if (crown) {
      const gold = plastic(0xffc928, { roughness: 0.2, metalness: 0.6 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.05, 16, 1, true), gold);
      band.position.y = 0.25;
      this.figure.add(band);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 6), gold);
        spike.position.set(Math.cos(a) * 0.08, 0.3, Math.sin(a) * 0.08);
        this.figure.add(spike);
      }
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.025), plastic(0xe8384b, { emissive: 0xe8384b, emissiveIntensity: 0.6 }));
      gem.position.set(0, 0.25, 0.09);
      this.figure.add(gem);
    }
    this.figure.scale.setScalar(s);
    return this.figure;
  }

  animate(dt: number, t: number): void {
    if (this.removed) return;
    const held = this.state === 'HELD';
    this.figure.position.y = Math.sin(t * 2.2 + this.phase) * 0.04;
    this.figure.rotation.z = Math.sin(t * 1.3 + this.phase) * 0.08;
    const flail = held ? Math.sin(t * 18) * 0.6 : Math.sin(t * 3 + this.phase) * 0.25;
    this.arms[0].rotation.z = -0.9 - flail;
    this.arms[1].rotation.z = 0.9 + flail;
    // Flickers a little; fades when spooked.
    const target = this.state === 'FLEE' ? 0.55 : 0.88;
    this.sheetMat.opacity = damp(this.sheetMat.opacity, target + Math.sin(t * 7 + this.phase) * 0.04, 6, dt);
  }
}
