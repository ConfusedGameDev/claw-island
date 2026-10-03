import * as THREE from 'three';
import { plastic } from '../scene/Materials';
import { Critter, type Region } from './Critter';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { LevelDef } from '../game/Levels';
import { damp } from '../util/math';

const SKIN = 0x93c98a;
const SUIT = 0x2f2a44;
const INK = 0x231a2b;

/**
 * The gate guard: a lumbering toy Frankenstein's monster. He patrols near the
 * lock and, whenever the claw carries the key, stomps after it with his arms
 * out. Too heavy to lift. Reaching the claw knocks the key loose.
 */
export class Frankenstein extends Critter {
  /** Seconds of dizziness left after a successful swipe. */
  dizzy = 0;
  readonly tooHeavy = true;
  private arms: THREE.Group[] = [];
  private legs: THREE.Group[] = [];
  private torso!: THREE.Group;
  private stars!: THREE.Group;

  constructor(scene: THREE.Scene, phys: PhysicsWorld, start: { x: number; z: number }, rng: () => number, level: LevelDef, region: Region) {
    super(scene, phys, start, rng, level, region, {
      kind: 'frankenstein', name: 'Frankenstein', def: { top: 0.95, bottom: 0.0, grip: 0 },
      bodyY: 0, walkSpeed: 0.45, fleeSpeed: 0.9, radius: 0.32, escapeAfter: 0.1, idleTime: [0.6, 1.6], freezes: false,
    });
    this.attachMesh();
  }

  protected buildMesh(): THREE.Object3D {
    const root = new THREE.Group();
    const skin = plastic(SKIN, { roughness: 0.6 });
    const suit = plastic(SUIT, { roughness: 0.7 });
    const ink = plastic(INK, { roughness: 0.5 });
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // Legs with big boots.
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * 0.14, 0.42, 0);
      add(leg, new THREE.CapsuleGeometry(0.1, 0.2, 4, 10), suit, 0, -0.16, 0);
      add(leg, new THREE.BoxGeometry(0.2, 0.12, 0.3), ink, 0, -0.36, 0.04);
      root.add(leg);
      this.legs.push(leg);
    }
    this.torso = new THREE.Group();
    this.torso.position.y = 0.42;
    add(this.torso, new THREE.BoxGeometry(0.56, 0.5, 0.36), suit, 0, 0.26, 0);
    add(this.torso, new THREE.BoxGeometry(0.2, 0.36, 0.02), plastic(0x6f8a68, { roughness: 0.7 }), 0, 0.3, 0.185);
    // Head: the classic flat top, a fringe, a seam and neck bolts.
    const head = new THREE.Group();
    head.position.y = 0.76;
    add(head, new THREE.BoxGeometry(0.42, 0.44, 0.38), skin, 0, 0.18, 0);
    add(head, new THREE.BoxGeometry(0.44, 0.1, 0.4), ink, 0, 0.42, 0);
    add(head, new THREE.BoxGeometry(0.44, 0.06, 0.08), ink, 0, 0.35, 0.17);
    add(head, new THREE.BoxGeometry(0.3, 0.012, 0.012), ink, 0, 0.3, 0.195);
    for (let i = -2; i <= 2; i++) add(head, new THREE.BoxGeometry(0.012, 0.05, 0.012), ink, i * 0.06, 0.3, 0.197);
    for (const s of [-1, 1]) {
      // Heavy brow over beady eyes.
      add(head, new THREE.BoxGeometry(0.13, 0.03, 0.03), ink, s * 0.1, 0.22, 0.19).rotation.z = s * 0.15;
      add(head, new THREE.SphereGeometry(0.032, 10, 8), plastic(0x1a1420, { roughness: 0.15 }), s * 0.1, 0.17, 0.19);
      const bolt = add(head, new THREE.CylinderGeometry(0.03, 0.03, 0.1, 10), plastic(0x8d93a8, { roughness: 0.3, metalness: 0.6 }), s * 0.25, 0.04, 0);
      bolt.rotation.z = Math.PI / 2;
    }
    add(head, new THREE.BoxGeometry(0.16, 0.02, 0.02), ink, 0, 0.06, 0.195);
    this.torso.add(head);
    // Arms reach forward, the famous stiff-armed stomp.
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(s * 0.34, 0.44, 0);
      add(arm, new THREE.CapsuleGeometry(0.075, 0.34, 4, 10), suit, 0, 0, 0.2).rotation.x = Math.PI / 2;
      add(arm, new THREE.SphereGeometry(0.09, 12, 10), skin, 0, 0, 0.46);
      this.torso.add(arm);
      this.arms.push(arm);
    }
    root.add(this.torso);
    // Dizzy stars, shown after a swipe.
    this.stars = new THREE.Group();
    this.stars.position.y = 1.45;
    for (let i = 0; i < 3; i++) {
      const st = add(this.stars, new THREE.OctahedronGeometry(0.05), plastic(0xffcf4a, { emissive: 0xffcf4a, emissiveIntensity: 0.8 }));
      const a = (i / 3) * Math.PI * 2;
      st.position.set(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22);
    }
    this.stars.visible = false;
    root.add(this.stars);
    root.scale.setScalar(1.15);
    return root;
  }

  animate(dt: number, t: number): void {
    if (this.removed) return;
    this.dizzy = Math.max(0, this.dizzy - dt);
    const walking = this.state === 'WANDER' || this.state === 'FLEE' || this.state === 'CHARGE';
    const swing = walking ? Math.sin(this.walkPhase * 0.6) * 0.5 : 0;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.torso.rotation.z = walking ? Math.sin(this.walkPhase * 0.6) * 0.06 : 0;
    const reach = this.state === 'CHARGE' ? -0.35 + Math.sin(t * 9) * 0.1 : 0.15;
    for (const a of this.arms) a.rotation.x = damp(a.rotation.x, reach, 8, dt);
    this.stars.visible = this.dizzy > 0;
    this.stars.rotation.y = t * 5;
  }
}
